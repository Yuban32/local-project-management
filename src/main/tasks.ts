import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { appendLogs, finishRun, insertRun, updateRunPid } from './db'
import { getAdapter } from './adapters'
import { t } from './i18n'
import type { LogLine, ProjectRecord, RunInfo, RunStatus } from '../shared/types'

/**
 * 任务进程管理器：
 * - spawn 执行适配器产出的命令（shell: true，Windows 下经 cmd 解析 npm.cmd/pnpm.cmd）
 * - 日志环形缓冲 + 批量落库 + 批量推送渲染层
 * - Windows 用 taskkill /T /F 杀整棵进程树（npm run 会派生子进程，只杀 shell 会残留 dev server）
 * - POSIX spawn detached 并用 process.kill(-pid) 杀进程组
 */

const MAX_BUFFER_LINES = 5000
const FLUSH_INTERVAL_MS = 400

interface RunningTask {
  runId: number
  projectId: string
  type: string
  script: string
  pid: number | null
  child: ChildProcess
  status: RunStatus
  /** 用户主动停止：Windows taskkill /F 的退出码是 1，需按「已退出」而非「失败」记录 */
  stopping: boolean
  startedAt: number
  logBuffer: string[]
  outBuf: string
  errBuf: string
}

type Broadcast = (channel: string, payload: unknown) => void

export class TaskManager {
  private tasks = new Map<number, RunningTask>()
  private logQueue: LogLine[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private broadcast: Broadcast = () => {}

  init(broadcast: Broadcast): void {
    this.broadcast = broadcast
  }

  listRunning(): RunInfo[] {
    return [...this.tasks.values()]
      .filter((t) => t.status === 'running')
      .map((t) => this.toRunInfo(t))
  }

  listByProject(projectId: string): RunningTask[] {
    return [...this.tasks.values()].filter(
      (t) => t.projectId === projectId && t.status === 'running'
    )
  }

  getLogText(runId: number): string | null {
    const task = this.tasks.get(runId)
    return task ? task.logBuffer.join('\n') : null
  }

  /** 启动包管理器脚本（走适配器 buildSpawn 产出命令） */
  start(project: ProjectRecord, script: string): RunInfo {
    const spec = getAdapter(project.type).buildSpawn(project, script)
    return this.spawnTask(project, script, spec.cmd, spec.args)
  }

  /**
   * 运行自定义命令（快捷方式）：
   * label 作为 runs.script（日志抽屉 / 运行历史 / 卡片运行状态显示人类可读名），
   * command 原样交给 shell:true 执行（Windows 经 cmd.exe /d /s /c），cwd = 项目目录。
   */
  startCommand(project: ProjectRecord, label: string, command: string, args?: string[]): RunInfo {
    return this.spawnTask(project, label, command, args ?? [])
  }

  /** 统一 spawn 机制：去重 → 落库 → spawn 监听 → 推送 */
  private spawnTask(project: ProjectRecord, script: string, cmd: string, args: string[]): RunInfo {
    const existing = this.listByProject(project.id).find((t) => t.script === script)
    if (existing) {
      throw new Error(t('main.scriptRunning', { script }))
    }

    const runId = insertRun(project.id, project.type, script, null)
    const child = spawn(cmd, args, {
      cwd: project.path,
      shell: true,
      detached: process.platform !== 'win32',
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0' }
    })

    const task: RunningTask = {
      runId,
      projectId: project.id,
      type: project.type,
      script,
      pid: child.pid ?? null,
      child,
      status: 'running',
      stopping: false,
      startedAt: Date.now(),
      logBuffer: [],
      outBuf: '',
      errBuf: ''
    }
    this.tasks.set(runId, task)
    if (child.pid) updateRunPid(runId, child.pid)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => this.onData(task, 'out', chunk))
    child.stderr?.on('data', (chunk: string) => this.onData(task, 'err', chunk))
    child.on('error', (err) => {
      this.pushLog(task, 'err', t('main.taskStartFailed', { error: err.message }))
      this.close(task, null, null)
    })
    child.on('close', (code, signal) => this.close(task, code, signal))

    this.broadcast('task:status', this.toRunInfo(task))
    return this.toRunInfo(task)
  }

