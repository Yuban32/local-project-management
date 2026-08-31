import { useMemo } from 'react'
import {
  AppstoreOutlined,
  CaretRightFilled,
  CaretRightOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  GlobalOutlined,
  MoreOutlined,
  ReloadOutlined,
  StopOutlined
} from '@ant-design/icons'
import { App, Button, Card, Checkbox, Dropdown, Space, Tag, Tooltip } from 'antd'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import type { ItemType } from 'antd/es/menu/interface'
import type { CardShortcut, ProjectRecord } from '../../../shared/types'
import { useStore } from '../store'

/** 卡片启动默认脚本：常用 > 启动类 > 首个脚本 */
function pickDefaultScript(project: ProjectRecord): string | null {
  const scripts = project.scripts ?? []
  const favorites = project.typeConfig.favoriteScripts ?? []
  for (const f of favorites) {
    if (scripts.includes(f)) return f
  }
  const start = (project.startScripts ?? []).find((s) => scripts.includes(s))
  return start ?? scripts[0] ?? null
}

/** 卡片打包默认脚本：精确 build 优先 */
function pickDefaultBuild(buildScripts: string[]): string | null {
  return buildScripts.includes('build') ? 'build' : (buildScripts[0] ?? null)
}

export default function ProjectCard({ project }: { project: ProjectRecord }) {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  // useShallow：选择器返回新数组，必须浅比较，否则 store 更新时无限重渲染
  const running = useStore(useShallow((s) => s.running.filter((r) => r.projectId === project.id)))
  const lastFinished = useStore((s) => s.lastFinished[project.id])
  const startTask = useStore((s) => s.startTask)
  const startCommand = useStore((s) => s.startCommand)
  const stopTask = useStore((s) => s.stopTask)
  const updateProject = useStore((s) => s.updateProject)
  const removeProject = useStore((s) => s.removeProject)
  const trashProject = useStore((s) => s.trashProject)
  const switchBranch = useStore((s) => s.switchBranch)
  const openLog = useStore((s) => s.openLog)
  const openPackage = useStore((s) => s.openPackage)
  const openProjectSettings = useStore((s) => s.openProjectSettings)
  const refresh = useStore((s) => s.refresh)
  const groups = useStore((s) => s.groups)
  const selected = useStore((s) => s.selectedIds.includes(project.id))
  const toggleSelect = useStore((s) => s.toggleSelect)

  const scripts = useMemo(() => project.scripts ?? [], [project])
  const favorites = useMemo(() => project.typeConfig.favoriteScripts ?? [], [project])
  const startScripts = useMemo(() => project.startScripts ?? [], [project])
  const buildScripts = useMemo(() => project.buildScripts ?? [], [project])
  const defaultScript = useMemo(() => pickDefaultScript(project), [project])
  const defaultBuild = useMemo(() => pickDefaultBuild(buildScripts), [buildScripts])
  // 快捷方式配置（读 project prop，无需 useShallow）
  const hiddenBuiltins = useMemo(() => project.typeConfig.cardBuiltins ?? {}, [project])
  const customShortcuts = useMemo(() => project.typeConfig.cardShortcuts ?? [], [project])

  const runShortcut = (s: CardShortcut): void => {
    void startCommand(project.id, s.label, s.command)
  }

  const runningScripts = running.map((r) => r.script)
  const failed = lastFinished?.status === 'failed'
  const runningTask = running.length > 0

  // ── 启动菜单：常用 / 启动类 / 其他 ──
  const startMenuItems: ItemType[] = useMemo(() => {
    const items: ItemType[] = []
    const favs = favorites.filter((s) => scripts.includes(s))
    const used = new Set<string>()
    if (favs.length > 0) {
      items.push({ key: 'g-fav', type: 'group', label: t('card.favGroup') })
      for (const s of favs) {
        used.add(s)
        items.push({ key: s, label: s, disabled: runningScripts.includes(s) })
      }
    }
    const starts = startScripts.filter((s) => scripts.includes(s) && !used.has(s))
    if (starts.length > 0) {
      items.push({ key: 'g-start', type: 'group', label: t('card.startGroup') })
      for (const s of starts) {
        used.add(s)
        items.push({ key: s, label: s, disabled: runningScripts.includes(s) })
      }
    }
    const others = scripts.filter((s) => !used.has(s))
    if (others.length > 0) {
      items.push({ key: 'g-other', type: 'group', label: t('card.otherGroup') })
      for (const s of others) items.push({ key: s, label: s, disabled: runningScripts.includes(s) })
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites, scripts, startScripts, runningScripts.join(','), t])

  // ── 打包菜单（与启动一致：主按钮默认脚本 + 下拉全量） ──
  const buildMenuItems: ItemType[] = useMemo(
    () => buildScripts.map((s) => ({ key: s, label: s, disabled: runningScripts.includes(s) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildScripts, runningScripts.join(',')]
  )

  // ── 分支切换（git.root 为解析后的仓库根，可能是父级仓库） ──
  const git = project.git
  const branchMenuItems: ItemType[] = (git?.branches ?? []).map((b) => ({
    key: b,
    label: b === git?.currentBranch ? `${b} ✓` : b
  }))

  const onSwitchBranch = (branch: string): void => {
    if (branch === git?.currentBranch || !git?.root) return
    const doSwitch = (): void => {
      void switchBranch(git.root ?? '', branch)
    }
    if (git?.dirty) {
      modal.confirm({
        title: t('card.dirtyTitle'),
        content: t('card.dirtyContent', { branch }),
        okText: t('card.dirtyOk'),
        okButtonProps: { danger: true },
        cancelText: t('common.cancel'),
        onOk: doSwitch
      })
    } else {
      doSwitch()
    }
  }

  // ── 包管理器切换 ──
  const pm = project.typeConfig.packageManager // undefined = 自动
  const pmDisplay = pm ?? project.detectedPackageManager ?? 'npm'
  const pmMenuItems: ItemType[] = [
    { key: 'auto', label: t('card.pmAuto', { pm: project.detectedPackageManager ?? 'npm' }) },
    { type: 'divider' },
    { key: 'npm', label: 'npm' },
    { key: 'pnpm', label: 'pnpm' },
    { key: 'yarn', label: 'yarn' },
    { key: 'bun', label: 'bun' }
  ]
  const onChangePm = async (key: string): Promise<void> => {
    const next = key === 'auto' ? undefined : (key as 'npm' | 'pnpm' | 'yarn' | 'bun')
    await updateProject(project.id, {
      typeConfig: { ...project.typeConfig, packageManager: next }
    })
    message.success(key === 'auto' ? t('card.pmSetAuto') : t('card.pmSet', { pm: key }))
  }

  // ── 更多操作 ──
  const currentGroup = project.groupName || ''
  const moveGroupItems: ItemType[] = [
    { key: 'move:', label: `${t('group.ungrouped')}${currentGroup === '' ? ' ✓' : ''}` },
    ...groups
      .filter((g) => g.name !== '')
      .map((g) => ({
        key: `move:${g.name}`,
        label: `${g.name}${currentGroup === g.name ? ' ✓' : ''}`
      }))
  ]
  const moreMenuItems: ItemType[] = [
    { key: 'settings', icon: <CodeOutlined />, label: t('card.projectSettings') },
    {
      key: 'move-group',
      icon: <FolderOutlined />,
      label: t('group.moveSubmenu'),
      children: moveGroupItems
    },
    { key: 'folder', icon: <FolderOpenOutlined />, label: t('card.openFolder') },
    { key: 'editor', icon: <EditOutlined />, label: t('card.openEditor') },
    { key: 'terminal', icon: <CodeOutlined />, label: t('card.openTerminal') },
    { type: 'divider' },
    { key: 'remove', icon: <DeleteOutlined />, label: t('card.remove') },
    { key: 'trash', icon: <DeleteOutlined />, label: t('card.trash'), danger: true }
  ]
  const onMoreMenu = ({ key }: { key: string }): void => {
    if (key.startsWith('move:')) {
      const name = key.slice(5)
      if (name === currentGroup) return
      void (async () => {
        const ok = await updateProject(project.id, { groupName: name })
        if (ok) {
          message.success(t('batch.assigned', { n: 1, name: name || t('group.ungrouped') }))
        }
      })()
      return
    }
    if (key === 'settings') openProjectSettings(project.id)
    if (key === 'folder') void window.api.openPath(project.path)
    if (key === 'editor') {
      void window.api
        .openEditor(project.path)
        .catch((err: unknown) => message.error(err instanceof Error ? err.message : String(err)))
    }
    if (key === 'terminal') {
      void window.api
        .openTerminal(project.path)
        .catch((err: unknown) => message.error(err instanceof Error ? err.message : String(err)))
    }
    if (key === 'remove') {
      modal.confirm({
        title: t('card.removeTitle'),
        content: t('card.removeContent'),
        okText: t('card.remove'),
        cancelText: t('common.cancel'),
        onOk: () => void removeProject(project.id)
      })
    }
    if (key === 'trash') {
      modal.confirm({
        title: t('card.trashTitle'),
        content: t('card.trashContent', { path: project.path }),
        okText: t('card.trashOk'),
        okButtonProps: { danger: true },
        cancelText: t('common.cancel'),
        onOk: () => void trashProject(project.id)
      })
    }
  }

  // ── 停止 ──
  const stopAll = (): void => {
    void stopTask(project.id)
  }
  const stopButton =
    running.length > 1 ? (
      <Dropdown
        menu={{
          items: [
            ...running.map((r) => ({
              key: `stop-${r.id}`,
              label: t('card.stopScript', { script: r.script })
            })),
            { type: 'divider' },
            { key: 'stop-all', label: t('card.stopAll') }
          ],
          onClick: ({ key }) => {
            if (key === 'stop-all') stopAll()
            else void stopTask(project.id, Number(key.replace('stop-', '')))
          }
        }}
      >
        <Button danger icon={<StopOutlined />}>
          {t('card.stopN', { n: running.length })} <DownOutlined />
        </Button>
      </Dropdown>
    ) : (
      <Button danger icon={<StopOutlined />} disabled={!runningTask} onClick={stopAll}>
        {t('card.stop')}
      </Button>
    )

  const hasBuild = buildScripts.length > 0 && defaultBuild !== null

  return (
    <Card
      className={`project-card${selected ? ' card-selected' : ''}`}
      title={
        <div className="card-title">
          <Checkbox
            checked={selected}
            onChange={() => toggleSelect(project.id)}
            onClick={(e) => e.stopPropagation()}
            className="card-check"
          />
          <span className={`status-dot ${runningTask ? 'running' : failed ? 'failed' : ''}`} />
          <span className="card-name" title={project.name}>
            {project.name}
          </span>
        </div>
      }
      extra={
        <Dropdown menu={{ items: moreMenuItems, onClick: onMoreMenu }} trigger={['click']}>
          <Button type="text" size="small" icon={<MoreOutlined />} />
        </Dropdown>
      }
    >
      <div
        className="card-path"
        title={project.path}
        onClick={() => void window.api.openPath(project.path)}
      >
        {project.path}
      </div>

      <div className="card-tags">
        <Tag color="geekblue">Node.js</Tag>
        {project.typeConfig.useNvm && project.typeConfig.nodeVersion && (
          <Tag color="orange" title={t('import.nvmLabel')}>
            nvm {project.typeConfig.nodeVersion}
          </Tag>
        )}
        <Dropdown
          menu={{ items: pmMenuItems, onClick: ({ key }) => void onChangePm(key) }}
          trigger={['click']}
        >
          <Tag
            className="clickable-tag"
            color={pm ? 'gold' : 'default'}
            title={pm ? t('card.pmManualTitle') : t('card.pmAutoTitle')}
          >
            {pmDisplay}
          </Tag>
        </Dropdown>
        {git?.isRepo ? (
          <>
            <Dropdown
              menu={{ items: branchMenuItems, onClick: ({ key }) => onSwitchBranch(key) }}
              trigger={['click']}
            >
              <Tag
                className="clickable-tag"
                color="purple"
                title={t('card.branchTip')}
                icon={git.dirty ? <span className="dirty-dot" /> : undefined}
              >
                {git.currentBranch ?? t('card.head')}
              </Tag>
            </Dropdown>
            <Tooltip title={t('card.refreshBranches')}>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => void refresh()}
              />
            </Tooltip>
          </>
        ) : (
          <Tag>{t('card.notGitRepo')}</Tag>
        )}
        {runningTask && (
          <Tag color="processing" title={runningScripts.join(', ')}>
            {t('card.runningScripts', { scripts: runningScripts.join(', ') })}
          </Tag>
        )}
      </div>

      <div className="card-actions">
        {hiddenBuiltins.start !== false &&
          (scripts.length > 0 ? (
            <Space.Compact>
              <Button
                type="primary"
                icon={<CaretRightOutlined />}
                disabled={!defaultScript || runningScripts.includes(defaultScript ?? '')}
                onClick={() => void startTask(project.id, defaultScript ?? '')}
              >
                {defaultScript ?? t('card.start')}
              </Button>
              <Dropdown
                menu={{
                  items: startMenuItems,
                  onClick: ({ key }) => void startTask(project.id, key)
                }}
              >
                <Button
                  type="primary"
                  icon={<CaretRightFilled rotate={90} />}
                  title={t('card.pickScript')}
                />
              </Dropdown>
            </Space.Compact>
          ) : (
            <Tooltip title={t('card.noScripts')}>
              <Button type="primary" disabled icon={<CaretRightOutlined />}>
                {t('card.start')}
              </Button>
            </Tooltip>
          ))}

        {hiddenBuiltins.stop !== false && stopButton}

        {hiddenBuiltins.build !== false &&
          (hasBuild ? (
            <Space.Compact>
              <Button
                icon={<AppstoreOutlined />}
                disabled={defaultBuild !== null && runningScripts.includes(defaultBuild)}
                onClick={() => void startTask(project.id, defaultBuild ?? '')}
              >
                {defaultBuild}
              </Button>
              <Dropdown
                menu={{
                  items: buildMenuItems,
                  onClick: ({ key }) => void startTask(project.id, key)
                }}
              >
                <Button icon={<DownOutlined />} title={t('card.pickBuild')} />
              </Dropdown>
            </Space.Compact>
          ) : (
            <Tooltip title={t('card.noBuild')}>
              <Button icon={<AppstoreOutlined />} disabled>
                {t('card.build')}
              </Button>
            </Tooltip>
          ))}

        {hiddenBuiltins.browser !== false && (
          <Tooltip title={t('card.openBrowser')}>
            <Button
              icon={<GlobalOutlined />}
              onClick={() =>
                void window.api
                  .openBrowser(project.id)
                  .then((url) => message.success(url))
                  .catch((err: unknown) =>
                    message.error(err instanceof Error ? err.message : String(err))
                  )
              }
            />
          </Tooltip>
        )}

        {hiddenBuiltins.logs !== false && (
          <Tooltip title={t('card.logs')}>
            <Button icon={<FileTextOutlined />} onClick={() => openLog(project.id)} />
          </Tooltip>
        )}

        {hiddenBuiltins.editPackage !== false && (
          <Tooltip title={t('card.editPackage')}>
            <Button icon={<EditOutlined />} onClick={() => openPackage(project.id)} />
          </Tooltip>
        )}

        {customShortcuts.map((s) => (
          <Tooltip key={s.id} title={t('card.customTooltip')}>
            <Button
              icon={<CodeOutlined />}
              disabled={runningScripts.includes(s.label)}
              onClick={() => runShortcut(s)}
            >
              {s.label}
            </Button>
          </Tooltip>
        ))}
      </div>
    </Card>
  )
}
