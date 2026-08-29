import fs from 'node:fs'
import path from 'node:path'
import { listProjectPaths } from './db'
import { detectType, getAdapter } from './adapters'
import { findGitRoot, gitInfoAt } from './git'
import { t } from './i18n'
import type { ScanCandidate } from '../shared/types'
import type { InspectResult } from '../shared/api'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  'venv',
  '.venv',
  '__pycache__',
  'target'
])

/**
 * 扫描配置的目录，发现含 package.json 的项目（默认下探 2 层）。
 * 已在列表中的项目标记 imported；含 package.json 的目录不再向下递归。
 */
export async function scanDirectories(scanDirs: string[], depth: number): Promise<ScanCandidate[]> {
  const importedPaths = listProjectPaths()
  const seen = new Set<string>()
  const results: ScanCandidate[] = []

  for (const root of scanDirs) {
    await walk(path.resolve(root), Math.max(0, Math.round(depth)), 0)
  }

  async function walk(dir: string, maxDepth: number, level: number): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      const adapter = await detectType(full)
      if (adapter) {
        const key = path.resolve(full).toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        const candidate = await buildCandidate(full, adapter, importedPaths.has(key))
        if (candidate) results.push(candidate)
        continue
      }
      if (level < maxDepth) await walk(full, maxDepth, level + 1)
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}

async function buildCandidate(
  dir: string,
  adapter: NonNullable<Awaited<ReturnType<typeof detectType>>>,
  imported: boolean
): Promise<ScanCandidate | null> {
  let name = path.basename(dir)
  let typeInfo: ScanCandidate['typeInfo']
  try {
    typeInfo = await adapter.loadInfo(dir)
    const pkg = JSON.parse(await fs.promises.readFile(path.join(dir, 'package.json'), 'utf-8')) as {
      name?: string
    }
    if (pkg.name) name = pkg.name
  } catch {
    // package.json 读取失败仍列出，导入时再报错
  }
  return {
    path: path.resolve(dir),
    name,
    type: adapter.id,
    typeLabel: adapter.label,
    imported,
    typeInfo
  }
}

/** 检查单个目录，返回导入表单预填信息（手动添加流程，含父级 git 仓库检测） */
export async function inspectDirectory(dir: string): Promise<InspectResult> {
  const adapter = await detectType(dir)
  if (!adapter) throw new Error(t('main.typeUnrecognized'))
  const typeInfo = await getAdapter(adapter.id).loadInfo(dir)
  let name = path.basename(dir)
  try {
    const pkg = JSON.parse(await fs.promises.readFile(path.join(dir, 'package.json'), 'utf-8')) as {
      name?: string
    }
    if (pkg.name) name = pkg.name
  } catch {
    // 忽略，使用目录名
  }

  // 父级 git 仓库检测：项目自身就是仓库时不提示
  let parentGitRoot: InspectResult['parentGitRoot'] = null
  const found = findGitRoot(dir)
  if (found && path.resolve(found).toLowerCase() !== path.resolve(dir).toLowerCase()) {
    const info = await gitInfoAt(found)
    parentGitRoot = { path: found, currentBranch: info.currentBranch }
  }

  return { name, type: adapter.id, typeLabel: adapter.label, typeInfo, parentGitRoot }
}
