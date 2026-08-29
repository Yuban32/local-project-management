import { app, dialog } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { closeDb, dbFilePath, exportTo, getSetting, initDb, setSetting } from './db'
import { getAppSettings } from './config'
import { taskManager } from './tasks'
import { t } from './i18n'
import type { BackupItem } from '../shared/types'

/**
 * 备份与数据管理：
 * - 备份/导出用 VACUUM INTO 产出一致性快照（无需停机，输出为独立回滚日志模式的 db 文件）
 * - 恢复/导入 = 停止运行任务 → 关库 → 覆盖 app.db → 重新 initDb
 * - 自动备份由主进程调度：启动时与运行期间定期检查，超过间隔执行
 */

const BACKUP_DIR = 'backups'
const LAST_BACKUP_KEY = 'lastBackupAt'
const DAY_MS = 24 * 60 * 60 * 1000
/** 运行期间自动备份检查周期 */
const AUTO_BACKUP_CHECK_MS = 30 * 60 * 1000

function backupsDir(): string {
  return path.join(app.getPath('userData'), BACKUP_DIR)
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** 校验备份文件名（防路径穿越）并解析为完整路径 */
function resolveBackupFile(name: string): string {
  if (!/^[\w.-]+\.db$/.test(name) || name.includes('..')) throw new Error(t('main.backupNotFound'))
  return path.join(backupsDir(), name)
}

function statItem(file: string): BackupItem {
  const st = fs.statSync(file)
  return { name: path.basename(file), path: file, size: st.size, mtime: st.mtimeMs }
}

function listBackupFiles(): BackupItem[] {
  const dir = backupsDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => statItem(path.join(dir, f)))
    .sort((a, b) => b.mtime - a.mtime)
}

/** 按保留份数清理最旧备份（listBackupFiles 已按新到旧排序） */
function pruneBackups(keep: number): void {
  for (const item of listBackupFiles().slice(Math.max(1, keep))) {
    try {
      fs.rmSync(item.path, { force: true })
    } catch {
      // 清理失败不影响本次备份
    }
  }
}

export function createBackup(): BackupItem {
  const dir = backupsDir()
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `app-${timestamp()}.db`)
  exportTo(file)
  setSetting(LAST_BACKUP_KEY, String(Date.now()))
  pruneBackups(getAppSettings().autoBackup.keep)
  return statItem(file)
}

export function listBackups(): BackupItem[] {
  return listBackupFiles()
}

export function deleteBackup(name: string): void {
  fs.rmSync(resolveBackupFile(name), { force: true })
}

export function restoreBackup(name: string): void {
  const file = resolveBackupFile(name)
  if (!fs.existsSync(file)) throw new Error(t('main.backupNotFound'))
  replaceDatabaseWith(file)
}

/**
 * 用外部 db 文件替换当前数据库：
 * 先在临时目录校验副本，再停任务、关库、覆盖、重建连接；失败时旧库文件保持原样。
 */
export function replaceDatabaseWith(file: string): void {
  const tmp = path.join(os.tmpdir(), `launcher-import-${Date.now()}.db`)
  fs.copyFileSync(file, tmp)
  try {
    validateDbFile(tmp)
    taskManager.killAll()
    closeDb()
    try {
      fs.copyFileSync(tmp, dbFilePath())
      for (const suffix of ['-wal', '-shm']) {
        const p = dbFilePath() + suffix
        if (fs.existsSync(p)) fs.rmSync(p, { force: true })
      }
    } finally {
      initDb()
    }
  } finally {
    cleanupTmp(tmp)
  }
}

/** 校验文件为包含全部必需数据表的应用数据库 */
function validateDbFile(file: string): void {
  let check: DatabaseSync
  try {
    check = new DatabaseSync(file)
  } catch {
    throw new Error(t('main.dbImportInvalid'))
  }
  try {
    const tables = check.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string
    }[]
    const names = new Set(tables.map((r) => r.name))
    for (const required of ['projects', 'settings', 'runs', 'logs']) {
      if (!names.has(required)) throw new Error(t('main.dbImportInvalid'))
    }
  } finally {
    check.close()
  }
}

function cleanupTmp(tmp: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(tmp + suffix, { force: true })
    } catch {
      // 临时文件清理失败可忽略
    }
  }
}

/** 弹出保存框导出数据库；取消返回 null */
export async function exportData(): Promise<string | null> {
  let defaultDir: string
  try {
    defaultDir = app.getPath('downloads')
  } catch {
    defaultDir = app.getPath('userData')
  }
  const result = await dialog.showSaveDialog({
    title: t('prefs.exportBtn'),
    defaultPath: path.join(defaultDir, `launcher-${timestamp()}.db`),
    filters: [{ name: 'SQLite DB', extensions: ['db'] }]
  })
  if (result.canceled || !result.filePath) return null
  try {
    exportTo(result.filePath)
  } catch (err) {
    throw new Error(t('main.exportFailed', { error: String(err) }))
  }
  return result.filePath
}

/** 弹出选择框导入数据库（覆盖当前数据）；取消返回 false */
export async function importData(): Promise<boolean> {
  const result = await dialog.showOpenDialog({
    title: t('prefs.importBtn'),
    properties: ['openFile'],
    filters: [{ name: 'SQLite DB', extensions: ['db'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return false
  replaceDatabaseWith(result.filePaths[0])
  return true
}

/** 自动备份调度：启动时与运行期间每 30 分钟检查一次 */
export function startAutoBackup(): void {
  const run = (): void => {
    try {
      const { enabled, intervalDays } = getAppSettings().autoBackup
      if (!enabled) return
      const last = Number(getSetting(LAST_BACKUP_KEY) ?? 0)
      if (Date.now() - last < intervalDays * DAY_MS) return
      createBackup()
    } catch {
      // 自动备份失败静默；手动备份可见错误
    }
  }
  run()
  setInterval(run, AUTO_BACKUP_CHECK_MS).unref()
}
