import type { ProjectRecord, SpawnSpec, TypeInfo } from '../../shared/types'

/**
 * 项目类型适配器接口 —— 启动器可扩展性的核心。
 *
 * 进程管理、日志、git、删除等通用能力不感知项目类型，只调用适配器接口；
 * 新增一种项目类型（java/python/docker…）只需：
 *   1. 新建 src/main/adapters/<type>.ts 实现 ProjectTypeAdapter
 *   2. 在 adapters/index.ts 注册表中登记
 *   3. UI 上放开该类型的「即将支持」禁用项
 */

export interface ProjectTypeAdapter {
  /** 类型 id，如 'node' */
  id: string
  /** 展示名，如 'Node.js' */
  label: string
  /** 是否已实现（未实现仅在导入 UI 中展示为「即将支持」） */
  implemented: boolean
  /** 自动识别：给定目录是否属于该类型 */
  detect(dir: string): Promise<boolean>
  /** 加载类型专属信息（脚本列表、包管理器等），用于导入表单与卡片展示 */
  loadInfo(dir: string): Promise<TypeInfo>
  /** 产出一次任务的执行规格 */
  buildSpawn(project: ProjectRecord, scriptId: string): SpawnSpec
  /** 从任务日志文本中解析浏览器可访问地址；不支持则不实现 */
  resolveBrowserUrl?(logText: string): string | null
}
