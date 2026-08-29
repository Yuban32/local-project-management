import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import crypto from 'node:crypto'
import path from 'node:path'
import { t } from './i18n'
import type {
  GroupInfo,
  LogLine,
  ProjectRecord,
  ProjectTypeConfig,
  RunInfo,
  RunStatus
} from '../shared/types'

/**
 * 数据访问层：全部 SQLite 访问收敛在此。
 * 使用 Electron 内置 node:sqlite（零原生依赖）；如需替换 better-sqlite3 只改本文件。
 */

let db: DatabaseSync

/** 每个项目保留的最近运行次数 */
const MAX_RUNS_PER_PROJECT = 50
/** 每次运行保留的日志行数 */
export const MAX_LOG_LINES_PER_RUN = 2000

export function initDb(): void {
  const file = path.join(app.getPath('userData'), 'app.db')
  console.log('[db] 使用数据库文件:', file)
  db = new DatabaseSync(file)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS groups (
      name       TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      path        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL,
      type_config TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      type       TEXT NOT NULL,
      script     TEXT NOT NULL,
      status     TEXT NOT NULL,
      pid        INTEGER,
      started_at INTEGER NOT NULL,
      ended_at   INTEGER,
      exit_code  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, id);
    CREATE TABLE IF NOT EXISTS logs (
      run_id INTEGER NOT NULL,
      ts     INTEGER NOT NULL,
      stream TEXT NOT NULL,
      line   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_run ON logs(run_id, ts);
  `)
  // 启动时清理超量历史与孤儿日志
  db.exec(`
    DELETE FROM runs WHERE id IN (
      SELECT r.id FROM runs r
      WHERE (SELECT COUNT(*) FROM runs r2 WHERE r2.project_id = r.project_id AND r2.id > r.id)
            >= ${MAX_RUNS_PER_PROJECT}
    );
    DELETE FROM logs WHERE run_id NOT IN (SELECT id FROM runs);
  `)
  ensureColumn('projects', 'group_name', "group_name TEXT NOT NULL DEFAULT ''")
  ensureColumn('projects', 'git_root', 'git_root TEXT')
}

/** 轻量列迁移：不存在则 ALTER TABLE ADD COLUMN */
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

// ───────────────────────── settings ─────────────────────────

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

// ───────────────────────── groups ─────────────────────────

/** 项目写入非空分组名时自动注册，保证 groups 表与实际使用一致 */
function ensureGroup(name: string): void {
  if (!name) return
  db.prepare('INSERT OR IGNORE INTO groups (name, created_at) VALUES (?, ?)').run(name, Date.now())
}

/** 全部分组：groups 表 ∪ 项目实际使用的分组名，附项目数 */
export function listGroups(): GroupInfo[] {
  const rows = db
    .prepare(
      `SELECT g.name AS name,
              (SELECT COUNT(*) FROM projects p WHERE p.group_name = g.name) AS count
       FROM groups g
       UNION ALL
       SELECT p.group_name AS name, COUNT(*) AS count
       FROM projects p
       WHERE p.group_name != '' AND p.group_name NOT IN (SELECT name FROM groups)
       GROUP BY p.group_name
       ORDER BY name`
    )
    .all() as unknown as { name: string; count: number }[]
  return rows.map((r) => ({ name: r.name, count: r.count }))
}

/** 查重（大小写不敏感）：分组名被 groups 表或任何项目占用即视为重复 */
function assertGroupAvailable(name: string, except?: string): void {
  const dup =
    db
      .prepare('SELECT 1 FROM groups WHERE lower(name) = lower(?) AND name != ?')
      .get(name, except ?? name) ??
    db
      .prepare('SELECT 1 FROM projects WHERE lower(group_name) = lower(?) AND group_name != ?')
      .get(name, except ?? name)
  if (dup) throw new Error(t('main.groupExists', { name }))
}

export function createGroup(rawName: string): void {
  const name = rawName.trim()
  if (!name) throw new Error(t('main.groupNameEmpty'))
  assertGroupAvailable(name)
  ensureGroup(name)
}

export function renameGroup(oldName: string, rawNewName: string): void {
  const newName = rawNewName.trim()
  if (!newName) throw new Error(t('main.groupNameEmpty'))
  if (newName === oldName) return
  assertGroupAvailable(newName, oldName)
  const now = Date.now()
  db.exec('BEGIN')
  try {
    db.prepare('INSERT OR IGNORE INTO groups (name, created_at) VALUES (?, ?)').run(newName, now)
    db.prepare('DELETE FROM groups WHERE name = ?').run(oldName)
    db.prepare('UPDATE projects SET group_name = ?, updated_at = ? WHERE group_name = ?').run(
      newName,
      now,
      oldName
    )
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** 删除分组；moveTo 为 '' = 移入未分组，其他 = 移入指定分组 */
export function deleteGroup(name: string, moveTo: string): void {
  const target = moveTo.trim()
  if (target && target !== name) ensureGroup(target)
  const now = Date.now()
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE projects SET group_name = ?, updated_at = ? WHERE group_name = ?').run(
      target,
      now,
      name
    )
    db.prepare('DELETE FROM groups WHERE name = ?').run(name)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ───────────────────────── projects ─────────────────────────

/** 由项目路径生成稳定 id（Windows 大小写不敏感，统一小写） */
export function projectIdFor(projectPath: string): string {
  const normalized = path
    .resolve(projectPath)
    .replace(/[\\/]+$/, '')
    .toLowerCase()
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 16)
}

interface ProjectRow {
  id: string
  path: string
  name: string
  type: string
  group_name: string
  git_root: string | null
  type_config: string
  created_at: number
  updated_at: number
}

function rowToRecord(row: ProjectRow): ProjectRecord {
  let typeConfig: ProjectTypeConfig = {}
  try {
    typeConfig = JSON.parse(row.type_config) as ProjectTypeConfig
  } catch {
    typeConfig = {}
  }
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    type: row.type,
    groupName: row.group_name ?? '',
    gitRoot: row.git_root ?? null,
    typeConfig,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listProjects(): ProjectRecord[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY name').all() as unknown as ProjectRow[]
  return rows.map(rowToRecord)
}

export function getProject(id: string): ProjectRecord | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
  return row ? rowToRecord(row) : null
}

export function getProjectByPath(projectPath: string): ProjectRecord | null {
  const row = db.prepare('SELECT * FROM projects WHERE path = ?').get(path.resolve(projectPath)) as
    ProjectRow | undefined
  return row ? rowToRecord(row) : null
}

export function listProjectPaths(): Set<string> {
  const rows = db.prepare('SELECT path FROM projects').all() as unknown as { path: string }[]
  return new Set(rows.map((r) => r.path.toLowerCase()))
}

export interface UpsertProjectOpts {
  name: string
  type: string
  typeConfig: ProjectTypeConfig
  /** 分组名，缺省 = 未分组 */
  groupName?: string
  /** 手动 git 仓库根：null = 自动检测，'' = 禁用 git，路径 = 指定仓库 */
  gitRoot?: string | null
}

export function upsertProject(projectPath: string, opts: UpsertProjectOpts): ProjectRecord {
  const now = Date.now()
  const id = projectIdFor(projectPath)
  const resolved = path.resolve(projectPath)
  const groupName = opts.groupName?.trim() ?? ''
  const gitRoot = opts.gitRoot === undefined ? null : opts.gitRoot
  ensureGroup(groupName)
  db.prepare(
    `INSERT INTO projects (id, path, name, type, group_name, git_root, type_config, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       group_name = excluded.group_name,
       git_root = excluded.git_root,
       type_config = excluded.type_config,
       updated_at = excluded.updated_at`
  ).run(
    id,
    resolved,
    opts.name,
    opts.type,
    groupName,
    gitRoot,
    JSON.stringify(opts.typeConfig),
    now,
    now
  )
  const record = getProject(id)
  if (!record) throw new Error(t('main.saveFailed', { path: resolved }))
  return record
}

export interface UpdateProjectPatch {
  name?: string
  groupName?: string
  /** null = 恢复自动检测，'' = 禁用 git，路径 = 指定仓库 */
  gitRoot?: string | null
  typeConfig?: ProjectTypeConfig
}

export function updateProjectRecord(id: string, patch: UpdateProjectPatch): ProjectRecord {
  const record = getProject(id)
  if (!record) throw new Error(t('main.projectNotFound'))
  const name = patch.name ?? record.name
  const groupName = patch.groupName !== undefined ? patch.groupName.trim() : record.groupName
  const gitRoot = patch.gitRoot !== undefined ? patch.gitRoot : (record.gitRoot ?? null)
  const typeConfig = patch.typeConfig ?? record.typeConfig
  ensureGroup(groupName)
  db.prepare(
    'UPDATE projects SET name = ?, group_name = ?, git_root = ?, type_config = ?, updated_at = ? WHERE id = ?'
  ).run(name, groupName, gitRoot, JSON.stringify(typeConfig), Date.now(), id)
  const updated = getProject(id)
  if (!updated) throw new Error(t('main.projectNotFound'))
  return updated
}

export function deleteProject(id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

// ───────────────────────── runs ─────────────────────────

export function insertRun(
  projectId: string,
  type: string,
  script: string,
  pid: number | null
): number {
  const result = db
    .prepare(
      'INSERT INTO runs (project_id, type, script, status, pid, started_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(projectId, type, script, 'running', pid, Date.now())
  return Number(result.lastInsertRowid)
}

export function updateRunPid(id: number, pid: number): void {
  db.prepare('UPDATE runs SET pid = ? WHERE id = ?').run(pid, id)
}

export function finishRun(
  id: number,
  status: Extract<RunStatus, 'exited' | 'failed'>,
  exitCode: number | null
): void {
  db.prepare('UPDATE runs SET status = ?, ended_at = ?, exit_code = ? WHERE id = ?').run(
    status,
    Date.now(),
    exitCode,
    id
  )
  // 收敛该次运行的日志行数
  db.prepare(
    `DELETE FROM logs WHERE run_id = ? AND rowid NOT IN (
       SELECT rowid FROM logs WHERE run_id = ? ORDER BY rowid DESC LIMIT ${MAX_LOG_LINES_PER_RUN}
     )`
  ).run(id, id)
}

interface RunRow {
  id: number
  project_id: string
  type: string
  script: string
  status: string
  pid: number | null
  started_at: number
  ended_at: number | null
  exit_code: number | null
}

function rowToRun(row: RunRow): RunInfo {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    script: row.script,
    status: row.status as RunStatus,
    pid: row.pid,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    exitCode: row.exit_code
  }
}

export function getRun(id: number): RunInfo | null {
  const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined
  return row ? rowToRun(row) : null
}

export function listRunsByProject(projectId: string, limit = MAX_RUNS_PER_PROJECT): RunInfo[] {
  const rows = db
    .prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY id DESC LIMIT ?')
    .all(projectId, limit) as unknown as RunRow[]
  return rows.map(rowToRun)
}

// ───────────────────────── logs ─────────────────────────

export function appendLogs(rows: LogLine[]): void {
  if (rows.length === 0) return
  const stmt = db.prepare('INSERT INTO logs (run_id, ts, stream, line) VALUES (?, ?, ?, ?)')
  db.exec('BEGIN')
  try {
    for (const r of rows) stmt.run(r.runId, r.ts, r.stream, r.line)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function getLogs(runId: number, limit = MAX_LOG_LINES_PER_RUN): LogLine[] {
  const rows = db
    .prepare(
      'SELECT run_id, ts, stream, line FROM logs WHERE run_id = ? ORDER BY rowid DESC LIMIT ?'
    )
    .all(runId, limit) as unknown as { run_id: number; ts: number; stream: string; line: string }[]
  return rows
    .reverse()
    .map((r) => ({ runId: r.run_id, ts: r.ts, stream: r.stream as 'out' | 'err', line: r.line }))
}

// ───────────────────────── 快照与替换 ─────────────────────────

/** 数据库文件路径（备份/恢复/导入导出共用） */
export function dbFilePath(): string {
  return path.join(app.getPath('userData'), 'app.db')
}

/** 关闭数据库（替换数据文件前调用，之后需重新 initDb） */
export function closeDb(): void {
  db.close()
}

/** 将当前数据库一致快照写入目标文件（VACUUM INTO，无需停机） */
export function exportTo(file: string): void {
  const escaped = file.replace(/'/g, "''")
  db.exec(`VACUUM INTO '${escaped}'`)
}
