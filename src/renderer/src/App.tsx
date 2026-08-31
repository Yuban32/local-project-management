import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  App as AntApp,
  Button,
  Dropdown,
  Empty,
  Input,
  Layout,
  Menu,
  Select,
  Space,
  Spin,
  Tooltip
} from 'antd'
import {
  AppstoreOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  FolderAddOutlined,
  FolderOutlined,
  PlusOutlined,
  ScanOutlined,
  SettingOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ItemType } from 'antd/es/menu/interface'
import type { Language, ProjectRecord, TerminalKind } from '../../shared/types'
import { useStore } from './store'
import { bindToast } from './toast'
import ProjectCard from './components/ProjectCard'
import LogDrawer from './components/LogDrawer'
import SettingsModal from './components/SettingsModal'
import ImportModal from './components/ImportModal'
import PackageJsonModal from './components/PackageJsonModal'
import ProjectSettingsModal from './components/ProjectSettingsModal'
import GroupModals from './components/GroupModals'
import PreferencesModal from './components/PreferencesModal'

interface Group {
  name: string
  projects: ProjectRecord[]
}

const ALL_KEY = '__all__'
const UNGROUPED_KEY = '__ungrouped__'

/** 按分组分区：有名分组按名称排序，未分组固定最后 */
function groupProjects(list: ProjectRecord[]): Group[] {
  const map = new Map<string, ProjectRecord[]>()
  for (const p of list) {
    const key = p.groupName || ''
    const arr = map.get(key)
    if (arr) arr.push(p)
    else map.set(key, [p])
  }
  const named = [...map.entries()]
    .filter(([k]) => k !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, ps]) => ({ name, projects: ps }))
  const ungrouped = map.get('')
  return ungrouped ? [...named, { name: '', projects: ungrouped }] : named
}

