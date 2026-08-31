import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { t } from './i18n'
import { getAppSettings } from './config'
import type { GitCheckResult, GitInfo, GitScanInfo } from '../shared/types'

const pexec = promisify(execFile)

const GIT_OPTS = { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }

function exists(file: string): boolean {
  try {
    return fs.existsSync(file)
  } catch {
    return false
  }
}

// ───────────────────── git 可执行文件解析 ─────────────────────

/** 各系统常规安装路径（PATH 之外的兜底） */
function conventionalGitPaths(): string[] {
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
    const localAppData = process.env['LOCALAPPDATA'] ?? ''
    const userHome = process.env['USERPROFILE'] ?? ''
    return [
      path.join(programFiles, 'Git', 'cmd', 'git.exe'),
      path.join(programFiles, 'Git', 'bin', 'git.exe'),
      path.join(programFilesX86, 'Git', 'cmd', 'git.exe'),
      path.join(programFilesX86, 'Git', 'bin', 'git.exe'),
      path.join(localAppData, 'Programs', 'Git', 'cmd', 'git.exe'),
      path.join(localAppData, 'Programs', 'Git', 'bin', 'git.exe'),
      path.join(userHome, 'scoop', 'shims', 'git.exe'),
      'C:\\ProgramData\\chocolatey\\bin\\git.exe'
    ]
  }
  if (process.platform === 'darwin') {
    return [
      '/opt/homebrew/bin/git', // Apple Silicon Homebrew
      '/opt/homebrew/opt/git/bin/git',
      '/usr/local/bin/git', // Intel Homebrew / 手动安装
      '/usr/bin/git', // Apple Command Line Tools
      '/Applications/Xcode.app/Contents/Developer/usr/bin/git'
    ]
  }
  // Linux
  return ['/usr/bin/git', '/usr/local/bin/git', '/snap/bin/git', '/opt/git/bin/git']
}

/** 常规安装路径下实际存在的 git 候选 */
export function gitCandidates(): string[] {
  return conventionalGitPaths().filter(exists)
}

/** 从 PATH 查找 git（保持与直接 spawn 'git' 一致的优先行为） */
async function gitFromPath(): Promise<string | null> {
  const isWin = process.platform === 'win32'
  const cmd = isWin ? 'where' : 'which'
  try {
    const { stdout } = await pexec(cmd, [isWin ? 'git.exe' : 'git'], { windowsHide: true })
    return (
      stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean) ?? null
    )
  } catch {
    return null
  }
}

/** 缓存已解析结果；手动配置变化（key 不同）时重新解析 */
let exeCache: { key: string; exe: string | null } | null = null

/**
 * 解析实际使用的 git 可执行文件：
 * 1. 手动配置（设置中心 gitPath）
 * 2. PATH（where/which）
 * 3. 系统常规安装路径依次兜底
 * 找不到返回 null（调用方降级或报错）
 */
export async function resolveGitExe(): Promise<string | null> {
  const manual = getAppSettings().gitPath?.trim() || undefined
  const key = manual ?? ''
  if (exeCache && exeCache.key === key) return exeCache.exe
  let exe: string | null = null
  if (manual) {
    exe = exists(manual) ? manual : null
  } else {
    exe = (await gitFromPath()) ?? gitCandidates()[0] ?? null
  }
  exeCache = { key, exe }
  return exe
}

/** 执行 git --version，返回首行输出；失败返回 null */
async function gitVersion(exe: string): Promise<string | null> {
  try {
    const { stdout } = await pexec(exe, ['--version'], GIT_OPTS)
    return stdout.trim().split(/\r?\n/)[0] ?? null
  } catch {
    return null
  }
}

/** 扫描结果：当前生效配置 + 常规路径候选（设置中心展示） */
export async function scanGit(): Promise<GitScanInfo> {
  const manual = getAppSettings().gitPath?.trim() || undefined
  const exe = await resolveGitExe()
  return {
    exe,
    manual,
    candidates: gitCandidates(),
    version: exe ? await gitVersion(exe) : null
  }
}

/** 校验指定文件是否为可用的 git（--version 实测） */
export async function checkGitExe(file: string): Promise<GitCheckResult> {
  const trimmed = file.trim()
  if (!trimmed) return { ok: false, version: null, error: t('main.gitFileNotFound') }
  if (!exists(trimmed)) return { ok: false, version: null, error: t('main.gitFileNotFound') }
  const version = await gitVersion(trimmed)
  if (!version) return { ok: false, version: null, error: t('main.gitExeInvalid') }
  return { ok: true, version, error: null }
}

// ───────────────────── 仓库检测与操作 ─────────────────────

function hasGitDir(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, '.git'))
  } catch {
    return false
  }
}

