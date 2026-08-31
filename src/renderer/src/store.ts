import { create } from 'zustand'
import i18n from './i18n'
import type {
  AiLibrary,
  AiWriteReport,
  AppSettings,
  AutoBackupSettings,
  GroupInfo,
  Language,
  ProjectAiConfig,
  ProjectRecord,
  ProjectTypeConfig,
  ProjectTypeMeta,
  RunInfo,
  ScanSettings,
  TerminalInfo,
  TerminalKind,
  TypeInfo
} from '../../shared/types'
import { toast } from './toast'
import { setLanguage as applyLanguage } from './i18n'

const t = (key: string, vars?: Record<string, string | number>): string =>
  i18n.t(key, vars) as string

export interface ImportPrefill {
  path: string
  name: string
  type: string
  typeLabel: string
  typeInfo?: TypeInfo
  /** 向上检测到的父级 git 仓库（导入时供用户确认关联） */
  parentGitRoot?: { path: string; currentBranch: string | null } | null
}

/** 分组编辑弹窗状态：null = 关闭（新建 / 重命名 / 删除选去向） */
export type GroupEditorState =
  { mode: 'create' } | { mode: 'rename'; name: string } | { mode: 'delete'; name: string }

interface AppState {
  ready: boolean
  projects: ProjectRecord[]
  running: RunInfo[]
  /** 各项目最近一次结束的任务（卡片显示失败/退出状态） */
  lastFinished: Record<string, RunInfo>
  types: ProjectTypeMeta[]
  settings: ScanSettings
  /** 应用设置（语言 / 自动备份） */
  appSettings: AppSettings
  /** 全局 AI 库（智能体模板 + 技能库） */
  aiLibrary: AiLibrary
  /** 全部分组（含 0 项目的分组） */
  groups: GroupInfo[]
  /** 本机终端可用性（顶栏终端选择器展示） */
  terminalAvail: TerminalInfo
  search: string
  /** 批量选择的项目 id */
  selectedIds: string[]
  /** 侧边栏当前选中的分组；null = 全部项目 */
  activeGroup: string | null
  /** git fetch 进行中（主界面遮罩锁定，等待完成） */
  fetchingRemote: boolean

  // 弹层状态
  importPrefill: ImportPrefill | null
  importOpen: boolean
  settingsOpen: boolean
  prefsOpen: boolean
  logProjectId: string | null
  pkgProjectId: string | null
  projSettingsId: string | null
  groupEditor: GroupEditorState | null
  assignOpen: boolean

  init(): Promise<void>
  refresh(): Promise<void>
  loadGroups(): Promise<void>
  setSearch(search: string): void
  applyStatus(run: RunInfo): void
  /** 设置默认终端并持久化 */
  setTerminal(kind: TerminalKind): Promise<void>
  setActiveGroup(group: string | null): void

  // 分组管理
  createGroup(name: string): Promise<boolean>
  renameGroup(oldName: string, newName: string): Promise<boolean>
  deleteGroup(name: string, moveTo: string): Promise<boolean>
  openGroupEditor(editor: GroupEditorState): void
  closeGroupEditor(): void
  openAssign(): void
  closeAssign(): void
  /** 批量分组：把选中项目移动到指定分组（'' = 未分组） */
  batchAssignGroup(groupName: string): Promise<void>

  // 设置中心
  openPrefs(): void
  closePrefs(): void
  /** 切换界面语言并持久化 */
  setAppLanguage(lng: Language): Promise<void>
  /** 更新自动备份配置并持久化 */
  updateAutoBackup(partial: Partial<AutoBackupSettings>): Promise<void>
  /** 设置 git 可执行文件路径；undefined = 恢复自动检测 */
  setGitPath(gitPath: string | undefined): Promise<void>
  /** 设置代码编辑器可执行文件路径；undefined = 恢复自动检测 */
  setEditorPath(editorPath: string | undefined): Promise<void>

  // AI 库与落盘
  refreshAiLibrary(): Promise<void>
  /** 保存全局 AI 库；成功提示 */
  saveAiLibrary(lib: AiLibrary): Promise<void>
  /** 恢复内置智能体模板（技能库保留）；成功提示 */
  restoreAiLibrary(): Promise<void>
  /** 写入项目 AI 文件（技能 + 简报）；ai 缺省从数据库读取，传入则用当前编辑中的配置；失败返回 null 并 toast */
  writeAiFiles(projectId: string, ai?: ProjectAiConfig): Promise<AiWriteReport | null>

