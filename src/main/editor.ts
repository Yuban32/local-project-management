import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { t } from './i18n'
import { getAppSettings } from './config'
import type {
  EditorCandidate,
  EditorCheckResult,
  EditorKind,
  EditorScanInfo
} from '../shared/types'

const pexec = promisify(execFile)

/**
 * 代码编辑器（VS Code / Insiders / Cursor / VSCodium）检测与打开。
 * 解析优先级与 git.ts 一致：手动配置（设置中心 editorPath）> 常规安装路径候选。
 * 版本探测仅对 VSCode 系二进制执行；win 上经 ELECTRON_RUN_AS_NODE 跑安装内 cli.js
 * （GUI exe 直接 --version 无 stdout），任意手动指定的 exe 只做存在性校验，避免给
 * GUI 程序传 --version 产生弹窗副作用。
 */

const EXEC_OPTS = { windowsHide: true }

function exists(file: string): boolean {
  try {
    return fs.existsSync(file)
  } catch {
    return false
  }
}

interface EditorDef {
  id: EditorKind
  /** 产品名（不翻译） */
  name: string
  /** win: 实际 exe 文件名（shim 推导兜底时按此拼接） */
  winExe: string
  /** win: 安装目录名（相对于 %LOCALAPPDATA%\Programs / ProgramFiles / ProgramFiles(x86)） */
  winDirs: string[]
  /** win: PATH 中的 CLI shim 名（xxx.cmd），用于推导安装目录 */
  winShim: string
  /** mac: 应用内 CLI 脚本 */
  macPaths: string[]
  /** linux: CLI 可执行文件 */
  linuxPaths: string[]
}

/** 探测与自动回退顺序：稳定版 > 分叉 > 开源版 > 抢先体验版 */
const EDITOR_DEFS: EditorDef[] = [
  {
    id: 'vscode',
    name: 'VS Code',
    winExe: 'Code.exe',
    winDirs: ['Microsoft VS Code'],
    winShim: 'code',
    macPaths: ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'],
    linuxPaths: ['/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code']
  },
  {
    id: 'cursor',
    name: 'Cursor',
    winExe: 'Cursor.exe',
    winDirs: ['cursor'],
    winShim: 'cursor',
    macPaths: ['/Applications/Cursor.app/Contents/Resources/app/bin/cursor'],
    linuxPaths: ['/usr/bin/cursor', '/usr/local/bin/cursor']
  },
  {
    id: 'vscodium',
    name: 'VSCodium',
    winExe: 'VSCodium.exe',
    winDirs: ['VSCodium'],
    winShim: 'codium',
    macPaths: ['/Applications/VSCodium.app/Contents/Resources/app/bin/codium'],
    linuxPaths: ['/usr/bin/codium', '/usr/local/bin/codium']
  },
  {
    id: 'insiders',
    name: 'VS Code - Insiders',
    winExe: 'Code - Insiders.exe',
    winDirs: ['Microsoft VS Code Insiders'],
    winShim: 'code-insiders',
    macPaths: [
      '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders'
    ],
    linuxPaths: ['/usr/bin/code-insiders']
  }
]

/** win: 各安装根下的实际 exe */
function winCandidatePaths(def: EditorDef): string[] {
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const localAppData = process.env['LOCALAPPDATA'] ?? ''
  const roots = [path.join(localAppData, 'Programs'), programFiles, programFilesX86]
  return def.winDirs.flatMap((dir) => roots.map((root) => path.join(root, dir, def.winExe)))
}

/** win: PATH 中的 CLI shim（code.cmd 等）→ 同级/上级目录的实际 exe（自定义安装位置兜底） */
async function winFromShim(def: EditorDef): Promise<string | null> {
  try {
    const { stdout } = await pexec('where', [def.winShim], EXEC_OPTS)
    const first = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean)
    if (!first) return null
    const dir = path.dirname(first)
    const candidates = [path.join(dir, def.winExe), path.join(dir, '..', def.winExe)]
    return candidates.find(exists) ?? null
  } catch {
    return null
  }
}

/** 常规安装路径探测结果（按 EDITOR_DEFS 顺序，路径小写去重） */
export async function editorCandidates(): Promise<EditorCandidate[]> {
  const seen = new Set<string>()
  const out: EditorCandidate[] = []
  const push = (def: EditorDef, p: string): void => {
    const key = p.toLowerCase()
    if (seen.has(key) || !exists(p)) return
    seen.add(key)
    out.push({ id: def.id, name: def.name, path: p })
  }
  for (const def of EDITOR_DEFS) {
    if (process.platform === 'win32') {
      for (const p of winCandidatePaths(def)) push(def, p)
      const viaShim = await winFromShim(def)
      if (viaShim) push(def, viaShim)
    } else {
      for (const p of process.platform === 'darwin' ? def.macPaths : def.linuxPaths) push(def, p)
    }
  }
  return out
}

/** 缓存已解析结果；手动配置变化（key 不同）时重新解析 */
let exeCache: { key: string; exe: string | null } | null = null

/**
 * 解析实际使用的编辑器可执行文件：
 * 1. 手动配置（设置中心 editorPath）
 * 2. 常规安装路径候选首个
 * 找不到返回 null（调用方报错）
 */
