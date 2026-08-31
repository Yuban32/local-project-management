/** 包管理器 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** 终端偏好 */
export type TerminalKind = 'auto' | 'wt' | 'gitbash' | 'cmd' | 'powershell'

/** 界面语言 */
export type Language = 'zh-CN' | 'en-US'

/** 分组信息（groups 表 ∪ 项目实际使用的分组名） */
export interface GroupInfo {
  name: string
  /** 该分组下的项目数 */
  count: number
}

/** 自动备份配置 */
export interface AutoBackupSettings {
  enabled: boolean
  /** 备份间隔（天） */
  intervalDays: number
  /** 最大保留份数 */
  keep: number
}

/** 应用设置（settings 表 'app' key；与 ScanSettings 分开存储） */
export interface AppSettings {
  /** 界面语言；缺省 = 跟随系统 */
  language?: Language
  autoBackup: AutoBackupSettings
  /** git 可执行文件路径；缺省 = 自动检测（PATH + 系统常规安装路径） */
  gitPath?: string
  /** 代码编辑器可执行文件路径；缺省 = 自动检测（系统常规安装路径） */
  editorPath?: string
}

/** git 可执行文件扫描结果（设置中心展示） */
export interface GitScanInfo {
  /** 实际生效的可执行文件；null = 未找到 */
  exe: string | null
  /** 手动配置的路径；缺省 = 自动检测 */
  manual?: string
  /** 常规安装路径下找到的候选 */
  candidates: string[]
  /** 生效可执行文件的版本输出（首行） */
  version: string | null
}

/** git 可执行文件校验结果 */
export interface GitCheckResult {
  ok: boolean
  version: string | null
  error: string | null
}

/** 代码编辑器标识 */
export type EditorKind = 'vscode' | 'insiders' | 'cursor' | 'vscodium'

/** 编辑器候选（常规安装路径探测到的安装） */
export interface EditorCandidate {
  id: EditorKind
  /** 产品名（如 VS Code），不翻译 */
  name: string
  path: string
}

/** 编辑器扫描结果（设置中心展示） */
export interface EditorScanInfo {
  /** 实际生效的可执行文件；null = 未找到 */
  exe: string | null
  /** 手动配置的路径；缺省 = 自动检测 */
  manual?: string
  /** 常规安装路径下找到的候选 */
  candidates: EditorCandidate[]
  /** 生效可执行文件的版本输出（首行） */
  version: string | null
}

/** 编辑器校验结果 */
export interface EditorCheckResult {
  ok: boolean
  version: string | null
  error: string | null
}

/** 备份文件信息 */
export interface BackupItem {
  /** 文件名（如 app-20260829-120000.db） */
  name: string
  path: string
  size: number
  mtime: number
}

/** 关于页应用信息 */
export interface AppInfo {
  name: string
  version: string
  electron: string
  node: string
  chrome: string
}

/** 扫描设置（settings 表持久化） */
export interface ScanSettings {
  scanDirs: string[]
  /** 扫描目录下探深度，默认 2 */
  scanDepth: number
  /** 打开终端使用的软件，默认 auto（wt → gitbash → cmd） */
  terminal?: TerminalKind
}

/** 本机终端可用性 */
export interface TerminalInfo {
  wt: boolean
  /** git-bash.exe 路径；null = 未检测到 */
  gitbash: string | null
  cmd: boolean
  powershell: boolean
}

/** node 项目类型专属配置（projects.type_config JSON 列） */
export interface NodeProjectConfig {
  /** 手动覆盖的包管理器；缺省 = 自动检测 */
  packageManager?: PackageManager
  /** 常用脚本（卡片启动菜单直显） */
  favoriteScripts?: string[]
  /** 手动指定浏览器地址；缺省 = 从日志自动探测 */
  browserUrl?: string
  /** 使用 nvm 指定 Node 版本运行 */
  useNvm?: boolean
  /** nvm Node 版本号，如 '16.20.2' */
  nodeVersion?: string
}

/** 内置卡片操作按钮标识（快捷方式显隐开关的 key） */
export type BuiltinCardToggle = 'start' | 'stop' | 'build' | 'browser' | 'logs' | 'editPackage'

/** 全局 AI 技能定义（settings 表 'aiLibrary' key 的 skills 数组条目） */
export interface SkillDef {
  id: string
  /** 技能名（写入 SKILL.md frontmatter 的 name） */
  name: string
  /** 一句话描述（frontmatter description） */
  description: string
  /** SKILL.md 正文（Markdown，由维护者全文维护） */
  body: string
  tags?: string[]
}

