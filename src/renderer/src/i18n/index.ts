import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { locales, resolveLocale } from '../../../shared/locales'

/**
 * 渲染层 i18n：
 * - 语言包来自 shared/locales（与主进程共用一套字典）
 * - 默认跟随系统语言；用户手动选择后记忆在 localStorage
 * - antd 组件文案随 i18n 语言联动（main.tsx 中读取 antdLocales）
 */

const STORAGE_KEY = 'launcher.lang'

function detectLanguage(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && stored in locales) return stored
  } catch {
    // localStorage 不可用时走系统语言
  }
  return resolveLocale(navigator.language)
}

void i18next.use(initReactI18next).init({
  lng: detectLanguage(),
  fallbackLng: 'en-US',
  resources: {
    'zh-CN': { translation: locales['zh-CN'] },
    'en-US': { translation: locales['en-US'] }
  },
  interpolation: { escapeValue: false }
})

/** 手动切换语言并记忆（语言选择器调用） */
export function setLanguage(lng: string): void {
  void i18next.changeLanguage(lng)
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    // 忽略持久化失败
  }
}

/** antd 组件文案映射（新增语言时在 shared/locales 注册后，这里补一行） */
export const antdLocales: Record<string, typeof enUS> = {
  'zh-CN': zhCN,
  'en-US': enUS
}

export default i18next
