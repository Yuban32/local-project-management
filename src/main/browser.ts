import { shell } from 'electron'
import { getProject, getLogs, listRunsByProject } from './db'
import { getAdapter } from './adapters'
import { taskManager } from './tasks'
import { t } from './i18n'

/**
 * 打开项目到浏览器：
 * 1. 用户手动配置的 browserUrl 优先
 * 2. 运行中任务的日志里探测 localhost URL
 * 3. 最近一次运行落库的日志里探测
 */
export async function openProjectInBrowser(projectId: string): Promise<string> {
  const project = getProject(projectId)
  if (!project) throw new Error(t('main.projectNotFound'))

  const configured = project.typeConfig.browserUrl?.trim()
  if (configured) {
    await shell.openExternal(configured)
    return configured
  }

  const adapter = getAdapter(project.type)
  if (!adapter.resolveBrowserUrl) {
    throw new Error(t('main.browserUnsupported'))
  }

  for (const task of taskManager.listByProject(projectId)) {
    const url = adapter.resolveBrowserUrl(taskManager.getLogText(task.runId) ?? '')
    if (url) {
      await shell.openExternal(url)
      return url
    }
  }

  const recentRuns = listRunsByProject(projectId, 5)
  for (const run of recentRuns) {
    if (run.status === 'running') continue
    const text = getLogs(run.id)
      .map((l) => l.line)
      .join('\n')
    const url = adapter.resolveBrowserUrl(text)
    if (url) {
      await shell.openExternal(url)
      return url
    }
  }

  throw new Error(t('main.noServiceUrl'))
}