/** 全局 AI 智能体模板（内置 Claude Code / Cursor + 用户自定义） */
export interface AgentTemplate {
  id: string
  /** 展示名（专有名词不翻译） */
  name: string
  kind: 'claude' | 'cursor' | 'custom'
  /** 建议启动命令（写入简报供参考） */
  command?: string
  model?: string
  /** 写入项目简报的一段引导文案；空 = 用模板默认 */
  brief?: string
  /** 内置条目：UI 禁删 */
  builtin?: boolean
}

/** 全局 AI 库（settings 表 'aiLibrary' key） */
export interface AiLibrary {
  agents: AgentTemplate[]
  skills: SkillDef[]
}

/** 单 agent 的项目级覆盖（模板关键字的 command / model） */
export interface AgentOverride {
  command?: string
  model?: string
}

/** 项目级 AI 配置（落入 typeConfig.ai） */
export interface ProjectAiConfig {
  /** 全局模板库中选中的 agent 模板 id */
  enabledAgentIds: string[]
  /** 全局技能库中选中的技能 id */
  enabledSkillIds: string[]
  /** key = agent 模板 id */
  overrides?: Record<string, AgentOverride>
  /** 简报文件名；缺省 'CLAUDE.md' */
  briefFile?: 'CLAUDE.md' | 'AGENTS.md'
  /** 落盘根目录；缺省 = 仓库根（向上解析），非仓库 = 项目目录 */
  root?: string
}

/** 自定义命令快捷按钮（落入 typeConfig.cardShortcuts） */
export interface CardShortcut {
  id: string
  /** 按钮文案（用户数据，不走 i18n） */
  label: string
  /** 项目目录下执行的原始命令（shell:true，含参数） */
  command: string
}

/** 各类型通用项目扩展：避免侵入 NodeProjectConfig 的属性面 */
export interface ProjectExtras {
  ai?: ProjectAiConfig
  cardShortcuts?: CardShortcut[]
  /** 内置按钮显隐：undefined/true = 显示，false = 隐藏 */
  cardBuiltins?: Partial<Record<BuiltinCardToggle, boolean>>
}

/** 各项目类型通用结构：类型专属字段放这里，避免侵入通用表结构 */
export type ProjectTypeConfig = NodeProjectConfig & ProjectExtras & Record<string, unknown>

/** AI 文件落盘结果（IPC 'project:writeAiFiles' 返回） */
export interface AiWriteReport {
  /** 实际写入的根目录 */
  root: string
  briefFile: 'CLAUDE.md' | 'AGENTS.md'
  briefAction: 'created' | 'updated' | 'appended'
  briefPath: string
  skills: { id: string; name: string; path: string; action: 'created' | 'updated' }[]
  /** 写入简报的 agent 名 */
  agents: string[]
  warnings: string[]
}

/** git 信息 */
export interface GitInfo {
  isRepo: boolean
  /** 实际执行 git 操作的仓库根目录（可能是项目的父级目录） */
  root: string | null
  currentBranch: string | null
  dirty: boolean
  branches: string[]
}

/** 项目完整记录（DB 行 + 运行时富化信息） */
export interface ProjectRecord {
  id: string
  path: string
  name: string
  type: string
  /** 分组名；空串 = 未分组 */
  groupName: string
  /**
   * 手动指定的 git 仓库根：null/undefined = 自动检测（含向上找父级）；
   * '' = 显式禁用 git；其他 = 指定仓库路径
   */
  gitRoot?: string | null
  typeConfig: ProjectTypeConfig
  createdAt: number
  updatedAt: number
  /** 以下为运行时富化，不落库 */
  scripts?: string[]
  startScripts?: string[]
  buildScripts?: string[]
  detectedPackageManager?: PackageManager
  git?: GitInfo | null
}

/** nvm 环境（nvm:list 返回） */
export interface NvmInfo {
  installed: boolean
  versions: string[]
  current: string | null
}

/** 运行状态 */
export type RunStatus = 'running' | 'exited' | 'failed'

/** 一次任务运行 */
export interface RunInfo {
  id: number
  projectId: string
  type: string
  script: string
  status: RunStatus
  pid: number | null
  startedAt: number
  endedAt: number | null
  exitCode: number | null
}

/** 单条日志 */
export interface LogLine {
  runId: number
  ts: number
  stream: 'out' | 'err'
  line: string
}

/** 项目类型适配器暴露的类型专属信息 */
export interface TypeInfo {
  packageManager?: PackageManager
  scripts?: string[]
  startScripts?: string[]
  buildScripts?: string[]
}

/** 项目类型元信息（渲染层展示用） */
export interface ProjectTypeMeta {
  id: string
  label: string
  implemented: boolean
}

/** 扫描候选 */
export interface ScanCandidate {
  path: string
  name: string
  type: string
  typeLabel: string
  imported: boolean
  typeInfo?: TypeInfo
}

/** 适配器产出的执行规格 */
export interface SpawnSpec {
  cmd: string
  args: string[]
  cwd: string
}
