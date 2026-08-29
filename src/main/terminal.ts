import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { t } from './i18n'
import type { TerminalInfo, TerminalKind } from '../shared/types'

const pexec = promisify(execFile)

/**
 * 在指定目录打开系统终端：
 * - wt        Windows Terminal（wt -d <dir>）
 * - gitbash   Git Bash（git-bash.exe --cd=<dir>）
 * - cmd       独立 cmd 窗口（cmd /k cd /d <dir>）
 * - powershell PowerShell（-NoExit Set-Location）
 * - auto      wt → gitbash → cmd 依次回退
 * 注意：不能加 windowsHide —— 它会给新进程带上 SW_HIDE，导致窗口创建后不可见。
 */

let gitBashCache: string | null | undefined
let wtAvailable: boolean | undefined

function exists(p: string): boolean {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

async function where(name: string): Promise<string | null> {
  try {
    const { stdout } = await pexec('where', [name], { windowsHide: true })
    const first = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean)
    return first ?? null
  } catch {
    return null
  }
}

export async function isWtAvailable(): Promise<boolean> {
  if (wtAvailable === undefined) wtAvailable = (await where('wt.exe')) !== null
  return wtAvailable
}

/** 定位 git-bash.exe：常见安装路径 > 由 where git 推导安装根 */
export async function findGitBash(): Promise<string | null> {
  if (gitBashCache !== undefined) return gitBashCache
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const localAppData = process.env['LOCALAPPDATA'] ?? ''
  const candidates = [
    path.join(programFiles, 'Git', 'git-bash.exe'),
    path.join(programFilesX86, 'Git', 'git-bash.exe'),
    path.join(localAppData, 'Programs', 'Git', 'git-bash.exe')
  ]
  for (const c of candidates) {
    if (exists(c)) {
      gitBashCache = c
      return c
    }
  }
  // ...\Git\cmd\git.exe 或 ...\Git\bin\git.exe → ...\Git\git-bash.exe
  const gitPath = await where('git.exe')
  if (gitPath) {
    const m = gitPath.match(/^(.*)[/\\](?:cmd|bin)[/\\]git\.exe$/i)
    if (m) {
      const candidate = path.join(m[1], 'git-bash.exe')
      if (exists(candidate)) {
        gitBashCache = candidate
        return candidate
      }
    }
  }
  gitBashCache = null
  return null
}

export async function terminalInfo(): Promise<TerminalInfo> {
  return {
    wt: await isWtAvailable(),
    gitbash: await findGitBash(),
    cmd: true,
    powershell: true
  }
}

/** 打开终端；显式指定的终端不可用时抛错，auto 依次回退 */
export async function openTerminal(dir: string, kind: TerminalKind = 'auto'): Promise<void> {
  const cwd = path.resolve(dir)
  if (!exists(cwd)) throw new Error(t('main.dirNotFound'))

  if (process.platform !== 'win32') {
    openUnixTerminal(cwd)
    return
  }

  const chain: TerminalKind[] = kind === 'auto' ? ['wt', 'gitbash', 'cmd'] : [kind]
  for (const k of chain) {
    const opened = await tryOpenWindows(cwd, k)
    if (opened) return
  }
  throw new Error(t('main.terminalNotFound', { terminal: kind }))
}

async function tryOpenWindows(cwd: string, kind: TerminalKind): Promise<boolean> {
  switch (kind) {
    case 'wt': {
      if (!(await isWtAvailable())) return false
      spawnDetached('wt.exe', ['-d', cwd])
      return true
    }
    case 'gitbash': {
      const gitBash = await findGitBash()
      if (!gitBash) return false
      spawnDetached(gitBash, [`--cd=${cwd}`])
      return true
    }
    case 'powershell': {
      spawnDetached('powershell.exe', ['-NoExit', '-Command', `Set-Location -LiteralPath "${cwd}"`])
      return true
    }
    case 'cmd':
    default: {
      const command = cwd.includes(' ') ? `cd /d "${cwd}"` : `cd /d ${cwd}`
      spawnDetached('cmd.exe', ['/k', command])
      return true
    }
  }
}

function spawnDetached(cmd: string, args: string[]): void {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
  child.once('error', () => {
    /* 启动失败由调用方回退/报错 */
  })
  child.unref()
}

function openUnixTerminal(cwd: string): void {
  if (process.platform === 'darwin') {
    spawnDetached('open', ['-a', 'Terminal', cwd])
    return
  }
  // Linux：常见终端依次尝试
  const candidates: Array<{ cmd: string; args: string[] }> = [
    { cmd: 'x-terminal-emulator', args: [`--working-directory=${cwd}`] },
    { cmd: 'gnome-terminal', args: [`--working-directory=${cwd}`] },
    { cmd: 'konsole', args: ['--workdir', cwd] },
    { cmd: 'xfce4-terminal', args: [`--working-directory=${cwd}`] }
  ]
  for (const c of candidates) {
    try {
      const child = spawn(c.cmd, c.args, { detached: true, stdio: 'ignore' })
      child.once('error', () => {
        /* 尝试下一个 */
      })
      child.unref()
      return
    } catch {
      continue
    }
  }
  throw new Error(t('main.terminalNotFound', { terminal: 'terminal' }))
}
