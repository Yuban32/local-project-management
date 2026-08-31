import type {
  AiLibrary,
  AiWriteReport,
  AppInfo,
  AppSettings,
  BackupItem,
  EditorCheckResult,
  EditorScanInfo,
  GitCheckResult,
  GitInfo,
  GitScanInfo,
  GroupInfo,
  LogLine,
  NvmInfo,
  ProjectAiConfig,
  ProjectRecord,
  ProjectTypeConfig,
  ProjectTypeMeta,
  RunInfo,
  ScanCandidate,
  ScanSettings,
  TerminalInfo,
  TypeInfo
} from './types'

/** inspect 的返回：导入表单预填信息（含父级 git 仓库检测结果） */
export interface InspectResult {
  name: string
  type: string
  typeLabel: string
  typeInfo: TypeInfo
  /** 项目目录向上检测到的最近 git 仓库；null = 未检测到 */
  parentGitRoot: { path: string; currentBranch: string | null } | null
}

/** 渲染层可调用的完整 API（preload 经 contextBridge 暴露为 window.api） */
export interface API {
  // ── 设置 ──
  getScanSettings(): Promise<ScanSettings>
  saveScanSettings(settings: ScanSettings): Promise<void>
  /** 应用设置（语言 / 自动备份配置） */
  getAppSettings(): Promise<AppSettings>
  saveAppSettings(settings: AppSettings): Promise<void>
  chooseDirectory(): Promise<string | null>
  /** 选择文件（git / 编辑器等可执行文件的手动配置） */
  chooseFile(): Promise<string | null>
  listTypes(): Promise<ProjectTypeMeta[]>
  /** 本机 nvm 环境（已装版本列表） */
  nvmList(): Promise<NvmInfo>
  /** 本机终端可用性（wt / gitbash / cmd / powershell） */
  terminalInfo(): Promise<TerminalInfo>
  /** 扫描代码编辑器（当前生效配置 + 常规安装路径候选） */
  editorScan(): Promise<EditorScanInfo>
  /** 校验指定文件是否可用作编辑器（存在性校验 + VSCode 系版本探测） */
  editorCheck(file: string): Promise<EditorCheckResult>
  /** 关于页信息（名称 / 版本 / 运行时） */
  getAppInfo(): Promise<AppInfo>

  // ── 扫描与导入 ──
  scan(): Promise<ScanCandidate[]>
  /** 项目完整列表（含脚本/git 等运行时富化信息） */
  listProjects(): Promise<ProjectRecord[]>
  /** 检查单个目录，返回导入表单预填信息 */
  inspect(path: string): Promise<InspectResult>
  addProject(
    path: string,
    opts: {
      name: string
      type: string
      typeConfig: ProjectTypeConfig
      groupName?: string
      gitRoot?: string | null
    }
  ): Promise<ProjectRecord>
  updateProject(
    id: string,
    patch: {
      name?: string
      groupName?: string
      gitRoot?: string | null
      typeConfig?: ProjectTypeConfig
    }
  ): Promise<ProjectRecord>
  /** 仅从启动器列表移除（磁盘文件不动） */
  removeProject(id: string): Promise<void>
  /** 移入系统回收站（可恢复） */
  trashProject(id: string): Promise<void>

  // ── 分组 ──
  /** 全部分组（groups 表 ∪ 项目实际使用，含项目数） */
  listGroups(): Promise<GroupInfo[]>
  createGroup(name: string): Promise<void>
  /** 重命名并级联更新项目 */
  renameGroup(oldName: string, newName: string): Promise<void>
  /** 删除分组；moveTo 为 '' = 移入未分组，其他 = 移入指定分组 */
  deleteGroup(name: string, moveTo: string): Promise<void>

  // ── 备份与数据 ──
  listBackups(): Promise<BackupItem[]>
  createBackup(): Promise<BackupItem>
  /** 从备份文件恢复（覆盖当前数据库） */
  restoreBackup(name: string): Promise<void>
  deleteBackup(name: string): Promise<void>
  /** 弹出保存框导出数据库文件；返回实际导出路径，取消返回 null */
  exportData(): Promise<string | null>
  /** 弹出选择框导入数据库文件（覆盖当前数据）；取消返回 false */
  importData(): Promise<boolean>

  // ── package.json ──
  readPackageJson(id: string): Promise<string>
  writePackageJson(id: string, content: string): Promise<void>

  // ── 任务 ──
  startTask(projectId: string, script: string): Promise<RunInfo>
  /** runId 缺省 = 停止该项目全部任务 */
  stopTask(projectId: string, runId?: number): Promise<void>
  listRunning(): Promise<RunInfo[]>
  getHistory(projectId: string): Promise<RunInfo[]>
  getLogs(runId: number): Promise<LogLine[]>

  // ── 浏览器 / 文件 ──
  /** 打开项目服务地址（手动配置优先，否则从日志探测）；返回实际打开的 URL */
  openBrowser(projectId: string): Promise<string>
  openPath(path: string): Promise<void>
  /** 在项目目录打开系统终端（Windows Terminal 优先，回退 cmd） */
  openTerminal(path: string): Promise<void>
  /** 用配置的代码编辑器打开项目目录 */
  openEditor(path: string): Promise<void>

  // ── git ──
  gitInfo(path: string): Promise<GitInfo>
  gitSwitch(path: string, branch: string): Promise<void>
  /** 从远程获取更新（git fetch --all --prune），返回刷新后的仓库信息 */
  gitFetch(path: string): Promise<GitInfo>
  /** 扫描 git 可执行文件（当前生效配置 + 常规安装路径候选） */
  gitScan(): Promise<GitScanInfo>
  /** 校验指定文件是否为可用的 git（--version 实测） */
  gitCheck(file: string): Promise<GitCheckResult>

  // ── AI 库与落盘 ──
  /** 全局 AI 库（智能体模板 + 技能库） */
  getAiLibrary(): Promise<AiLibrary>
  /** 保存全局 AI 库；返回清洗后的结果 */
  saveAiLibrary(lib: AiLibrary): Promise<AiLibrary>
  /** 恢复内置智能体模板（技能库保留） */
  restoreAiLibrary(): Promise<AiLibrary>
  /** 把项目启用的 agent/技能写入项目目录；ai 缺省从数据库读取，传入则用当前编辑中的配置 */
  writeProjectAiFiles(
    projectId: string,
    ai?: ProjectAiConfig
  ): Promise<AiWriteReport>

  // ── 自定义命令 ──
  /** 在项目目录运行自定义命令（label 作为运行/日志显示名） */
  startCommand(
    projectId: string,
    label: string,
    command: string,
    args?: string[]
  ): Promise<RunInfo>

  // ── 主进程推送事件 ──
  /** 订阅日志批量追加 */
  onLog(cb: (lines: LogLine[]) => void): () => void
  /** 订阅任务状态变化 */
  onTaskStatus(cb: (run: RunInfo) => void): () => void
}
