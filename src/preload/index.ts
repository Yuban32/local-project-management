import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { API } from '../shared/api'
import type { LogLine, RunInfo } from '../shared/types'

/**
 * 经 contextBridge 暴露类型安全 API；事件订阅返回取消函数。
 * 通道白名单与 shared/api.ts 一一对应，渲染层无其他 Electron 访问面。
 */
const api: API = {
  // 设置
  getScanSettings: () => ipcRenderer.invoke('settings:get'),
  saveScanSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getAppSettings: () => ipcRenderer.invoke('appSettings:get'),
  saveAppSettings: (settings) => ipcRenderer.invoke('appSettings:save', settings),
  chooseDirectory: () => ipcRenderer.invoke('dialog:chooseDirectory'),
  chooseFile: () => ipcRenderer.invoke('dialog:chooseFile'),
  listTypes: () => ipcRenderer.invoke('types:list'),
  nvmList: () => ipcRenderer.invoke('nvm:list'),
  terminalInfo: () => ipcRenderer.invoke('terminal:info'),
  editorScan: () => ipcRenderer.invoke('editor:scan'),
  editorCheck: (file) => ipcRenderer.invoke('editor:check', file),
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),

  // 分组
  listGroups: () => ipcRenderer.invoke('group:list'),
  createGroup: (name) => ipcRenderer.invoke('group:create', name),
  renameGroup: (oldName, newName) => ipcRenderer.invoke('group:rename', oldName, newName),
  deleteGroup: (name, moveTo) => ipcRenderer.invoke('group:delete', name, moveTo),

  // 备份与数据
  listBackups: () => ipcRenderer.invoke('backup:list'),
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: (name) => ipcRenderer.invoke('backup:restore', name),
  deleteBackup: (name) => ipcRenderer.invoke('backup:delete', name),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),

  // 扫描与导入
  scan: () => ipcRenderer.invoke('scan:run'),
  listProjects: () => ipcRenderer.invoke('project:list'),
  inspect: (dir) => ipcRenderer.invoke('project:inspect', dir),
  addProject: (dir, opts) => ipcRenderer.invoke('project:add', dir, opts),
  updateProject: (id, patch) => ipcRenderer.invoke('project:update', id, patch),
  removeProject: (id) => ipcRenderer.invoke('project:remove', id),
  trashProject: (id) => ipcRenderer.invoke('project:trash', id),

  // package.json
  readPackageJson: (id) => ipcRenderer.invoke('package:read', id),
  writePackageJson: (id, content) => ipcRenderer.invoke('package:write', id, content),

  // 任务
  startTask: (projectId, script) => ipcRenderer.invoke('task:start', projectId, script),
  stopTask: (projectId, runId) => ipcRenderer.invoke('task:stop', projectId, runId),
  listRunning: () => ipcRenderer.invoke('task:running'),
  getHistory: (projectId) => ipcRenderer.invoke('task:history', projectId),
  getLogs: (runId) => ipcRenderer.invoke('logs:get', runId),

  // 浏览器 / 文件
  openBrowser: (projectId) => ipcRenderer.invoke('browser:open', projectId),
  openPath: (dir) => ipcRenderer.invoke('shell:openPath', dir),
  openTerminal: (dir) => ipcRenderer.invoke('shell:openTerminal', dir),
  openEditor: (dir) => ipcRenderer.invoke('shell:openEditor', dir),

  // git
  gitInfo: (dir) => ipcRenderer.invoke('git:info', dir),
  gitSwitch: (dir, branch) => ipcRenderer.invoke('git:switch', dir, branch),
  gitScan: () => ipcRenderer.invoke('git:scan'),
  gitCheck: (file) => ipcRenderer.invoke('git:check', file),

  // 事件
  onLog: (cb) => {
    const handler = (_e: IpcRendererEvent, lines: LogLine[]): void => cb(lines)
    ipcRenderer.on('logs:append', handler)
    return () => ipcRenderer.removeListener('logs:append', handler)
  },
  onTaskStatus: (cb) => {
    const handler = (_e: IpcRendererEvent, run: RunInfo): void => cb(run)
    ipcRenderer.on('task:status', handler)
    return () => ipcRenderer.removeListener('task:status', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
