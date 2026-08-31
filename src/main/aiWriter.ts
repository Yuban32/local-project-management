import fs from 'node:fs'
import path from 'node:path'
import { getProject } from './db'
import { getAiLibrary } from './config'
import { resolveGitRoot } from './git'
import { t } from './i18n'
import type { AgentTemplate, AiWriteReport, ProjectAiConfig, SkillDef } from '../shared/types'

/**
 * 项目级 AI 配置落盘：
 * - 启用的技能写入 <root>/.claude/skills/<id>/SKILL.md（确定性内容，重复写入幂等）
 * - 启用的智能体 + 技能汇总写入 <root>/CLAUDE.md 或 AGENTS.md 的「托管区块」，
 *   哨兵注释包裹，绝不覆盖用户手写内容（合并/追加）。
 * 仅由 ipc 'project:writeAiFiles' 调用。
 */

const SKILL_DIR = '.claude'
const SKILLS_DIR = 'skills'
const START_MARK = '<!-- lpm-ai:start -->'
const END_MARK = '<!-- lpm-ai:end -->'

/** 定位已有托管区块（含哨兵），无则 null */
const BLOCK_RE = /<!-- lpm-ai:start -->[\s\S]*?<!-- lpm-ai:end -->/

/** YAML 双引号标量转义（换行转义为 \n，合法） */
function yamlQuote(value: string): string {
  return JSON.stringify(String(value))
}

function buildSkillContent(skill: SkillDef): string {
  const lines = [
    '---',
    `name: ${yamlQuote(skill.name)}`,
    `description: ${yamlQuote(skill.description ?? '')}`
  ]
  if (skill.tags && skill.tags.length > 0) {
    lines.push(`tags: [${skill.tags.map((x) => yamlQuote(x)).join(', ')}]`)
  }
  lines.push('---', '')
  const body = (skill.body ?? '').trim()
  if (body) lines.push(body)
  return lines.join('\n') + '\n'
}

function buildBrief(
  projectName: string,
  agents: { name: string; template: AgentTemplate; override?: { command?: string; model?: string } }[],
  skills: SkillDef[]
): string {
  const lines = [
    START_MARK,
    `# ${projectName} — AI Agent 配置`,
    '',
    '本区块由本地项目管理/启动器托管维护，手写内容请放在区块外。',
    '',
    '## 使用的智能体'
  ]
  if (agents.length === 0) {
    lines.push('- （无）')
  } else {
    for (const a of agents) {
      const command = a.override?.command?.trim() || a.template.command?.trim()
      const model = a.override?.model?.trim() || a.template.model?.trim()
      const detail: string[] = []
      if (command) detail.push(`命令 \`${command}\``)
      if (model) detail.push(`模型 ${model}`)
      lines.push(`- ${a.name}${detail.length > 0 ? `（${detail.join(' · ')}）` : ''}`)
    }
  }
  lines.push('', '## 启用的技能')
  if (skills.length === 0) {
    lines.push('- （无）')
  } else {
    for (const s of skills) lines.push(`- ${s.name}（\`${s.id}\`）`)
  }
  lines.push('', END_MARK)
  return lines.join('\n') + '\n'
}

export async function writeProjectAiFiles(
  projectId: string,
  aiOverride?: ProjectAiConfig
): Promise<AiWriteReport> {
  const record = getProject(projectId)
  if (!record) throw new Error(t('main.projectNotFound'))
  if (!fs.existsSync(record.path)) throw new Error(t('main.dirNotFound'))

  const ai = aiOverride ?? record.typeConfig.ai
  const hasContent =
    (ai?.enabledAgentIds?.length ?? 0) > 0 || (ai?.enabledSkillIds?.length ?? 0) > 0
  if (!ai || !hasContent) throw new Error(t('main.aiNothingEnabled'))

  // 落盘根目录：手动指定 > 仓库根（向上解析，monorepo 子包命中父仓库）> 项目目录
  const manualRoot = ai.root?.trim()
  const root = manualRoot
    ? path.resolve(manualRoot)
    : resolveGitRoot(record.path, record.gitRoot) || record.path
  if (!path.isAbsolute(root) || !fs.existsSync(root)) {
    throw new Error(t('main.aiRootInvalid', { root }))
  }

  const library = getAiLibrary()
  const skillMap = new Map(library.skills.map((s) => [s.id, s]))
  const agentMap = new Map(library.agents.map((a) => [a.id, a]))
  const warnings: string[] = []

  // ── 技能 → .claude/skills/<id>/SKILL.md ──
  const skills: AiWriteReport['skills'] = []
  const enabledSkills: SkillDef[] = []
  const skillsDir = path.join(root, SKILL_DIR, SKILLS_DIR)
  for (const id of ai.enabledSkillIds ?? []) {
    const skill = skillMap.get(id)
    if (!skill) {
      warnings.push(t('main.aiSkillMissing', { id }))
      continue
    }
    const target = path.join(skillsDir, id, 'SKILL.md')
    const existed = fs.existsSync(target)
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    await fs.promises.writeFile(target, buildSkillContent(skill), 'utf-8')
    skills.push({ id, name: skill.name, path: target, action: existed ? 'updated' : 'created' })
    enabledSkills.push(skill)
  }

  // ── 简报 → <root>/<CLAUDE.md|AGENTS.md>（哨兵区块合并） ──
  const briefFile = ai.briefFile === 'AGENTS.md' ? 'AGENTS.md' : 'CLAUDE.md'
  const briefPath = path.join(root, briefFile)
  const agents: AiWriteReport['agents'] = []
  const agentRows: {
    name: string
    template: AgentTemplate
    override?: { command?: string; model?: string }
  }[] = []
  for (const id of ai.enabledAgentIds ?? []) {
    const template = agentMap.get(id)
    if (!template) {
      warnings.push(t('main.aiAgentMissing', { id }))
      continue
    }
    agentRows.push({ name: template.name, template, override: ai.overrides?.[id] })
    agents.push(template.name)
  }
  const brief = buildBrief(record.name, agentRows, enabledSkills)
  let briefAction: AiWriteReport['briefAction']
  if (!fs.existsSync(briefPath)) {
    await fs.promises.writeFile(briefPath, brief, 'utf-8')
    briefAction = 'created'
  } else {
    const existing = await fs.promises.readFile(briefPath, 'utf-8')
    if (BLOCK_RE.test(existing)) {
      await fs.promises.writeFile(briefPath, existing.replace(BLOCK_RE, brief.trimEnd()), 'utf-8')
      briefAction = 'updated'
    } else {
      // 追加时保证与手写内容之间有空行分隔
      const sep = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
      await fs.promises.appendFile(briefPath, `${sep}${brief}`, 'utf-8')
      briefAction = 'appended'
    }
  }

  return { root, briefFile, briefAction, briefPath, skills, agents, warnings }
}