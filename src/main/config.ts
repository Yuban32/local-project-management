import { getSetting, setSetting } from './db'
import type {
  AppSettings,
  AutoBackupSettings,
  Language,
  ScanSettings,
  TerminalKind
} from '../shared/types'

const SCAN_KEY = 'scan'
const APP_KEY = 'app'

const TERMINAL_KINDS: TerminalKind[] = ['auto', 'wt', 'gitbash', 'cmd', 'powershell']
const LANGUAGES: Language[] = ['zh-CN', 'en-US']

const DEFAULT_SCAN_SETTINGS: ScanSettings = { scanDirs: [], scanDepth: 2, terminal: 'auto' }

const DEFAULT_AUTO_BACKUP: AutoBackupSettings = { enabled: false, intervalDays: 1, keep: 7 }

const DEFAULT_APP_SETTINGS: AppSettings = { autoBackup: { ...DEFAULT_AUTO_BACKUP } }

export function getAppSettings(): AppSettings {
  try {
    const raw = getSetting(APP_KEY)
    if (!raw) return { ...DEFAULT_APP_SETTINGS, autoBackup: { ...DEFAULT_AUTO_BACKUP } }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const ab = (parsed.autoBackup ?? {}) as Partial<AutoBackupSettings>
    return {
      language:
        parsed.language && LANGUAGES.includes(parsed.language) ? parsed.language : undefined,
      autoBackup: {
        enabled: ab.enabled === true,
        intervalDays: Math.min(30, Math.max(1, Math.round(ab.intervalDays ?? 1))),
        keep: Math.min(50, Math.max(1, Math.round(ab.keep ?? 7)))
      },
      gitPath: parsed.gitPath?.trim() || undefined,
      editorPath: parsed.editorPath?.trim() || undefined
    }
  } catch {
    return { ...DEFAULT_APP_SETTINGS, autoBackup: { ...DEFAULT_AUTO_BACKUP } }
  }
}

export function saveAppSettings(settings: AppSettings): void {
  const language =
    settings.language && LANGUAGES.includes(settings.language) ? settings.language : undefined
  const ab = settings.autoBackup ?? DEFAULT_AUTO_BACKUP
  const autoBackup: AutoBackupSettings = {
    enabled: ab.enabled === true,
    intervalDays: Math.min(30, Math.max(1, Math.round(ab.intervalDays ?? 1))),
    keep: Math.min(50, Math.max(1, Math.round(ab.keep ?? 7)))
  }
  const gitPath = settings.gitPath?.trim() || undefined
  const editorPath = settings.editorPath?.trim() || undefined
  setSetting(APP_KEY, JSON.stringify({ language, autoBackup, gitPath, editorPath }))
}

export function getScanSettings(): ScanSettings {
  try {
    const raw = getSetting(SCAN_KEY)
    if (!raw) return { ...DEFAULT_SCAN_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<ScanSettings>
    return {
      scanDirs: Array.isArray(parsed.scanDirs) ? parsed.scanDirs : [],
      scanDepth: typeof parsed.scanDepth === 'number' ? parsed.scanDepth : 2,
      terminal:
        parsed.terminal && TERMINAL_KINDS.includes(parsed.terminal) ? parsed.terminal : 'auto'
    }
  } catch {
    return { ...DEFAULT_SCAN_SETTINGS }
  }
}

export function saveScanSettings(settings: ScanSettings): void {
  const terminal =
    settings.terminal && TERMINAL_KINDS.includes(settings.terminal) ? settings.terminal : 'auto'
  setSetting(
    SCAN_KEY,
    JSON.stringify({
      scanDirs: settings.scanDirs.map((d) => d.trim()).filter(Boolean),
      scanDepth: Math.min(5, Math.max(0, Math.round(settings.scanDepth))),
      terminal
    })
  )
}

export function getTerminalSetting(): TerminalKind {
  return getScanSettings().terminal ?? 'auto'
}
