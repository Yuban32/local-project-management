import { getSetting, setSetting } from './db'
import type {
  AgentTemplate,
  AiLibrary,
  AppSettings,
  AutoBackupSettings,
  Language,
  ScanSettings,
  SkillDef,
  TerminalKind
} from '../shared/types'

const SCAN_KEY = 'scan'
const APP_KEY = 'app'
const AI_LIB_KEY = 'aiLibrary'

const TERMINAL_KINDS: TerminalKind[] = ['auto', 'wt', 'gitbash', 'cmd', 'powershell']
const LANGUAGES: Language[] = ['zh-CN', 'en-US']

const DEFAULT_SCAN_SETTINGS: ScanSettings = { scanDirs: [], scanDepth: 2, terminal: 'auto' }

const DEFAULT_AUTO_BACKUP: AutoBackupSettings = { enabled: false, intervalDays: 1, keep: 7 }

const DEFAULT_APP_SETTINGS: AppSettings = { autoBackup: { ...DEFAULT_AUTO_BACKUP } }

export function getAppSettings(): AppSettings {
  try {
    const raw = getSetting(APP_KEY)
    if (!raw) return { ...DEFAULT_APP_SETTINGS, autoBackup: { ...DEFAULT_AUTO_BACKUP } }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const ab = (parsed.autoBackup ?? {}) as Partial<AutoBackupSettings>
    return {
      language:
        parsed.language && LANGUAGES.includes(parsed.language) ? parsed.language : undefined,
      autoBackup: {
        enabled: ab.enabled === true,
        intervalDays: Math.min(30, Math.max(1, Math.round(ab.intervalDays ?? 1))),
        keep: Math.min(50, Math.max(1, Math.round(ab.keep ?? 7)))
      },
      gitPath: parsed.gitPath?.trim() || undefined,
      editorPath: parsed.editorPath?.trim() || undefined
    }
  } catch {
    return { ...DEFAULT_APP_SETTINGS, autoBackup: { ...DEFAULT_AUTO_BACKUP } }
  }
}

export function saveAppSettings(settings: AppSettings): void {
  const language =
    settings.language && LANGUAGES.includes(settings.language) ? settings.language : undefined
  const ab = settings.autoBackup ?? DEFAULT_AUTO_BACKUP
  const autoBackup: AutoBackupSettings = {
    enabled: ab.enabled === true,
    intervalDays: Math.min(30, Math.max(1, Math.round(ab.intervalDays ?? 1))),
    keep: Math.min(50, Math.max(1, Math.round(ab.keep ?? 7)))
  }
  const gitPath = settings.gitPath?.trim() || undefined
  const editorPath = settings.editorPath?.trim() || undefined
  setSetting(APP_KEY, JSON.stringify({ language, autoBackup, gitPath, editorPath }))
}

export function getScanSettings(): ScanSettings {
  try {
    const raw = getSetting(SCAN_KEY)
    if (!raw) return { ...DEFAULT_SCAN_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<ScanSettings>
    return {
      scanDirs: Array.isArray(parsed.scanDirs) ? parsed.scanDirs : [],
      scanDepth: typeof parsed.scanDepth === 'number' ? parsed.scanDepth : 2,
      terminal:
        parsed.terminal && TERMINAL_KINDS.includes(parsed.terminal) ? parsed.terminal : 'auto'
    }
  } catch {
    return { ...DEFAULT_SCAN_SETTINGS }
  }
}

export function saveScanSettings(settings: ScanSettings): void {
  const terminal =
    settings.terminal && TERMINAL_KINDS.includes(settings.terminal) ? settings.terminal : 'auto'
  setSetting(
    SCAN_KEY,
    JSON.stringify({
      scanDirs: settings.scanDirs.map((d) => d.trim()).filter(Boolean),
      scanDepth: Math.min(5, Math.max(0, Math.round(settings.scanDepth))),
      terminal
    })
  )
}

export function getTerminalSetting(): TerminalKind {
  return getScanSettings().terminal ?? 'auto'
}

// ───────────────────────── AI 库（settings 表 'aiLibrary' key） ─────────────────────────

/** 内置智能体模板（首访未落库时作为默认值返回，与 DEFAULT_SCAN_SETTINGS 同模式） */
const DEFAULT_AGENTS: AgentTemplate[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'claude',
    command: 'claude',
    builtin: true,
    brief: '使用 Claude Code 的项目约定：'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    kind: 'cursor',
    command: 'cursor',
    builtin: true,
    brief: '使用 Cursor（Copilot+ 模型）的项目约定：'
  }
]

/** 恢复内置模板时的克隆（避免外部直接改到默认值） */
function cloneDefaultLibrary(): AiLibrary {
  return {
    agents: DEFAULT_AGENTS.map((a) => ({ ...a })),
    skills: []
  }
}

function sanitizeAgent(a: AgentTemplate): AgentTemplate | null {
  const id = a.id?.trim()
  const name = a.name?.trim()
  if (!id || !name) return null
  const kind = a.kind === 'custom' || a.kind === 'cursor' ? a.kind : a.kind === 'claude' ? 'claude' : 'custom'
  return {
    id,
    name,
    kind,
    command: a.command?.trim() || undefined,
    model: a.model?.trim() || undefined,
    brief: a.brief?.trim() || undefined,
    builtin: a.builtin === true
  }
}

function sanitizeSkill(s: SkillDef): SkillDef | null {
  const id = s.id?.trim()
  const name = s.name?.trim()
  if (!id || !name) return null
  return {
    id,
    name,
    description: s.description?.trim() ?? '',
    body: s.body ?? '',
    tags: Array.isArray(s.tags) ? s.tags.map((x) => String(x).trim()).filter(Boolean) : undefined
  }
}

export function getAiLibrary(): AiLibrary {
  try {
    const raw = getSetting(AI_LIB_KEY)
    if (!raw) return cloneDefaultLibrary()
    const parsed = JSON.parse(raw) as Partial<AiLibrary>
    return {
      agents: (Array.isArray(parsed.agents) ? parsed.agents : []).map(sanitizeAgent).filter(
        (x): x is AgentTemplate => x !== null
      ),
      skills: (Array.isArray(parsed.skills) ? parsed.skills : []).map(sanitizeSkill).filter(
        (x): x is SkillDef => x !== null
      )
    }
  } catch {
    return cloneDefaultLibrary()
  }
}

/** 落库并返回清洗后的结果（供渲染层回显） */
export function saveAiLibrary(lib: AiLibrary): AiLibrary {
  const agents = (Array.isArray(lib.agents) ? lib.agents : [])
    .map(sanitizeAgent)
    .filter((x): x is AgentTemplate => x !== null)
  const skills = (Array.isArray(lib.skills) ? lib.skills : [])
    .map(sanitizeSkill)
    .filter((x): x is SkillDef => x !== null)
  const next: AiLibrary = { agents, skills }
  setSetting(AI_LIB_KEY, JSON.stringify(next))
  return next
}

/** 恢复内置模板（仅模板；技能库保留） */
export function restoreDefaultAgents(): AiLibrary {
  return saveAiLibrary({ ...getAiLibrary(), agents: cloneDefaultLibrary().agents })
}
