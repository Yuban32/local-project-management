import fs from 'node:fs'
import path from 'node:path'
import { t } from '../i18n'
import type { PackageManager, TypeInfo } from '../../shared/types'
import type { ProjectTypeAdapter } from './types'

const PACKAGE_JSON = 'package.json'

const START_SCRIPT_RE = /^(dev|start|serve|preview)(:.+)?$/i
const BUILD_SCRIPT_RE = /^(build|pack|package)(:.+)?$/i

const PM_VALUES: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun']

function exists(dir: string, name: string): boolean {
  try {
    return fs.existsSync(path.join(dir, name))
  } catch {
    return false
  }
}

function readPackageJson(dir: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(path.join(dir, PACKAGE_JSON), 'utf-8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * 包管理器自动发现：
 * package.json 的 packageManager 字段 > 锁文件（pnpm/yarn/bun/npm）> 默认 npm
 */
export function detectPackageManager(dir: string): PackageManager {
  const pkg = readPackageJson(dir)
  const pmField = (pkg?.['packageManager'] as string | undefined)?.trim()
  if (pmField) {
    const name = pmField.split('@')[0].split('+')[0].toLowerCase()
    if (PM_VALUES.includes(name as PackageManager)) return name as PackageManager
  }
  if (exists(dir, 'pnpm-lock.yaml')) return 'pnpm'
  if (exists(dir, 'bun.lockb') || exists(dir, 'bun.lock')) return 'bun'
  if (exists(dir, 'yarn.lock')) return 'yarn'
  if (exists(dir, 'package-lock.json')) return 'npm'
  return 'npm'
}

function groupScripts(scripts: string[]): Pick<TypeInfo, 'startScripts' | 'buildScripts'> {
  return {
    startScripts: scripts.filter((s) => START_SCRIPT_RE.test(s)),
    buildScripts: scripts.filter((s) => BUILD_SCRIPT_RE.test(s))
  }
}

/** 从任务日志中解析本地服务地址（vite/webpack/CRA 等均打印 localhost URL） */
export function resolveLocalUrl(logText: string): string | null {
  const re =
    /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\*|\[::1\]|(?:\d{1,3}\.){3}\d{1,3}):\d{2,5}(?:\/[^\s"'<)]*)?/gi
  const matches = logText.match(re)
  if (!matches || matches.length === 0) return null
  // 优先 localhost / 127.0.0.1，取最后一条（最新输出）
  const local = matches.filter((u) => /localhost|127\.0\.0\.1/i.test(u))
  const picked = (local.length > 0 ? local : matches).at(-1)
  if (!picked) return null
  return picked.replace(/\/\/(?:0\.0\.0\.0|\*):(\d+)/i, '//localhost:$1').replace(/[.,;]$/, '')
}

export const nodeAdapter: ProjectTypeAdapter = {
  id: 'node',
  label: 'Node.js',
  implemented: true,

  async detect(dir) {
    return exists(dir, PACKAGE_JSON)
  },

  async loadInfo(dir) {
    const pkg = readPackageJson(dir)
    const scripts = Object.keys((pkg?.['scripts'] as Record<string, string> | undefined) ?? {})
    const grouped = groupScripts(scripts)
    return {
      packageManager: detectPackageManager(dir),
      scripts,
      ...grouped
    }
  },

  buildSpawn(project, scriptId) {
    if (!scriptId.trim()) throw new Error(t('main.emptyScript'))
    const pm = project.typeConfig.packageManager ?? detectPackageManager(project.path)
    const useNvm = project.typeConfig.useNvm === true
    const nodeVersion = project.typeConfig.nodeVersion?.trim()

    // nvm-windows：nvm use 切换全局版本符号链接后执行，shell:true 下经 cmd 解析链式命令
    if (useNvm && nodeVersion) {
      return {
        cmd: 'nvm',
        args: ['use', nodeVersion, '&&', pm, 'run', scriptId],
        cwd: project.path
      }
    }
    // shell: true 下 Windows 通过 cmd 解析 npm.cmd/pnpm.cmd
    return { cmd: pm, args: ['run', scriptId], cwd: project.path }
  },

  resolveBrowserUrl(logText) {
    return resolveLocalUrl(logText)
  }
}