  /** runId 缺省 = 停止该项目全部运行中任务 */
  stop(projectId: string, runId?: number): void {
    const targets = [...this.tasks.values()].filter(
      (t) => t.projectId === projectId && (runId === undefined || t.runId === runId)
    )
    for (const task of targets) this.kill(task)
  }

  /** 应用退出时终止全部任务（taskkill 进程独立存活，父进程退出不影响其执行） */
  killAll(): void {
    for (const task of this.tasks.values()) {
      if (task.status === 'running') this.kill(task)
    }
  }

  private kill(task: RunningTask): void {
    if (task.status !== 'running') return
    task.stopping = true
    if (process.platform === 'win32') {
      if (task.pid) {
        execFile(
          'taskkill',
          ['/pid', String(task.pid), '/T', '/F'],
          { windowsHide: true },
          () => {}
        )
      }
    } else if (task.pid) {
      try {
        process.kill(-task.pid, 'SIGTERM')
      } catch {
        try {
          task.child.kill('SIGTERM')
        } catch {
          // 进程已退出
        }
      }
      setTimeout(() => {
        if (task.status === 'running' && task.pid) {
          try {
            process.kill(-task.pid, 'SIGKILL')
          } catch {
            // 已退出
          }
        }
      }, 3000).unref()
    }
  }

  private onData(task: RunningTask, stream: 'out' | 'err', chunk: string): void {
    const bufKey = stream === 'out' ? 'outBuf' : 'errBuf'
    task[bufKey] += chunk
    const parts = task[bufKey].split(/\r\n|\r|\n/)
    task[bufKey] = parts.pop() ?? ''
    for (const line of parts) this.pushLog(task, stream, line)
  }

  private pushLog(task: RunningTask, stream: 'out' | 'err', rawLine: string): void {
    const line = stripAnsi(rawLine)
    task.logBuffer.push(line)
    if (task.logBuffer.length > MAX_BUFFER_LINES) task.logBuffer.shift()
    this.logQueue.push({ runId: task.runId, ts: Date.now(), stream, line })
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, FLUSH_INTERVAL_MS)
  }

  private flush(): void {
    if (this.logQueue.length === 0) return
    const batch = this.logQueue
    this.logQueue = []
    try {
      appendLogs(batch)
    } catch {
      // 落库失败不影响运行
    }
    this.broadcast('logs:append', batch)
  }

  private close(task: RunningTask, code: number | null, signal: NodeJS.Signals | null): void {
    if (task.status !== 'running') return
    if (task.outBuf) this.pushLog(task, 'out', task.outBuf)
    if (task.errBuf) this.pushLog(task, 'err', task.errBuf)
    task.outBuf = ''
    task.errBuf = ''

    const killed = signal === 'SIGTERM' || signal === 'SIGKILL'
    const status: RunStatus = task.stopping || killed || code === 0 ? 'exited' : 'failed'
    task.status = status

    try {
      finishRun(task.runId, status as 'exited' | 'failed', code)
    } catch {
      // 忽略落库失败
    }
    this.flush()
    this.broadcast('task:status', this.toRunInfo(task))
    // 保留运行结束信息供状态展示，延迟清理
    setTimeout(() => {
      if (this.tasks.get(task.runId)?.status !== 'running') this.tasks.delete(task.runId)
    }, 30_000).unref()
  }

  private toRunInfo(task: RunningTask): RunInfo {
    return {
      id: task.runId,
      projectId: task.projectId,
      type: task.type,
      script: task.script,
      status: task.status,
      pid: task.pid,
      startedAt: task.startedAt,
      endedAt: task.status === 'running' ? null : Date.now(),
      exitCode: null
    }
  }
}

const ANSI_RE = new RegExp(String.fromCharCode(27) + String.raw`\[[0-9;?]*[ -/]*[@-~]`, 'g')

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

export const taskManager = new TaskManager()
