import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import {
  getScanSettings,
  saveScanSettings,
  getAppSettings,
  saveAppSettings,
  getAiLibrary,
  saveAiLibrary,
  restoreDefaultAgents
} from './config'
import { writeProjectAiFiles } from './aiWriter'
import {
  createGroup,
  deleteGroup,
  deleteProject,
  getProject,
  getLogs,
  getRun,
  listGroups,
  listProjects,
  listRunsByProject,
  renameGroup,
  updateProjectRecord,
  upsertProject
} from './db'
import {
  createBackup,
  deleteBackup,
  exportData,
  importData,
  listBackups,
  restoreBackup
} from './backup'
import { getAdapter, listTypes } from './adapters'
import { checkEditor, openEditorAt, scanEditors } from './editor'
import { inspectDirectory, scanDirectories } from './scanner'
import { taskManager } from './tasks'
import { checkGitExe, gitFetch, gitInfoAt, gitSwitch, resolveGitRoot, scanGit } from './git'
import { nvmList } from './nvm'
import { openTerminal, terminalInfo } from './terminal'
import { getTerminalSetting } from './config'
import { openProjectInBrowser } from './browser'
import { t } from './i18n'
import type {
  AiLibrary,
  AppSettings,
  ProjectAiConfig,
  ProjectRecord,
  ProjectTypeConfig,
  ScanSettings
} from '../shared/types'

/** 富化项目信息：脚本、包管理器探测、git 状态（每次列表刷新实时读取） */
async function enrich(record: ProjectRecord): Promise<ProjectRecord> {
  const enriched: ProjectRecord = { ...record, git: null }
  try {
    const info = await getAdapter(record.type).loadInfo(record.path)
    enriched.scripts = info.scripts
    enriched.startScripts = info.startScripts
    enriched.buildScripts = info.buildScripts
    enriched.detectedPackageManager = info.packageManager
  } catch {
    // package.json 可能被删除/损坏，保留基础信息
  }
  try {
    // git 操作根：手动指定 > 项目目录向上检测（monorepo 子包命中父级仓库）
    enriched.git = await gitInfoAt(resolveGitRoot(record.path, record.gitRoot))
  } catch {
    enriched.git = null
  }
  return enriched
}