  toggleSelect(id: string): void
  clearSelection(): void
  batchRemove(): Promise<void>
  batchTrash(): Promise<void>

  openImport(): Promise<void>
  closeImport(): void
  openSettings(): Promise<void>
  closeSettings(): void
  openLog(projectId: string): void
  closeLog(): void
  openPackage(projectId: string): void
  closePackage(): void
  openProjectSettings(projectId: string): void
  closeProjectSettings(): void

  startTask(projectId: string, script: string): Promise<void>
  /** 运行自定义命令（label 作为运行/日志显示名） */
  startCommand(projectId: string, label: string, command: string, args?: string[]): Promise<void>
  stopTask(projectId: string, runId?: number): Promise<void>
  updateProject(
    id: string,
    patch: {
      name?: string
      groupName?: string
      gitRoot?: string | null
      typeConfig?: ProjectTypeConfig
    }
  ): Promise<boolean>
  removeProject(id: string): Promise<void>
  trashProject(id: string): Promise<void>
  /** branch 切换；gitRoot 为解析后的仓库根（project.git.root） */
  switchBranch(gitRoot: string, branch: string): Promise<boolean>
  /** 从远程获取更新（git fetch）；gitRoot 为解析后的仓库根 */
  fetchRemote(gitRoot: string): Promise<boolean>
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  projects: [],
  running: [],
  lastFinished: {},
  types: [],
  settings: { scanDirs: [], scanDepth: 2, terminal: 'auto' },
  appSettings: { autoBackup: { enabled: false, intervalDays: 1, keep: 7 } },
  aiLibrary: { agents: [], skills: [] },
  groups: [],
  terminalAvail: { wt: false, gitbash: null, cmd: true, powershell: true },
  search: '',
  selectedIds: [],
  activeGroup: null,
  fetchingRemote: false,

  importPrefill: null,
  importOpen: false,
  settingsOpen: false,
  prefsOpen: false,
  logProjectId: null,
  pkgProjectId: null,
  projSettingsId: null,
  groupEditor: null,
  assignOpen: false,

  async init() {
    const [types, settings, appSettings, terminalAvail, groups, aiLibrary] = await Promise.all([
      window.api.listTypes(),
      window.api.getScanSettings(),
      window.api.getAppSettings(),
      window.api
        .terminalInfo()
        .catch(() => ({ wt: false, gitbash: null, cmd: true, powershell: true })),
      window.api.listGroups().catch(() => []),
      window.api.getAiLibrary().catch(() => ({ agents: [], skills: [] }))
    ])
    set({ types, settings, appSettings, terminalAvail, groups, aiLibrary })
    // 数据库中记录的语言优先（手动切换过）；否则维持启动时检测的系统语言
    if (appSettings.language && appSettings.language !== i18n.language) {
      applyLanguage(appSettings.language)
    }
    await get().refresh()
    set({ ready: true })
  },

  async setTerminal(kind) {
    const settings = get().settings
    try {
      await window.api.saveScanSettings({ ...settings, terminal: kind })
      set({ settings: { ...settings, terminal: kind } })
      toast.success(t('terminal.setDone', { name: t(`terminal.${kind}`) }))
    } catch (err) {
      toast.error(errText(err))
    }
  },

  setActiveGroup(group) {
    set({ activeGroup: group })
  },

  // ── 分组管理 ──

  async createGroup(name) {
    const trimmed = name.trim()
    if (!trimmed) return false
    try {
      await window.api.createGroup(trimmed)
      await get().loadGroups()
      toast.success(t('group.createDone', { name: trimmed }))
      return true
    } catch (err) {
      toast.error(errText(err))
      return false
    }
  },

