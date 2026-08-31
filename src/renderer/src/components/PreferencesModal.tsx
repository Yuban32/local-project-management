import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography
} from 'antd'
import {
  ExportOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type {
  AgentTemplate,
  AppInfo,
  BackupItem,
  EditorCheckResult,
  EditorScanInfo,
  GitCheckResult,
  GitScanInfo,
  Language,
  SkillDef,
  TerminalKind
} from '../../../shared/types'
import { useStore } from '../store'

/** 设置中心：通用（语言 / 默认终端）、高级（备份 / 数据管理）、关于 */
export default function PreferencesModal() {
  const open = useStore((s) => s.prefsOpen)
  const close = useStore((s) => s.closePrefs)
  const { t } = useTranslation()

  const items = [
    { key: 'general', label: t('prefs.tabGeneral'), children: <GeneralTab visible={open} /> },
    { key: 'advanced', label: t('prefs.tabAdvanced'), children: <AdvancedTab visible={open} /> },
    { key: 'ai', label: t('prefs.tabAi'), children: <AiTab visible={open} /> },
    { key: 'about', label: t('prefs.tabAbout'), children: <AboutTab visible={open} /> }
  ]

  return (
    <Modal open={open} onCancel={close} footer={null} title={t('prefs.title')} width={680}>
      <Tabs items={items} />
    </Modal>
  )
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 通用：界面语言 + 全局默认终端 + Git 可执行文件 */
function GeneralTab({ visible }: { visible: boolean }) {
  const { t, i18n } = useTranslation()
  const settings = useStore((s) => s.settings)
  const terminalAvail = useStore((s) => s.terminalAvail)
  const setTerminal = useStore((s) => s.setTerminal)
  const setAppLanguage = useStore((s) => s.setAppLanguage)

  const currentTerminal = settings.terminal ?? 'auto'
  const terminalOptions: Array<{ value: TerminalKind; label: string; disabled?: boolean }> = (
    [
      ['auto', true],
      ['wt', terminalAvail.wt],
      ['gitbash', terminalAvail.gitbash !== null],
      ['cmd', true],
      ['powershell', true]
    ] as Array<[TerminalKind, boolean]>
  ).map(([kind, ok]) => ({
    value: kind,
    label: `${t(`terminal.${kind}`)}${ok ? '' : t('terminal.notFoundSuffix')}`,
    disabled: !ok
  }))

  return (
    <div className="prefs-section">
      <div className="prefs-row">
        <div className="prefs-row-main">
          <div className="prefs-row-title">{t('prefs.language')}</div>
          <div className="prefs-row-desc">{t('prefs.languageHint')}</div>
        </div>
        <Select
          value={i18n.language}
          onChange={(v) => void setAppLanguage(v as Language)}
          options={[
            { value: 'zh-CN', label: '中文' },
            { value: 'en-US', label: 'English' }
          ]}
          style={{ width: 140 }}
        />
      </div>
      <div className="prefs-row">
        <div className="prefs-row-main">
          <div className="prefs-row-title">{t('prefs.terminal')}</div>
          <div className="prefs-row-desc">{t('prefs.terminalHint')}</div>
        </div>
        <Select
          value={currentTerminal}
          onChange={(v) => void setTerminal(v)}
          options={terminalOptions}
          style={{ width: 240 }}
        />
      </div>
      <GitSection visible={visible} />
      <EditorSection visible={visible} />
    </div>
  )
}

/** Git 可执行文件：自动检测（PATH + 常规安装路径）/ 手动指定 */
function GitSection({ visible }: { visible: boolean }) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const appSettings = useStore((s) => s.appSettings)
  const setGitPath = useStore((s) => s.setGitPath)

  const [scan, setScan] = useState<GitScanInfo | null>(null)
  const [manualDraft, setManualDraft] = useState('')
  const [check, setCheck] = useState<GitCheckResult | null>(null)

  const mode = appSettings.gitPath ? 'manual' : 'auto'

  const reloadScan = async (): Promise<void> => {
    try {
      const info = await window.api.gitScan()
      setScan(info)
      if (info.exe && !info.manual) setCheck({ ok: true, version: info.version, error: null })
    } catch {
      setScan(null)
    }
  }

  useEffect(() => {
    if (!visible) return
    setManualDraft(useStore.getState().appSettings.gitPath ?? '')
    void reloadScan()
  }, [visible])

  /** 应用手动路径：先 --version 实测，通过才落库；空值 = 恢复自动 */
  const applyManual = async (raw: string): Promise<void> => {
    const value = raw.trim()
    if (!value) {
      setCheck(null)
      await setGitPath(undefined)
      await reloadScan()
      return
    }
    const result = await window.api.gitCheck(value)
    setCheck(result)
    if (result.ok) {
      await setGitPath(value)
      message.success(result.version ?? '')
    } else {
      message.error(result.error ?? t('main.gitExeInvalid'))
    }
  }

  const pickFile = async (): Promise<void> => {
    const file = await window.api.chooseFile()
    if (!file) return
    setManualDraft(file)
    await applyManual(file)
  }

  const statusText = (): string => {
    if (mode === 'auto') {
      if (scan?.exe) {
        return `${t('prefs.gitCurrent', { path: scan.exe })}${scan.version ? `（${scan.version}）` : ''}`
      }
      return t('prefs.gitNotDetected')
    }
    if (check?.ok) return `✓ ${check.version ?? ''}`
    if (check && !check.ok) return `✗ ${check.error ?? ''}`
    return t('prefs.gitNotDetected')
  }

  return (
    <div className="prefs-row prefs-git">
      <div className="prefs-row-main">
        <div className="prefs-row-title">{t('prefs.gitTitle')}</div>
        <div className="prefs-row-desc">{t('prefs.gitDesc')}</div>
        <Radio.Group
          value={mode}
          onChange={(e) => {
            if (e.target.value === 'auto') void applyManual('')
          }}
          style={{ marginTop: 10, display: 'flex', gap: 16 }}
        >
          <Radio value="auto">{t('prefs.gitAuto')}</Radio>
          <Radio value="manual">{t('prefs.gitManual')}</Radio>
        </Radio.Group>
        {mode === 'manual' && (
          <Space.Compact style={{ width: '100%', marginTop: 10 }}>
            <Input
              value={manualDraft}
              onChange={(e) => setManualDraft(e.target.value)}
              onBlur={() => void applyManual(manualDraft)}
              placeholder={
                process.platform === 'win32'
                  ? 'C:\\Program Files\\Git\\cmd\\git.exe'
                  : '/usr/bin/git'
              }
              allowClear
            />
            <Button onClick={() => void pickFile()}>{t('prefs.gitPick')}</Button>
          </Space.Compact>
        )}
        <div
          className={`prefs-row-desc git-status${check?.ok === false ? ' git-status-error' : ''}`}
        >
          {statusText()}
        </div>
        {scan && scan.candidates.length > 0 && (
          <div className="git-candidates">
            <span className="prefs-row-desc">{t('prefs.gitCandidates')}</span>
            {scan.candidates.map((c) => (
              <Button
                key={c}
                type="link"
                size="small"
                className="git-candidate"
                title={c}
                onClick={() => {
                  setManualDraft(c)
                  void applyManual(c)
                }}
              >
                {c}
              </Button>
            ))}
          </div>
        )}
      </div>
      <Button onClick={() => void reloadScan()}>{t('prefs.gitRescan')}</Button>
    </div>
  )
}

/** 代码编辑器：自动检测（VSCode 系 / Cursor 常规安装路径）/ 手动指定 */
function EditorSection({ visible }: { visible: boolean }) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const appSettings = useStore((s) => s.appSettings)
  const setEditorPath = useStore((s) => s.setEditorPath)

  const [scan, setScan] = useState<EditorScanInfo | null>(null)
  const [manualDraft, setManualDraft] = useState('')
  const [check, setCheck] = useState<EditorCheckResult | null>(null)

  const mode = appSettings.editorPath ? 'manual' : 'auto'

  const reloadScan = async (): Promise<void> => {
    try {
      const info = await window.api.editorScan()
      setScan(info)
      if (info.exe && !info.manual) setCheck({ ok: true, version: info.version, error: null })
    } catch {
      setScan(null)
    }
  }

  useEffect(() => {
    if (!visible) return
    setManualDraft(useStore.getState().appSettings.editorPath ?? '')
    void reloadScan()
  }, [visible])

  /** 应用手动路径：先校验（存在性 + VSCode 系版本探测），通过才落库；空值 = 恢复自动 */
  const applyManual = async (raw: string): Promise<void> => {
    const value = raw.trim()
    if (!value) {
      setCheck(null)
      await setEditorPath(undefined)
      await reloadScan()
      return
    }
    const result = await window.api.editorCheck(value)
    setCheck(result)
    if (result.ok) {
      await setEditorPath(value)
      // 任意手动 exe 不做 --version 探测（防 GUI 弹窗），无版本号就不弹
      if (result.version) message.success(result.version)
    } else {
      message.error(result.error ?? t('main.editorFileNotFound'))
    }
  }

  const pickFile = async (): Promise<void> => {
    const file = await window.api.chooseFile()
    if (!file) return
    setManualDraft(file)
    await applyManual(file)
  }

  const statusText = (): string => {
    if (mode === 'auto') {
      if (scan?.exe) {
        return `${t('prefs.editorCurrent', { path: scan.exe })}${scan.version ? `（${scan.version}）` : ''}`
      }
      return t('prefs.editorNotDetected')
    }
    if (check?.ok) return `✓ ${check.version ?? ''}`
    if (check && !check.ok) return `✗ ${check.error ?? ''}`
    return t('prefs.editorNotDetected')
  }

  return (
    <div className="prefs-row prefs-git">
      <div className="prefs-row-main">
        <div className="prefs-row-title">{t('prefs.editorTitle')}</div>
        <div className="prefs-row-desc">{t('prefs.editorDesc')}</div>
        <Radio.Group
          value={mode}
          onChange={(e) => {
            if (e.target.value === 'auto') void applyManual('')
          }}
          style={{ marginTop: 10, display: 'flex', gap: 16 }}
        >
          <Radio value="auto">{t('prefs.editorAuto')}</Radio>
          <Radio value="manual">{t('prefs.editorManual')}</Radio>
        </Radio.Group>
        {mode === 'manual' && (
          <Space.Compact style={{ width: '100%', marginTop: 10 }}>
            <Input
              value={manualDraft}
              onChange={(e) => setManualDraft(e.target.value)}
              onBlur={() => void applyManual(manualDraft)}
              placeholder={
                process.platform === 'win32'
                  ? 'C:\\...\\Microsoft VS Code\\Code.exe'
                  : '/usr/bin/code'
              }
              allowClear
            />
            <Button onClick={() => void pickFile()}>{t('prefs.editorPick')}</Button>
          </Space.Compact>
        )}
        <div
          className={`prefs-row-desc git-status${check?.ok === false ? ' git-status-error' : ''}`}
        >
          {statusText()}
        </div>
        {scan && scan.candidates.length > 0 && (
          <div className="git-candidates">
            <span className="prefs-row-desc">{t('prefs.editorCandidates')}</span>
            {scan.candidates.map((c) => (
              <Button
                key={c.path}
                type="link"
                size="small"
                className="git-candidate"
                title={c.path}
                onClick={() => {
                  setManualDraft(c.path)
                  void applyManual(c.path)
                }}
              >
                {c.name}
              </Button>
            ))}
          </div>
        )}
      </div>
      <Button onClick={() => void reloadScan()}>{t('prefs.editorRescan')}</Button>
    </div>
  )
}

