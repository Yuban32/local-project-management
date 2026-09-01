import { app, BrowserWindow, dialog } from 'electron'
import path from 'node:path'
import { initDb } from './db'
import { initMainI18n, t } from './i18n'
import { registerIpc, broadcastToWindows } from './ipc'
import { taskManager } from './tasks'
import { startAutoBackup } from './backup'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    // 标题读主进程 i18n（已按设置语言初始化），页面加载后由渲染层 document.title 动态接管
    title: t('app.title'),
    backgroundColor: '#141414',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  // 数据库先于 i18n 初始化：主进程文案优先读取设置中心选择的语言
  try {
    initDb()
  } catch (err) {
    dialog.showErrorBox('数据库初始化失败', String(err))
    app.quit()
    return
  }
  initMainI18n()
  // 始终开启无障碍树（UIA/读屏可访问渲染层，代价可接受）
  app.setAccessibilitySupportEnabled(true)
  taskManager.init(broadcastToWindows)
  registerIpc()
  startAutoBackup()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  // 退出前终止全部运行中任务，避免残留 dev server 进程
  taskManager.killAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
