import type { MessageInstance } from 'antd/es/message/interface'

/**
 * antd message 实例桥：ConfigProvider 深色主题下静态 message 不继承主题，
 * 由 <App> 组件在挂载时绑定 useApp() 实例，供非组件代码（zustand store 等）使用。
 */
export let toast: MessageInstance

export function bindToast(instance: MessageInstance): void {
  toast = instance
}