  async renameGroup(oldName, newName) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return false
    try {
      await window.api.renameGroup(oldName, trimmed)
      await get().loadGroups()
      if (get().activeGroup === oldName) set({ activeGroup: trimmed })
      toast.success(t('group.renameDone', { name: trimmed }))
      return true
    } catch (err) {
      toast.error(errText(err))
      return false
    }
  },

  async deleteGroup(name, moveTo) {
    try {
      await window.api.deleteGroup(name, moveTo)
      await get().loadGroups()
      if (get().activeGroup === name) set({ activeGroup: moveTo.trim() })
      toast.success(t('group.deleteDone', { name }))
      return true
    } catch (err) {
      toast.error(errText(err))
      return false
    }
  },

  openGroupEditor(editor) {
    set({ groupEditor: editor })
  },

  closeGroupEditor() {
    set({ groupEditor: null })
  },

  openAssign() {
    set({ assignOpen: true })
  },

  closeAssign() {
    set({ assignOpen: false })
  },

  async batchAssignGroup(groupName) {
    const ids = get().selectedIds
    if (ids.length === 0) return
    const name = groupName.trim()
    let ok = 0
    for (const id of ids) {
      try {
        await window.api.updateProject(id, { groupName: name })
        ok += 1
      } catch (err) {
        toast.error(errText(err))
      }
    }
    set({ selectedIds: [] })
    await get().refresh()
    if (ok > 0) {
      toast.success(t('batch.assigned', { n: ok, name: name || t('group.ungrouped') }))
    }
  },

  // ── 设置中心 ──

  openPrefs() {
    set({ prefsOpen: true })
  },

  closePrefs() {
    set({ prefsOpen: false })
  },

  async setAppLanguage(lng) {
    applyLanguage(lng)
    try {
      const next = { ...get().appSettings, language: lng }
      set({ appSettings: next })
      await window.api.saveAppSettings(next)
    } catch (err) {
      toast.error(errText(err))
    }
  },

  async updateAutoBackup(partial) {
    try {
      const next: AppSettings = {
        ...get().appSettings,
        autoBackup: { ...get().appSettings.autoBackup, ...partial }
      }
      set({ appSettings: next })
      await window.api.saveAppSettings(next)
    } catch (err) {
      toast.error(errText(err))
    }
  },

  async setGitPath(gitPath) {
    const trimmed = gitPath?.trim() || undefined
    try {
      const next: AppSettings = { ...get().appSettings, gitPath: trimmed }
      set({ appSettings: next })
      await window.api.saveAppSettings(next)
    } catch (err) {
      toast.error(errText(err))
    }
  },

  async setEditorPath(editorPath) {
    const trimmed = editorPath?.trim() || undefined
    try {
      const next: AppSettings = { ...get().appSettings, editorPath: trimmed }
      set({ appSettings: next })
      await window.api.saveAppSettings(next)
    } catch (err) {
      toast.error(errText(err))
    }
  },

  // ── AI 库与落盘 ──

  async refreshAiLibrary() {
    try {
      set({ aiLibrary: await window.api.getAiLibrary() })
    } catch {
      // 刷新失败保持现有库
    }
  },

  async saveAiLibrary(lib) {
    try {
      set({ aiLibrary: await window.api.saveAiLibrary(lib) })
      toast.success(t('prefs.aiSaved'))
    } catch (err) {
      toast.error(errText(err))
    }
  },

  async restoreAiLibrary() {
    try {
      set({ aiLibrary: await window.api.restoreAiLibrary() })
      toast.success(t('prefs.aiSaved'))
    } catch (err) {
      toast.error(errText(err))
    }
  },

  async writeAiFiles(projectId, ai) {
    try {
      return await window.api.writeProjectAiFiles(projectId, ai)
    } catch (err) {
      toast.error(errText(err))
      return null
    }
  },

  async refresh() {
    try {
      const [projects, running, groups] = await Promise.all([
        window.api.listProjects(),
        window.api.listRunning(),
        window.api.listGroups()
      ])
      set({ projects, running, groups })
    } catch (err) {
      toast.error(t('toast.loadFailed', { error: errText(err) }))
    }
  },

  async loadGroups() {
    try {
      set({ groups: await window.api.listGroups() })
    } catch {
      // 刷新失败保持现有分组列表
    }
  },

  setSearch(search) {
    set({ search })
  },

  toggleSelect(id) {
    const cur = get().selectedIds
    set({
      selectedIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    })
  },

  clearSelection() {
    set({ selectedIds: [] })
  },

  async batchRemove() {
    const ids = get().selectedIds
    if (ids.length === 0) return
    for (const id of ids) {
      try {
        await window.api.removeProject(id)
      } catch (err) {
        toast.error(errText(err))
      }
    }
    set({ selectedIds: [] })
    await get().refresh()
    toast.success(t('batch.removed', { n: ids.length }))
  },

  async batchTrash() {
    const ids = get().selectedIds
    if (ids.length === 0) return
    for (const id of ids) {
      try {
        await window.api.trashProject(id)
      } catch (err) {
        toast.error(errText(err))
      }
    }
    set({ selectedIds: [] })
    await get().refresh()
    toast.success(t('batch.trashed', { n: ids.length }))
  },

  applyStatus(run) {
    const { running, lastFinished } = get()
    const nextRunning =
      run.status === 'running'
        ? [...running.filter((r) => r.id !== run.id), run]
        : running.filter((r) => r.id !== run.id)
    const nextFinished =
      run.status === 'running' ? lastFinished : { ...lastFinished, [run.projectId]: run }
    set({ running: nextRunning, lastFinished: nextFinished })
    if (run.status === 'failed') {
      toast.error(t('toast.taskFailed', { script: run.script }))
    } else if (run.status === 'exited') {
      toast.info(t('toast.taskExited', { script: run.script }))
    }
  },

  async openImport() {
    try {
      const dir = await window.api.chooseDirectory()
      if (!dir) return
      const pre = await window.api.inspect(dir)
      set({
        importPrefill: {
          path: dir,
          name: pre.name,
          type: pre.type,
          typeLabel: pre.typeLabel,
          typeInfo: pre.typeInfo,
          parentGitRoot: pre.parentGitRoot
        },
        importOpen: true
      })
    } catch (err) {
      toast.error(errText(err))
    }
  },

  closeImport() {
    set({ importOpen: false, importPrefill: null })
  },

  async openSettings() {
    set({ settingsOpen: true })
    try {
      set({ settings: await window.api.getScanSettings() })
    } catch {
      // 使用已有设置
    }
  },

  closeSettings() {
    set({ settingsOpen: false })
  },

  openLog(projectId) {
    set({ logProjectId: projectId })
  },

  closeLog() {
    set({ logProjectId: null })
  },

  openPackage(projectId) {
    set({ pkgProjectId: projectId })
  },

  closePackage() {
    set({ pkgProjectId: null })
  },

  openProjectSettings(projectId) {
    set({ projSettingsId: projectId })
  },

  closeProjectSettings() {
    set({ projSettingsId: null })
  },

  async startTask(projectId, script) {
    try {
      const run = await window.api.startTask(projectId, script)
      get().applyStatus(run)
      toast.success(t('toast.started', { script }))
    } catch (err) {
      toast.error(errText(err))
    }
  },

  async startCommand(projectId, label, command, args) {
    try {
      const run = await window.api.startCommand(projectId, label, command, args)
      get().applyStatus(run)
      toast.success(t('toast.started', { script: label }))
    } catch (err) {
      toast.error(errText(err))
    }
  },

  async stopTask(projectId, runId) {
    try {
      await window.api.stopTask(projectId, runId)
    } catch (err) {
      toast.error(errText(err))
    }
  },

  async updateProject(id, patch) {
    try {
      await window.api.updateProject(id, patch)
      await get().refresh()
      return true
    } catch (err) {
      toast.error(errText(err))
      return false
    }
  },

  async removeProject(id) {
    try {
      await window.api.removeProject(id)
      await get().refresh()
      toast.success(t('toast.removed'))
    } catch (err) {
      toast.error(errText(err))
    }
  },

  async trashProject(id) {
    try {
      await window.api.trashProject(id)
      await get().refresh()
      toast.success(t('toast.trashed'))
    } catch (err) {
      toast.error(errText(err))
    }
  },

  async switchBranch(gitRoot, branch) {
    try {
      await window.api.gitSwitch(gitRoot, branch)
      await get().refresh()
      toast.success(t('toast.branchSwitched', { branch }))
      return true
    } catch (err) {
      toast.error(t('toast.branchFailed', { error: errText(err) }))
      return false
    }
  },

  async fetchRemote(gitRoot) {
    set({ fetchingRemote: true })
    try {
      await window.api.gitFetch(gitRoot)
      await get().refresh()
      toast.success(t('toast.gitFetched'))
      return true
    } catch (err) {
      toast.error(t('toast.gitFetchFailed', { error: errText(err) }))
      return false
    } finally {
      set({ fetchingRemote: false })
    }
  }
}))
