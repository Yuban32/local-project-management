import zhCN from './zh-CN'
import enUS from './en-US'

/**
 * 语言包注册表。
 * 新增语言步骤：
 *   1. 在本目录新建 <locale>.ts，内容 satisfies Dict（与 zh-CN 同结构，缺 key 编译报错）
 *   2. 在 LOCALES 中登记：<locale>: <dict>
 *   3. 渲染层如需 antd 组件文案，在 renderer i18n/antdLocales 中补充对应 antd locale
 */

/** 字典结构以 zh-CN 为准：其他语言 satisfies Dict，缺 key/多 key 都会编译报错 */
export type Dict = typeof zhCN

const LOCALES: Record<string, Dict> = {
  'zh-CN': zhCN,
  'en-US': enUS
}

export type LocaleKey = keyof typeof LOCALES

export const locales = LOCALES as Record<LocaleKey, Dict>

/** 从任意 BCP-47 tag 解析受支持的语言（缺省英文） */
export function resolveLocale(tag: string): LocaleKey {
  const lower = (tag || '').toLowerCase()
  for (const key of Object.keys(LOCALES)) {
    if (lower === key.toLowerCase()) return key as LocaleKey
  }
  if (lower.startsWith('zh')) return 'zh-CN'
  return 'en-US'
}

/** 扁平字典查找：'card.stop' → dict.card.stop */
export function lookup(root: unknown, key: string): string | undefined {
  let cur: unknown = root
  for (const seg of key.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return typeof cur === 'string' ? cur : undefined
}

export { zhCN, enUS }