/** 从 dir 向上逐级查找最近的 git 仓库根；找不到返回 null */
export function findGitRoot(dir: string): string | null {
  let cur = path.resolve(dir)
  for (let i = 0; i < 32; i++) {
    if (hasGitDir(cur)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

/**
 * 解析项目实际使用的 git 仓库根：
 * 1. 手动指定路径（gitRoot 为路径，且该路径确实是仓库）
 * 2. 项目目录向上自动检测（monorepo 子包会命中父级仓库）
 * 3. gitRoot === '' 表示用户显式禁用 git，返回 null
 */
export function resolveGitRoot(projectPath: string, gitRoot?: string | null): string | null {
  if (gitRoot === '') return null
  if (gitRoot && hasGitDir(gitRoot)) return gitRoot
  return findGitRoot(projectPath)
}

export async function gitInfoAt(root: string | null): Promise<GitInfo> {
  if (!root)
    return {
      isRepo: false,
      root: null,
      currentBranch: null,
      dirty: false,
      branches: [],
      remoteBranches: []
    }
  const exe = await resolveGitExe()
  if (!exe)
    return { isRepo: true, root, currentBranch: null, dirty: false, branches: [], remoteBranches: [] }
  try {
    const [branch, status, branches, remoteBranches] = await Promise.all([
      pexec(exe, ['rev-parse', '--abbrev-ref', 'HEAD'], { ...GIT_OPTS, cwd: root }),
      pexec(exe, ['status', '--porcelain'], { ...GIT_OPTS, cwd: root }),
      pexec(exe, ['branch', '--format=%(refname:short)'], { ...GIT_OPTS, cwd: root }),
      // fetch 只更新远程跟踪引用、不会创建本地分支，远程分支需单独列出
      pexec(exe, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes'], {
        ...GIT_OPTS,
        cwd: root
      })
    ])
    return {
      isRepo: true,
      root,
      currentBranch: branch.stdout.trim() || null,
      dirty: status.stdout.trim().length > 0,
      branches: branches.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .sort(),
      remoteBranches: remoteBranches.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => Boolean(s) && !s.endsWith('/HEAD')) // 过滤 origin/HEAD 符号引用
        .sort()
    }
  } catch {
    return {
      isRepo: true,
      root,
      currentBranch: null,
      dirty: false,
      branches: [],
      remoteBranches: []
    }
  }
}

/** 判断 name 是否为远程跟踪分支（refs/remotes/<name> 存在） */
async function isRemoteBranch(exe: string, root: string, name: string): Promise<boolean> {
  try {
    await pexec(exe, ['rev-parse', '--verify', '--quiet', `refs/remotes/${name}`], {
      ...GIT_OPTS,
      cwd: root
    })
    return true
  } catch {
    return false
  }
}

/** 切换分支；远程分支（origin/x）自动创建本地跟踪分支；失败抛出含 git stderr 的错误 */
export async function gitSwitch(root: string, branch: string): Promise<void> {
  const exe = await resolveGitExe()
  if (!exe) throw new Error(t('main.gitNotFound'))
  const name = branch.trim()
  if (!name) throw new Error(t('main.emptyBranch'))
  try {
    await pexec(exe, ['switch', name], { ...GIT_OPTS, cwd: root })
  } catch (err) {
    const e = err as { stderr?: string; message?: string }
    const detail = e.stderr?.trim() || e.message || t('main.gitSwitchFailed')
    // git switch 不接受远程分支，仅在确认是远程跟踪分支时创建同名本地跟踪分支再切换；
    // 同名本地分支已存在时退回切换本地分支。本地带斜杠分支名不会误入此路径
    if (!(await isRemoteBranch(exe, root, name))) throw new Error(detail)
    const local = name.slice(name.indexOf('/') + 1)
    try {
      await pexec(exe, ['switch', '--track', name], { ...GIT_OPTS, cwd: root })
    } catch {
      try {
        await pexec(exe, ['switch', local], { ...GIT_OPTS, cwd: root })
      } catch (localErr) {
        // 优先透出最近的 git stderr（如本地改动冲突），否则回退原始错误
        const le = localErr as { stderr?: string; message?: string }
        throw new Error(le.stderr?.trim() || le.message || detail)
      }
    }
  }
}

/** 从远程获取更新（git fetch --all --prune）；失败抛出含 git stderr 的错误 */
export async function gitFetch(root: string): Promise<void> {
  const exe = await resolveGitExe()
  if (!exe) throw new Error(t('main.gitNotFound'))
  try {
    await pexec(exe, ['fetch', '--all', '--prune'], { ...GIT_OPTS, cwd: root })
  } catch (err) {
    const e = err as { stderr?: string; message?: string }
    throw new Error(e.stderr?.trim() || e.message || t('main.gitFetchFailed'))
  }
}
