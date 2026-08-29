import { app } from 'electron'
import { locales, lookup, resolveLocale } from '../shared/locales'
import { getAppSettings } from './config'

/**
 * 主进程 i18n：错误消息经 IPC 抛给渲染层以 toast 展示。
 * 优先使用设置中心选择的语言（settings 表），否则跟随系统；与渲染层共用 shared/locales 字典。
 */

let current = resolveLocale('en-US')

export function initMainI18n(): void {
  const stored = (() => {
    try {
      return getAppSettings().language
    } catch {
      return undefined // 数据库未就绪等异常时回退系统语言
    }
  })()
  current = stored ?? resolveLocale(app.getLocale())
}

/** 主进程文案：t('main.projectNotFound')；支持 {{var}} 插值 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(locales[current], key) ?? lookup(locales['en-US'], key) ?? key
  if (!vars) return raw
  return raw.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
    name in vars ? String(vars[name]) : `{{${name}}}`
  )
}