export default function App() {
  const { message, modal } = AntApp.useApp()
  const { t, i18n } = useTranslation()
  const ready = useStore((s) => s.ready)
  const projects = useStore((s) => s.projects)
  const types = useStore((s) => s.types)
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const init = useStore((s) => s.init)
  const openImport = useStore((s) => s.openImport)
  const openSettings = useStore((s) => s.openSettings)
  const selectedIds = useStore((s) => s.selectedIds)
  const clearSelection = useStore((s) => s.clearSelection)
  const batchRemove = useStore((s) => s.batchRemove)
  const batchTrash = useStore((s) => s.batchTrash)
  const settings = useStore((s) => s.settings)
  const terminalAvail = useStore((s) => s.terminalAvail)
  const setTerminal = useStore((s) => s.setTerminal)
  const activeGroup = useStore((s) => s.activeGroup)
  const setActiveGroup = useStore((s) => s.setActiveGroup)
  /** 全部分组（含 0 项目分组，主进程已按名称排序） */
  const groupList = useStore((s) => s.groups)
  const openGroupEditor = useStore((s) => s.openGroupEditor)
  const openPrefs = useStore((s) => s.openPrefs)
  const openAssign = useStore((s) => s.openAssign)
  const setAppLanguage = useStore((s) => s.setAppLanguage)
  const fetchingRemote = useStore((s) => s.fetchingRemote)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('launcher.siderCollapsed') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    bindToast(message)
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 订阅任务状态推送（日志订阅在 LogDrawer 内部按需进行）
  useEffect(() => {
    const off = window.api.onTaskStatus((run) => useStore.getState().applyStatus(run))
    return off
  }, [])

  const keyword = search.trim().toLowerCase()
  /** 搜索过滤：匹配卡片上可见的各类信息（名称/路径/分组/脚本/包管理器/分支等） */
  const filtered = useMemo(() => {
    if (!keyword) return projects
    const typeLabel = (id: string): string => types.find((x) => x.id === id)?.label ?? ''
    const searchText = (p: ProjectRecord): string =>
      [
        p.name,
        p.path,
        p.groupName,
        p.type,
        typeLabel(p.type),
        p.typeConfig.packageManager,
        p.detectedPackageManager,
        p.typeConfig.nodeVersion,
        ...(p.scripts ?? []),
        ...(p.startScripts ?? []),
        ...(p.buildScripts ?? []),
        ...(p.typeConfig.favoriteScripts ?? []),
        ...(p.typeConfig.cardShortcuts ?? []).flatMap((s) => [s.label, s.command]),
        p.git?.currentBranch,
        ...(p.git?.branches ?? []),
        ...(p.git?.remoteBranches ?? []),
        p.git?.root
      ]
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
        .join(' ')
        .toLowerCase()
    return projects.filter((p) => searchText(p).includes(keyword))
  }, [projects, keyword, types])
  const groups = useMemo(() => groupProjects(filtered), [filtered])
  const selectedProjects = projects.filter((p) => selectedIds.includes(p.id))

  // ── 侧边栏菜单：全部项目 + 各分组（hover 显示编辑/删除）+ 未分组 ──
  const activeMenuKey =
    activeGroup === null ? ALL_KEY : activeGroup === '' ? UNGROUPED_KEY : activeGroup
  const menuItems: ItemType[] = useMemo(() => {
    const ungroupedCount = projects.filter((p) => !p.groupName).length
    const groupLabel = (name: string, count: number, manageable: boolean): ReactNode => (
      <span className="nav-label">
        <span className="nav-text">{name}</span>
        <span className="nav-count">{count}</span>
        {manageable && !collapsed && (
          <span className="nav-actions" onClick={(e) => e.stopPropagation()}>
            <Tooltip title={t('group.edit')}>
              <Button
                className="nav-action"
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openGroupEditor({ mode: 'rename', name })}
              />
            </Tooltip>
            <Tooltip title={t('group.remove')}>
              <Button
                className="nav-action"
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => openGroupEditor({ mode: 'delete', name })}
              />
            </Tooltip>
          </span>
        )}
      </span>
    )
    const items: ItemType[] = [
      {
        key: ALL_KEY,
        icon: <AppstoreOutlined />,
        label: groupLabel(t('nav.all'), projects.length, false)
      }
    ]
    for (const g of groupList) {
      items.push({
        key: g.name,
        icon: <FolderOutlined />,
        label: groupLabel(g.name, g.count, true)
      })
    }
    items.push({
      key: UNGROUPED_KEY,
      icon: <FolderOutlined />,
      label: groupLabel(t('group.ungrouped'), ungroupedCount, false)
    })
    return items
  }, [projects, groupList, collapsed, t, openGroupEditor])

  const onMenuClick = ({ key }: { key: string }): void => {
    if (key === ALL_KEY) setActiveGroup(null)
    else if (key === UNGROUPED_KEY) setActiveGroup('')
    else setActiveGroup(key)
  }

  const confirmBatchRemove = (): void => {
    modal.confirm({
      title: t('batch.removeTitle', { n: selectedIds.length }),
      content: t('batch.removeContent'),
      okText: t('batch.remove'),
      cancelText: t('common.cancel'),
      onOk: () => void batchRemove()
    })
  }

  const confirmBatchTrash = (): void => {
    modal.confirm({
      title: t('batch.trashTitle', { n: selectedIds.length }),
      content: (
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {selectedProjects.map((p) => (
            <li key={p.id}>{p.path}</li>
          ))}
        </ul>
      ),
      okText: t('batch.trashOk'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => void batchTrash()
    })
  }

  const renderGrid = (list: ProjectRecord[]): ReactNode => (
    <div className="cards-grid">
      {list.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  )

  // ── 主区域：全部 = 分组分区；选中分组 = 平铺网格 ──
  let content: ReactNode
  if (!ready) {
    content = null
  } else if (activeGroup === null) {
    content =
      filtered.length === 0 ? (
        <EmptyState projectsExist={projects.length > 0} />
      ) : (
        groups.map((g) => (
          <section key={g.name || '__ungrouped'} className="group-section">
            <div className="group-header">
              <span className="group-name">{g.name || t('group.ungrouped')}</span>
              <span className="group-count">{g.projects.length}</span>
            </div>
            {renderGrid(g.projects)}
          </section>
        ))
      )
  } else {
    const list = filtered.filter((p) => (p.groupName || '') === activeGroup)
    content =
      list.length === 0 ? <EmptyState projectsExist={projects.length > 0} /> : renderGrid(list)
  }

  // ── 顶栏终端选择器：当前偏好 + 各终端可用性 ──
  const currentTerminal = settings.terminal ?? 'auto'
  const terminalItems: ItemType[] = (
    [
      ['auto', true],
      ['wt', terminalAvail.wt],
      ['gitbash', terminalAvail.gitbash !== null],
      ['cmd', true],
      ['powershell', true]
    ] as Array<[TerminalKind, boolean]>
  ).map(([kind, ok]) => ({
    key: kind,
    label: `${t(`terminal.${kind}`)}${ok ? '' : t('terminal.notFoundSuffix')}`,
    disabled: !ok,
    icon: kind === currentTerminal ? <span>✓</span> : undefined
  }))

  return (
    <Layout className="app">
      <Layout.Sider
        theme="dark"
        collapsible
        collapsed={collapsed}
        onCollapse={(v) => {
          setCollapsed(v)
          try {
            localStorage.setItem('launcher.siderCollapsed', v ? '1' : '0')
          } catch {
            // 忽略持久化失败
          }
        }}
        width={200}
        collapsedWidth={64}
        className="app-sider"
      >
        <div className="sider-logo">
          <span className="app-logo">⌘</span>
          {!collapsed && <span className="app-title">{t('app.title')}</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          className="sider-menu"
          selectedKeys={[activeMenuKey]}
          items={menuItems}
          onClick={onMenuClick}
        />
        <div className="sider-footer">
          <Tooltip title={t('group.add')} placement="right">
            <Button
              type="text"
              className="sider-add-btn"
              icon={<PlusOutlined />}
              onClick={() => openGroupEditor({ mode: 'create' })}
            >
              {!collapsed && <span className="sider-add-text">{t('group.add')}</span>}
            </Button>
          </Tooltip>
        </div>
      </Layout.Sider>
      <Layout className="app-body">
        <header className="app-header">
          <div className="app-header-spacer" />
          <Space wrap>
            <Input
              allowClear
              placeholder={t('app.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 200 }}
            />
            <Select
              size="middle"
              value={i18n.language}
              onChange={(v) => void setAppLanguage(v as Language)}
              options={[
                { value: 'zh-CN', label: '中文' },
                { value: 'en-US', label: 'English' }
              ]}
              style={{ width: 104 }}
              title={t('app.language')}
            />
            <Dropdown
              menu={{
                items: terminalItems,
                onClick: ({ key }) => void setTerminal(key as TerminalKind),
                selectedKeys: [currentTerminal]
              }}
              trigger={['click']}
            >
              <Tooltip title={t('terminal.label')}>
                <Button icon={<CodeOutlined />}>
                  {t(`terminal.${currentTerminal}`)} <DownOutlined />
                </Button>
              </Tooltip>
            </Dropdown>
            <Button type="primary" icon={<FolderAddOutlined />} onClick={() => void openImport()}>
              {t('app.addProject')}
            </Button>
            <Button icon={<ScanOutlined />} onClick={() => void openSettings()}>
              {t('app.scanSettings')}
            </Button>
            <Button icon={<SettingOutlined />} onClick={openPrefs}>
              {t('app.settings')}
            </Button>
          </Space>
        </header>

        {selectedIds.length > 0 && (
          <div className="batch-bar">
            <span className="batch-info">{t('batch.selected', { n: selectedIds.length })}</span>
            <Space>
              <Button size="small" type="primary" ghost onClick={openAssign}>
                {t('batch.setGroup')}
              </Button>
              <Button size="small" danger onClick={confirmBatchTrash}>
                {t('batch.trash')}
              </Button>
              <Button size="small" onClick={confirmBatchRemove}>
                {t('batch.remove')}
              </Button>
              <Button size="small" type="text" onClick={clearSelection}>
                {t('batch.clear')}
              </Button>
            </Space>
          </div>
        )}

        <main className="app-main">{content}</main>
      </Layout>

      <LogDrawer />
      <SettingsModal />
      <ImportModal />
      <PackageJsonModal />
      <ProjectSettingsModal />
      <GroupModals />
      <PreferencesModal />

      {fetchingRemote && (
        <div className="global-busy-mask">
          <Spin size="large" />
          <span className="global-busy-text">{t('toast.gitFetching')}</span>
        </div>
      )}
    </Layout>
  )
}

function EmptyState({ projectsExist }: { projectsExist: boolean }): ReactNode {
  const { t } = useTranslation()
  const openImport = useStore((s) => s.openImport)
  const openSettings = useStore((s) => s.openSettings)
  return (
    <Empty
      style={{ marginTop: 120 }}
      description={projectsExist ? t('app.noMatch') : t('app.emptyHint')}
    >
      {!projectsExist && (
        <Space>
          <Button type="primary" icon={<FolderAddOutlined />} onClick={() => void openImport()}>
            {t('app.addProject')}
          </Button>
          <Button icon={<ScanOutlined />} onClick={() => void openSettings()}>
            {t('app.scanSettings')}
          </Button>
        </Space>
      )}
    </Empty>
  )
}