/** 高级：备份管理 + 数据管理 */
function AdvancedTab({ visible }: { visible: boolean }) {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const appSettings = useStore((s) => s.appSettings)
  const updateAutoBackup = useStore((s) => s.updateAutoBackup)

  const [backups, setBackups] = useState<BackupItem[]>([])
  const [backuping, setBackuping] = useState(false)

  useEffect(() => {
    if (!visible) return
    void window.api
      .listBackups()
      .then(setBackups)
      .catch(() => setBackups([]))
  }, [visible])

  const reloadBackups = async (): Promise<void> => {
    try {
      setBackups(await window.api.listBackups())
    } catch {
      // 列表刷新失败保留旧数据
    }
  }

  const ab = appSettings.autoBackup

  const doBackupNow = async (): Promise<void> => {
    setBackuping(true)
    try {
      const item = await window.api.createBackup()
      message.success(t('prefs.created', { name: item.name }))
      await reloadBackups()
    } catch (err) {
      message.error(errText(err))
    } finally {
      setBackuping(false)
    }
  }

  const confirmRestore = (item: BackupItem): void => {
    modal.confirm({
      title: t('prefs.restoreTitle'),
      content: t('prefs.restoreContent', { name: item.name }),
      okText: t('prefs.restoreOk'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await window.api.restoreBackup(item.name)
          await useStore.getState().refresh()
          message.success(t('prefs.restored'))
          await reloadBackups()
        } catch (err) {
          message.error(errText(err))
        }
      }
    })
  }

  const confirmDeleteBackup = (item: BackupItem): void => {
    modal.confirm({
      title: t('prefs.deleteTitle', { name: item.name }),
      okText: t('prefs.deleteOk'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await window.api.deleteBackup(item.name)
          message.success(t('prefs.deleted'))
          await reloadBackups()
        } catch (err) {
          message.error(errText(err))
        }
      }
    })
  }

  const doExport = async (): Promise<void> => {
    try {
      const p = await window.api.exportData()
      if (p) message.success(t('prefs.exported', { path: p }))
    } catch (err) {
      message.error(errText(err))
    }
  }

  const confirmImport = (): void => {
    modal.confirm({
      title: t('prefs.importTitle'),
      content: t('prefs.importContent'),
      okText: t('prefs.importOk'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const imported = await window.api.importData()
          if (imported) {
            await useStore.getState().refresh()
            message.success(t('prefs.imported'))
          }
        } catch (err) {
          message.error(errText(err))
        }
      }
    })
  }

  const formatSize = (n: number): string =>
    n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`

  return (
    <>
      <div className="prefs-section">
        <div className="prefs-row-title">{t('prefs.backupTitle')}</div>
        <div className="prefs-row-desc">{t('prefs.backupDesc')}</div>
        <div className="prefs-row">
          <Space>
            <Switch checked={ab.enabled} onChange={(v) => void updateAutoBackup({ enabled: v })} />
            <span>{t('prefs.autoEnable')}</span>
          </Space>
          <Space>
            <span className="settings-label">{t('prefs.interval')}</span>
            <InputNumber
              min={1}
              max={30}
              value={ab.intervalDays}
              disabled={!ab.enabled}
              onChange={(v) => void updateAutoBackup({ intervalDays: v ?? 1 })}
            />
            <span className="settings-label">{t('prefs.intervalUnit')}</span>
            <span className="settings-label">{t('prefs.keep')}</span>
            <InputNumber
              min={1}
              max={50}
              value={ab.keep}
              disabled={!ab.enabled}
              onChange={(v) => void updateAutoBackup({ keep: v ?? 7 })}
            />
            <span className="settings-label">{t('prefs.keepUnit')}</span>
          </Space>
        </div>
        <div className="prefs-toolbar">
          <Button icon={<SaveOutlined />} loading={backuping} onClick={() => void doBackupNow()}>
            {t('prefs.backupNow')}
          </Button>
        </div>
        <div className="prefs-row-title" style={{ marginTop: 12 }}>
          {t('prefs.listTitle')}
        </div>
        <List
          size="small"
          bordered
          dataSource={backups}
          locale={{ emptyText: t('prefs.listEmpty') }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="restore" type="link" size="small" onClick={() => confirmRestore(item)}>
                  {t('prefs.restore')}
                </Button>,
                <Button
                  key="delete"
                  type="link"
                  size="small"
                  danger
                  onClick={() => confirmDeleteBackup(item)}
                >
                  {t('prefs.delete')}
                </Button>
              ]}
            >
              <List.Item.Meta
                title={<span className="backup-name">{item.name}</span>}
                description={`${formatSize(item.size)} · ${new Date(item.mtime).toLocaleString()}`}
              />
            </List.Item>
          )}
        />
      </div>

      <div className="prefs-section">
        <div className="prefs-row-title">{t('prefs.dataTitle')}</div>
        <div className="prefs-row-desc">{t('prefs.dataDesc')}</div>
        <Space style={{ marginTop: 12 }}>
          <Button icon={<ExportOutlined />} onClick={() => void doExport()}>
            {t('prefs.exportBtn')}
          </Button>
          <Button icon={<ImportOutlined />} onClick={confirmImport}>
            {t('prefs.importBtn')}
          </Button>
        </Space>
      </div>
    </>
  )
}

/** 关于：应用信息与运行时版本 */
function AboutTab({ visible }: { visible: boolean }) {
  const { t } = useTranslation()
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    if (!visible) return
    void window.api
      .getAppInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [visible])

  return (
    <div className="about-tab">
      <div className="about-logo">⌘</div>
      <div className="about-title-row">
        <span className="about-title">{t('app.title')}</span>
        <Tag color="geekblue">
          {t('about.version')} {info?.version ?? '-'}
        </Tag>
      </div>
      <Typography.Paragraph type="secondary" className="about-desc">
        {t('about.desc')}
      </Typography.Paragraph>
      <Descriptions
        size="small"
        column={1}
        title={t('about.techTitle')}
        items={[
          { key: 'electron', label: 'Electron', children: info?.electron || '-' },
          { key: 'node', label: 'Node.js', children: info?.node || '-' },
          { key: 'chrome', label: 'Chromium', children: info?.chrome || '-' },
          {
            key: 'stack',
            label: 'UI',
            children: 'React 18 · Ant Design 5 · Zustand · SQLite (node:sqlite)'
          }
        ]}
      />
    </div>
  )
}

/** AI：全局智能体模板 + 技能库管理（settings 表 'aiLibrary'） */
function AiTab({ visible }: { visible: boolean }) {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const aiLibrary = useStore((s) => s.aiLibrary)
  const saveAiLibrary = useStore((s) => s.saveAiLibrary)
  const restoreAiLibrary = useStore((s) => s.restoreAiLibrary)
  const refreshAiLibrary = useStore((s) => s.refreshAiLibrary)

  useEffect(() => {
    if (visible) void refreshAiLibrary()
  }, [visible, refreshAiLibrary])

  const [agentDraft, setAgentDraft] = useState<AgentTemplate | null>(null)
  const [skillDraft, setSkillDraft] = useState<SkillDef | null>(null)

  const confirmDeleteAgent = (agent: AgentTemplate): void => {
    modal.confirm({
      title: t('prefs.aiDeleteMsg', { name: agent.name }),
      okText: t('prefs.aiDelete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () =>
        void saveAiLibrary({ ...aiLibrary, agents: aiLibrary.agents.filter((a) => a.id !== agent.id) })
    })
  }

  const confirmDeleteSkill = (skill: SkillDef): void => {
    modal.confirm({
      title: t('prefs.aiDeleteMsg', { name: skill.name }),
      okText: t('prefs.aiDelete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () =>
        void saveAiLibrary({ ...aiLibrary, skills: aiLibrary.skills.filter((s) => s.id !== skill.id) })
    })
  }

  const saveAgent = (): void => {
    if (!agentDraft?.name?.trim()) {
      message.warning(t('prefs.aiName'))
      return
    }
    const draft: AgentTemplate = {
      id: agentDraft.id || crypto.randomUUID(),
      name: agentDraft.name.trim(),
      kind: agentDraft.kind,
      command: agentDraft.command?.trim() || undefined,
      model: agentDraft.model?.trim() || undefined,
      brief: agentDraft.brief?.trim() || undefined,
      builtin: agentDraft.builtin === true
    }
    const agents = aiLibrary.agents.some((a) => a.id === draft.id)
      ? aiLibrary.agents.map((a) => (a.id === draft.id ? draft : a))
      : [...aiLibrary.agents, draft]
    void saveAiLibrary({ ...aiLibrary, agents })
    setAgentDraft(null)
  }

  const saveSkill = (): void => {
    if (!skillDraft?.name?.trim()) {
      message.warning(t('prefs.aiName'))
      return
    }
    const draft: SkillDef = {
      id: skillDraft.id || crypto.randomUUID(),
      name: skillDraft.name.trim(),
      description: skillDraft.description?.trim() ?? '',
      body: skillDraft.body ?? '',
      tags: skillDraft.tags && skillDraft.tags.length > 0 ? skillDraft.tags : undefined
    }
    const skills = aiLibrary.skills.some((s) => s.id === draft.id)
      ? aiLibrary.skills.map((s) => (s.id === draft.id ? draft : s))
      : [...aiLibrary.skills, draft]
    void saveAiLibrary({ ...aiLibrary, skills })
    setSkillDraft(null)
  }

  return (
    <>
      <div className="prefs-section">
        <div className="prefs-row-title">{t('prefs.aiAgentsTitle')}</div>
        <List
          size="small"
          bordered
          dataSource={aiLibrary.agents}
          locale={{ emptyText: t('prefs.listEmpty') }}
          renderItem={(agent) => (
            <List.Item
              actions={[
                <Button
                  key="edit"
                  type="link"
                  size="small"
                  onClick={() => setAgentDraft({ ...agent })}
                >
                  {t('prefs.aiEdit')}
                </Button>,
                <Button
                  key="del"
                  type="link"
                  size="small"
                  danger
                  disabled={agent.builtin === true}
                  onClick={() => confirmDeleteAgent(agent)}
                >
                  {t('prefs.aiDelete')}
                </Button>
              ]}
            >
              <List.Item.Meta
                title={
                  <span>
                    {agent.name}
                    {agent.builtin && (
                      <Tag color="geekblue" style={{ marginLeft: 8 }}>
                        {t('prefs.aiBuiltin')}
                      </Tag>
                    )}
                  </span>
                }
                description={`${t('prefs.aiKind')}: ${agent.kind}${
                  agent.command ? ` · ${t('prefs.aiCommand')}: ${agent.command}` : ''
                }${agent.model ? ` · ${t('prefs.aiModel')}: ${agent.model}` : ''}`}
              />
            </List.Item>
          )}
        />
        <div className="prefs-toolbar">
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setAgentDraft({ id: crypto.randomUUID(), name: '', kind: 'custom' })}
          >
            {t('prefs.aiAdd')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void restoreAiLibrary()}>
            {t('prefs.aiRestore')}
          </Button>
        </div>
      </div>

      <div className="prefs-section">
        <div className="prefs-row-title">{t('prefs.aiSkillsTitle')}</div>
        <List
          size="small"
          bordered
          dataSource={aiLibrary.skills}
          locale={{ emptyText: t('prefs.listEmpty') }}
          renderItem={(skill) => (
            <List.Item
              actions={[
                <Button
                  key="edit"
                  type="link"
                  size="small"
                  onClick={() => setSkillDraft({ ...skill, tags: skill.tags ? [...skill.tags] : [] })}
                >
                  {t('prefs.aiEdit')}
                </Button>,
                <Button
                  key="del"
                  type="link"
                  size="small"
                  danger
                  onClick={() => confirmDeleteSkill(skill)}
                >
                  {t('prefs.aiDelete')}
                </Button>
              ]}
            >
              <List.Item.Meta
                title={
                  <span>
                    {skill.name}
                    {skill.tags?.map((tg) => (
                      <Tag key={tg} style={{ marginLeft: 4 }}>
                        {tg}
                      </Tag>
                    ))}
                  </span>
                }
                description={skill.description}
              />
            </List.Item>
          )}
        />
        <div className="prefs-toolbar">
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() =>
              setSkillDraft({ id: crypto.randomUUID(), name: '', description: '', body: '', tags: [] })
            }
          >
            {t('prefs.aiAdd')}
          </Button>
        </div>
      </div>

      {/* 智能体模板 编辑/新增 */}
      <Modal
        open={agentDraft !== null}
        onCancel={() => setAgentDraft(null)}
        onOk={saveAgent}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        title={t('prefs.aiEditModalTitle')}
        width={480}
        destroyOnClose
      >
        {agentDraft && (
          <Form layout="vertical" style={{ marginTop: 12 }}>
            <Form.Item label={t('prefs.aiName')} required>
              <Input
                value={agentDraft.name}
                onChange={(e) => setAgentDraft({ ...agentDraft, name: e.target.value })}
                placeholder="Claude Code"
              />
            </Form.Item>
            <Form.Item label={t('prefs.aiKind')}>
              <Radio.Group
                value={agentDraft.kind}
                onChange={(e) => setAgentDraft({ ...agentDraft, kind: e.target.value })}
              >
                <Radio value="claude">Claude</Radio>
                <Radio value="cursor">Cursor</Radio>
                <Radio value="custom">Custom</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item label={t('prefs.aiCommand')}>
              <Input
                value={agentDraft.command ?? ''}
                onChange={(e) => setAgentDraft({ ...agentDraft, command: e.target.value })}
                placeholder="claude"
              />
            </Form.Item>
            <Form.Item label={t('prefs.aiModel')}>
              <Input
                value={agentDraft.model ?? ''}
                onChange={(e) => setAgentDraft({ ...agentDraft, model: e.target.value })}
                placeholder="claude-opus-5"
              />
            </Form.Item>
            <Form.Item label={t('prefs.aiBrief')}>
              <Input.TextArea
                value={agentDraft.brief ?? ''}
                onChange={(e) => setAgentDraft({ ...agentDraft, brief: e.target.value })}
                rows={3}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* 技能 编辑/新增 */}
      <Modal
        open={skillDraft !== null}
        onCancel={() => setSkillDraft(null)}
        onOk={saveSkill}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        title={t('prefs.aiSkillEditTitle')}
        width={520}
        destroyOnClose
      >
        {skillDraft && (
          <Form layout="vertical" style={{ marginTop: 12 }}>
            <Form.Item label={t('prefs.aiName')} required>
              <Input
                value={skillDraft.name}
                onChange={(e) => setSkillDraft({ ...skillDraft, name: e.target.value })}
              />
            </Form.Item>
            <Form.Item label={t('prefs.aiSkillDesc')}>
              <Input.TextArea
                value={skillDraft.description}
                onChange={(e) => setSkillDraft({ ...skillDraft, description: e.target.value })}
                rows={2}
              />
            </Form.Item>
            <Form.Item label={t('prefs.aiSkillTags')}>
              <Select
                mode="tags"
                value={skillDraft.tags ?? []}
                onChange={(v: string[]) => setSkillDraft({ ...skillDraft, tags: v })}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label={t('prefs.aiSkillBody')}>
              <Input.TextArea
                className="ai-skill-body"
                value={skillDraft.body}
                onChange={(e) => setSkillDraft({ ...skillDraft, body: e.target.value })}
                rows={8}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  )
}
