import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Drawer, Select, Space, Switch, Tag, Tooltip, App } from 'antd'
import { ClearOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { LogLine, RunInfo } from '../../../shared/types'
import { useStore } from '../store'

const MAX_VIEW_LINES = 3000

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 日志抽屉：按运行 Tab 分组，流式追加，历史从 SQLite 回看 */
export default function LogDrawer() {
  const { message } = App.useApp()
  const { t } = useTranslation()
  const projectId = useStore((s) => s.logProjectId)
  const projects = useStore((s) => s.projects)
  const running = useStore((s) => s.running)
  const close = useStore((s) => s.closeLog)

  const [runs, setRuns] = useState<RunInfo[]>([])
  const [activeRunId, setActiveRunId] = useState<number | null>(null)
  const [lines, setLines] = useState<LogLine[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const preRef = useRef<HTMLPreElement>(null)

  const project = projects.find((p) => p.id === projectId)

  const loadRuns = useCallback(async () => {
    if (!projectId) return
    try {
      const history = await window.api.getHistory(projectId)
      const live = running.filter((r) => r.projectId === projectId)
      const merged = new Map<number, RunInfo>()
      for (const r of [...live, ...history]) merged.set(r.id, r)
      const list = [...merged.values()].sort((a, b) => b.id - a.id).slice(0, 20)
      setRuns(list)
      setActiveRunId((cur) => (cur && list.some((r) => r.id === cur) ? cur : (list[0]?.id ?? null)))
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const loadLines = useCallback(async (runId: number) => {
    try {
      setLines(await window.api.getLogs(runId))
    } catch {
      setLines([])
    }
  }, [])

  // 打开/切换项目时加载运行列表
  useEffect(() => {
    if (projectId) void loadRuns()
  }, [projectId, loadRuns])

  // 切换运行时加载日志
  useEffect(() => {
    if (activeRunId) void loadLines(activeRunId)
  }, [activeRunId, loadLines])

  // 订阅日志流与状态事件（仅抽屉打开期间）
  useEffect(() => {
    if (!projectId) return
    const offLog = window.api.onLog((batch) => {
      const relevant = batch.filter((l) => l.runId === activeRunId)
      if (relevant.length > 0) {
        setLines((prev) => {
          const next = [...prev, ...relevant]
          return next.length > MAX_VIEW_LINES ? next.slice(next.length - MAX_VIEW_LINES) : next
        })
      }
    })
    const offStatus = window.api.onTaskStatus((run) => {
      if (run.projectId !== projectId) return
      setRuns((prev) => {
        const exists = prev.some((r) => r.id === run.id)
        return exists ? prev.map((r) => (r.id === run.id ? run : r)) : [run, ...prev].slice(0, 20)
      })
    })
    return () => {
      offLog()
      offStatus()
    }
  }, [projectId, activeRunId])

  // 自动滚动
  useEffect(() => {
    if (autoScroll && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const copyAll = async (): Promise<void> => {
    await navigator.clipboard.writeText(lines.map((l) => l.line).join('\n'))
    message.success(t('log.copied'))
  }

  const statusColor = (status: RunInfo['status']): string =>
    status === 'running' ? 'processing' : status === 'failed' ? 'error' : 'default'

  const statusLabel = (status: RunInfo['status']): string =>
    status === 'running'
      ? t('log.running')
      : status === 'failed'
        ? t('log.failed')
        : t('log.exited')

  return (
    <Drawer
      open={projectId !== null}
      onClose={close}
      width={760}
      title={
        <Space>
          <span>{t('log.title')}</span>
          {project && <Tag color="geekblue">{project.name}</Tag>}
        </Space>
      }
      destroyOnClose
    >
      <div className="log-toolbar">
        <Select
          style={{ minWidth: 260 }}
          placeholder={t('log.pickRun')}
          value={activeRunId ?? undefined}
          onChange={(v) => setActiveRunId(v)}
          options={runs.map((r) => ({
            value: r.id,
            label: (
              <Space size={6}>
                <Tag color={statusColor(r.status)} style={{ marginRight: 0 }}>
                  {statusLabel(r.status)}
                </Tag>
                <span>{r.script}</span>
                <span className="log-time">{formatTime(r.startedAt)}</span>
              </Space>
            )
          }))}
          notFoundContent={t('log.noRuns')}
        />
        <Space>
          <span className="log-autoscroll">{t('log.autoScroll')}</span>
          <Switch size="small" checked={autoScroll} onChange={setAutoScroll} />
          <Tooltip title={t('log.reload')}>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => activeRunId && void loadLines(activeRunId)}
            />
          </Tooltip>
          <Tooltip title={t('log.clearView')}>
            <Button size="small" icon={<ClearOutlined />} onClick={() => setLines([])} />
          </Tooltip>
          <Tooltip title={t('log.copyAll')}>
            <Button size="small" icon={<CopyOutlined />} onClick={() => void copyAll()} />
          </Tooltip>
        </Space>
      </div>

      <pre ref={preRef} className="log-pre">
        {lines.length === 0 ? (
          <span className="log-empty">{t('log.empty')}</span>
        ) : (
          lines.map((l, i) => (
            <div key={`${l.ts}-${i}`} className={l.stream === 'err' ? 'log-err' : ''}>
              <span className="log-time-inline">{formatTime(l.ts)} </span>
              {l.line}
            </div>
          ))
        )}
      </pre>
    </Drawer>
  )
}