export function registerIpc(): void {
  // ── 设置 ──
  ipcMain.handle('settings:get', () => getScanSettings())
  ipcMain.handle('settings:save', (_e, settings: ScanSettings) => saveScanSettings(settings))
  ipcMain.handle('appSettings:get', () => getAppSettings())
  ipcMain.handle('appSettings:save', (_e, settings: AppSettings) => saveAppSettings(settings))
  ipcMain.handle('editor:scan', () => scanEditors())
  ipcMain.handle('editor:check', (_e, file: string) => checkEditor(file))
  ipcMain.handle('dialog:chooseDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('dialog:chooseFile', async () => {
    const filters =
      process.platform === 'win32'
        ? [{ name: t('main.exeFilter'), extensions: ['exe'] }]
        : [{ name: t('main.exeFilter'), extensions: ['*'] }]
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('types:list', () => listTypes())
  ipcMain.handle('nvm:list', () => nvmList())
  ipcMain.handle('terminal:info', () => terminalInfo())
  ipcMain.handle('app:getInfo', () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    node: process.versions.node ?? '',
    chrome: process.versions.chrome ?? ''
  }))

  // ── 分组 ──
  ipcMain.handle('group:list', () => listGroups())
  ipcMain.handle('group:create', (_e, name: string) => createGroup(name))
  ipcMain.handle('group:rename', (_e, oldName: string, newName: string) =>
    renameGroup(oldName, newName)
  )
  ipcMain.handle('group:delete', (_e, name: string, moveTo: string) => deleteGroup(name, moveTo))

  // ── 备份与数据 ──
  ipcMain.handle('backup:list', () => listBackups())
  ipcMain.handle('backup:create', () => createBackup())
  ipcMain.handle('backup:restore', (_e, name: string) => restoreBackup(name))
  ipcMain.handle('backup:delete', (_e, name: string) => deleteBackup(name))
  ipcMain.handle('data:export', () => exportData())
  ipcMain.handle('data:import', () => importData())

  // ── 扫描与导入 ──
  ipcMain.handle('scan:run', async () => {
    const settings = getScanSettings()
    return scanDirectories(settings.scanDirs, settings.scanDepth)
  })
  ipcMain.handle('project:inspect', (_e, dir: string) => inspectDirectory(dir))
  ipcMain.handle(
    'project:add',
    (
      _e,
      dir: string,
      opts: {
        name: string
        type: string
        typeConfig: ProjectTypeConfig
        groupName?: string
        gitRoot?: string | null
      }
    ) => {
      const resolved = path.resolve(dir)
      if (!fs.existsSync(resolved)) throw new Error(t('main.dirNotFound'))
      return upsertProject(resolved, {
        name: opts.name,
        type: opts.type,
        typeConfig: opts.typeConfig ?? {},
        groupName: opts.groupName,
        gitRoot: opts.gitRoot
      })
    }
  )
  ipcMain.handle(
    'project:update',
    (
      _e,
      id: string,
      patch: {
        name?: string
        groupName?: string
        gitRoot?: string | null
        typeConfig?: ProjectTypeConfig
      }
    ) => updateProjectRecord(id, patch)
  )
  ipcMain.handle('project:list', async () => {
    const records = listProjects()
    return Promise.all(records.map(enrich))
  })
  ipcMain.handle('project:remove', (_e, id: string) => {
    // 有运行中任务先停止
    taskManager.stop(id)
    deleteProject(id)
  })
  ipcMain.handle('project:trash', async (_e, id: string) => {
    const record = getProject(id)
    if (!record) throw new Error(t('main.projectNotFound'))
    taskManager.stop(id)
    await shell.trashItem(record.path)
    deleteProject(id)
  })

  // ── package.json ──
  ipcMain.handle('package:read', async (_e, id: string) => {
    const record = getProject(id)
    if (!record) throw new Error(t('main.projectNotFound'))
    return fs.promises.readFile(path.join(record.path, 'package.json'), 'utf-8')
  })
  ipcMain.handle('package:write', async (_e, id: string, content: string) => {
    const record = getProject(id)
    if (!record) throw new Error(t('main.projectNotFound'))
    JSON.parse(content) // 校验失败会抛错，不落盘
    await fs.promises.writeFile(path.join(record.path, 'package.json'), content, 'utf-8')
  })

  // ── 任务 ──
  ipcMain.handle('task:start', (_e, projectId: string, script: string) => {
    const record = getProject(projectId)
    if (!record) throw new Error(t('main.projectNotFound'))
    return taskManager.start(record, script)
  })
  ipcMain.handle(
    'task:startCommand',
    (_e, projectId: string, label: string, command: string, args?: string[]) => {
      const record = getProject(projectId)
      if (!record) throw new Error(t('main.projectNotFound'))
      if (!label?.trim()) throw new Error(t('main.emptyLabel'))
      if (!command?.trim()) throw new Error(t('main.emptyCommand'))
      return taskManager.startCommand(record, label.trim(), command.trim(), args)
    }
  )
  ipcMain.handle('task:stop', (_e, projectId: string, runId?: number) => {
    taskManager.stop(projectId, runId)
  })
  ipcMain.handle('task:running', () => taskManager.listRunning())
  ipcMain.handle('task:history', (_e, projectId: string) => listRunsByProject(projectId))
  ipcMain.handle('logs:get', (_e, runId: number) => {
    const run = getRun(runId)
    if (!run) throw new Error(t('main.runNotFound'))
    return getLogs(runId)
  })

  // ── AI 库与落盘 ──
  ipcMain.handle('aiLibrary:get', () => getAiLibrary())
  ipcMain.handle('aiLibrary:save', (_e, lib: AiLibrary) => saveAiLibrary(lib))
  ipcMain.handle('aiLibrary:restore', () => restoreDefaultAgents())
  ipcMain.handle('project:writeAiFiles', (_e, projectId: string, ai?: ProjectAiConfig) =>
    writeProjectAiFiles(projectId, ai)
  )

  // ── 浏览器 / 文件 ──
  ipcMain.handle('browser:open', (_e, projectId: string) => openProjectInBrowser(projectId))
  ipcMain.handle('shell:openPath', (_e, dir: string) => shell.openPath(dir))
  ipcMain.handle('shell:openTerminal', (_e, dir: string) => openTerminal(dir, getTerminalSetting()))
  ipcMain.handle('shell:openEditor', (_e, dir: string) => openEditorAt(dir))

  // ── git ──
  /** dir 为项目路径（自动向上解析仓库根）；gitRoot 为项目手动指定的仓库根 */
  ipcMain.handle('git:info', (_e, dir: string, gitRoot?: string | null) =>
    gitInfoAt(resolveGitRoot(dir, gitRoot))
  )
  ipcMain.handle('git:switch', async (_e, root: string, branch: string) => {
    if (!root) throw new Error(t('main.noGitRepo'))
    await gitSwitch(root, branch)
    return gitInfoAt(root)
  })
  ipcMain.handle('git:fetch', async (_e, root: string) => {
    if (!root) throw new Error(t('main.noGitRepo'))
    await gitFetch(root)
    return gitInfoAt(root)
  })
  ipcMain.handle('git:scan', () => scanGit())
  ipcMain.handle('git:check', (_e, file: string) => checkGitExe(file))
}

export function broadcastToWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