export async function resolveEditorExe(): Promise<string | null> {
  const manual = getAppSettings().editorPath?.trim() || undefined
  const key = manual ?? ''
  if (exeCache && exeCache.key === key) return exeCache.exe
  let exe: string | null = null
  if (manual) {
    exe = exists(manual) ? manual : null
  } else {
    exe = (await editorCandidates())[0]?.path ?? null
  }
  exeCache = { key, exe }
  return exe
}

/** VSCode 系二进制 basename 白名单：这些内核可静默响应 --version */
function isKnownFamily(exe: string): boolean {
  const base = path
    .basename(exe)
    .toLowerCase()
    .replace(/\.exe$/, '')
  return ['code', 'code-insiders', 'code - insiders', 'cursor', 'codium'].includes(base)
}

/**
 * win: 定位 VSCode 系安装内的 cli.js（版本脚本）。
 * 标准布局在 <dir>\resources\app\out\；企业重定向布局在 <dir>\<commit>\resources\app\out\。
 * 直接对 GUI exe 跑 --version 拿不到 stdout（windowsgui 子系统），须走 cli.js。
 */
function findWinCliJs(dir: string): string | null {
  const rel = ['resources', 'app', 'out', 'cli.js']
  const direct = path.join(dir, ...rel)
  if (exists(direct)) return direct
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const p = path.join(dir, entry.name, ...rel)
      if (exists(p)) return p
    }
  } catch {
    // 目录不可读当作无 cli.js
  }
  return null
}

/** 执行 --version 取首行；非 VSCode 系或执行失败返回 null */
async function editorVersion(exe: string): Promise<string | null> {
  if (!isKnownFamily(exe)) return null
  try {
    if (process.platform === 'win32') {
      // 等价官方 bin/code.cmd：以 Electron 运行时（ELECTRON_RUN_AS_NODE）跑安装内 cli.js。
      // 不直接执行编辑器 GUI exe——部分企业环境会拦截（EACCES），且 windowsgui 子系统
      // 的 GUI exe 直接 --version 也拿不到 stdout。
      const cliJs = findWinCliJs(path.dirname(exe))
      if (!cliJs) return null
      const { stdout } = await pexec(process.execPath, [cliJs, '--version'], {
        ...EXEC_OPTS,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      })
      return stdout.trim().split(/\r?\n/)[0] ?? null
    }
    // mac/linux 探测路径本身就是 CLI 脚本（bin/code 等），直接执行
    const { stdout } = await pexec(exe, ['--version'], EXEC_OPTS)
    return stdout.trim().split(/\r?\n/)[0] ?? null
  } catch {
    return null
  }
}

/** 扫描结果：当前生效配置 + 常规路径候选（设置中心展示） */
export async function scanEditors(): Promise<EditorScanInfo> {
  const manual = getAppSettings().editorPath?.trim() || undefined
  const exe = await resolveEditorExe()
  return {
    exe,
    manual,
    candidates: await editorCandidates(),
    version: exe ? await editorVersion(exe) : null
  }
}

/** 校验指定文件是否可用作编辑器（存在性校验；VSCode 系附版本探测） */
export async function checkEditor(file: string): Promise<EditorCheckResult> {
  const trimmed = file.trim()
  if (!trimmed || !exists(trimmed)) {
    return { ok: false, version: null, error: t('main.editorFileNotFound') }
  }
  return { ok: true, version: await editorVersion(trimmed), error: null }
}

/** 用配置的编辑器打开目录；未检测到时抛错（渲染层 toast 引导去设置） */
export async function openEditorAt(dir: string): Promise<void> {
  const target = path.resolve(dir)
  if (!exists(target)) throw new Error(t('main.dirNotFound'))
  const exe = await resolveEditorExe()
  if (!exe) throw new Error(t('main.editorNotFound'))
  await new Promise<void>((resolve, reject) => {
    if (process.platform === 'win32') {
      // 企业环境下系统策略可能拦截 Electron 直接 CreateProcess 拉起编辑器 exe（EACCES，
      // 系统 node spawn 同样被拦）；经 cmd start 转发（ShellExecute 链路，同资源管理器
      // 的启动方式）可正常拉起。windowsHide 只隐藏 cmd 载体，编辑器窗口由 ShellExecute
      // 正常显示。start 为异步启动，cmd 立即返回；找不到文件等失败时 exit code 非 0。
      const child = spawn('cmd.exe', ['/d', '/c', `start "" "${exe}" "${target}"`], {
        windowsVerbatimArguments: true,
        windowsHide: true,
        detached: true,
        stdio: 'ignore'
      })
      child.once('error', (err) =>
        reject(new Error(t('main.editorStartFailed', { error: err.message })))
      )
      child.once('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(t('main.editorStartFailed', { error: `exit ${code}` })))
      })
      return
    }
    // 窗口化 GUI 进程不可加 windowsHide（会以 SW_HIDE 创建，窗口不可见）；
    // cwd 固定为安装目录：重打包布局的 Code.exe 依赖工作目录定位资源，否则启动即退
    const child = spawn(exe, [target], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
