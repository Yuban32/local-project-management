import type { ProjectTypeMeta } from '../../shared/types'
import { nodeAdapter } from './node'
import { t } from '../i18n'
import type { ProjectTypeAdapter } from './types'

/**
 * 项目类型注册表。
 * 目前仅实现 node；java/python 等作为占位类型在 UI 中显示「即将支持」，
 * 接入时实现 ProjectTypeAdapter 并加入 ADAPTERS / FUTURE_TYPES。
 */
const ADAPTERS: Record<string, ProjectTypeAdapter> = {
  [nodeAdapter.id]: nodeAdapter
}

const FUTURE_TYPES: ProjectTypeMeta[] = [
  { id: 'java', label: 'Java', implemented: false },
  { id: 'python', label: 'Python', implemented: false },
  { id: 'docker', label: 'Docker', implemented: false }
]

export function getAdapter(type: string): ProjectTypeAdapter {
  const adapter = ADAPTERS[type]
  if (!adapter) throw new Error(t('main.typeUnsupported', { type }))
  return adapter
}

export function listTypes(): ProjectTypeMeta[] {
  const implemented = Object.values(ADAPTERS).map((a) => ({
    id: a.id,
    label: a.label,
    implemented: a.implemented
  }))
  return [...implemented, ...FUTURE_TYPES]
}

/** 自动识别目录类型，未识别返回 null */
export async function detectType(dir: string): Promise<ProjectTypeAdapter | null> {
  for (const adapter of Object.values(ADAPTERS)) {
    if (await adapter.detect(dir)) return adapter
  }
  return null
}
