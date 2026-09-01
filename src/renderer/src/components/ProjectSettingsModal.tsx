import { useEffect, useState } from 'react'
import {
  App,
  AutoComplete,
  Button,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Tabs,
  Tooltip,
  Typography
} from 'antd'
import { CodeOutlined, DeleteOutlined } from '@ant-design/icons'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import type {
  AgentOverride,
  AiWriteReport,
  BuiltinCardToggle,
  CardMoreToggle,
  CardShortcut,
  ProjectAiConfig,
  ProjectTypeConfig
} from '../../../shared/types'
import { useStore } from '../store'

const PM_OPTIONS = ['npm', 'pnpm', 'yarn', 'bun'].map((v) => ({ value: v, label: v }))

/** 内置卡片按钮显隐开关（key → i18n 文案） */
const BUILTIN_TOGGLES: Array<{ key: BuiltinCardToggle; labelKey: string }> = [
  { key: 'start', labelKey: 'card.start' },
  { key: 'stop', labelKey: 'card.stop' },
  { key: 'build', labelKey: 'card.build' },
  { key: 'browser', labelKey: 'card.openBrowser' },
  { key: 'logs', labelKey: 'card.logs' },
  { key: 'editPackage', labelKey: 'card.editPackage' }
]

/** 更多菜单操作上屏为卡片按钮的开关（key → i18n 文案） */
const MORE_TOGGLES: Array<{ key: CardMoreToggle; labelKey: string }> = [
  { key: 'folder', labelKey: 'card.openFolder' },
  { key: 'editor', labelKey: 'card.openEditor' },
  { key: 'terminal', labelKey: 'card.openTerminal' }
]

const EMPTY_AI: ProjectAiConfig = { enabledAgentIds: [], enabledSkillIds: [] }

/** 项目设置：通用 / AI Agent / 快捷命令 */
export default function ProjectSettingsModal() {
  const { message } = App.useApp()
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const projectId = useStore((s) => s.projSettingsId)
  const projects = useStore((s) => s.projects)
  const groups = useStore((s) => s.groups)
  const aiLibrary = useStore((s) => s.aiLibrary)
  const close = useStore((s) => s.closeProjectSettings)
  const updateProject = useStore((s) => s.updateProject)
  const writeAiFiles = useStore((s) => s.writeAiFiles)
  const running = useStore(useShallow((s) => s.running.filter((r) => r.projectId === projectId)))
  const [saving, setSaving] = useState(false)
  const [useNvm, setUseNvm] = useState(false)
  const [nvmVersions, setNvmVersions] = useState<string[]>([])
  const [aiCfg, setAiCfg] = useState<ProjectAiConfig | null>(null)
  const [shortcuts, setShortcuts] = useState<CardShortcut[]>([])
  const [builtins, setBuiltins] = useState<Partial<Record<BuiltinCardToggle, boolean>>>({})
  const [more, setMore] = useState<Partial<Record<CardMoreToggle, boolean>>>({})
  const [writeReport, setWriteReport] = useState<AiWriteReport | null>(null)
  const [writing, setWriting] = useState(false)

  const project = projects.find((p) => p.id === projectId)

  useEffect(() => {
    if (project) {
      const cfg = project.typeConfig
      setUseNvm(cfg.useNvm === true)
      // 手动 gitRoot：'' → 'none'，路径 → 路径，null/undefined → 'auto'
      const gitMode =
        project.gitRoot == null ? 'auto' : project.gitRoot === '' ? 'none' : project.gitRoot
      form.setFieldsValue({
        name: project.name,
        groupName: project.groupName || '',
        packageManager: cfg.packageManager ?? 'auto',
        gitMode,
        nodeVersion: cfg.nodeVersion ?? '',
        favoriteScripts: cfg.favoriteScripts ?? [],
        browserUrl: cfg.browserUrl ?? ''
      })
      setAiCfg(cfg.ai ? { ...cfg.ai, overrides: { ...(cfg.ai.overrides ?? {}) } } : null)
      setShortcuts((cfg.cardShortcuts ?? []).map((s) => ({ ...s })))
      setBuiltins(cfg.cardBuiltins ?? {})
      setMore(cfg.cardMore ?? {})
      setWriteReport(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, project?.id])

  useEffect(() => {
    if (projectId) {
      void window.api
        .nvmList()
        .then((info) => setNvmVersions(info.versions))
        .catch(() => setNvmVersions([]))
    }
  }, [projectId])

  const scriptOptions = (project?.scripts ?? []).map((s) => ({ value: s, label: s }))
  const groupOptions = groups.map((g) => ({ value: g.name, label: g.name }))
  const agentOptions = aiLibrary.agents.map((a) => ({
    value: a.id,
    label: `${a.name}${a.builtin ? `（${t('prefs.aiBuiltin')}）` : ''}`
  }))
  const skillOptions = aiLibrary.skills.map((s) => ({ value: s.id, label: s.name }))

  const gitOptions = [
    {
      value: 'auto',
      label: project?.git?.root
        ? t('projSettings.gitAuto', { root: project.git.root })
        : t('projSettings.gitAutoNone')
    },
    ...(project?.gitRoot && project.gitRoot !== ''
      ? [{ value: project.gitRoot, label: t('projSettings.gitManual', { path: project.gitRoot }) }]
      : []),
    { value: 'none', label: t('projSettings.gitNone') }
  ]

  // ── AI 配置编辑 ──
  const patchAi = (patch: Partial<ProjectAiConfig>): void =>
    setAiCfg((prev) => ({ ...(prev ?? { ...EMPTY_AI }), ...patch }))

  const updateOverride = (id: string, patch: Partial<AgentOverride>): void =>
    setAiCfg((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        overrides: { ...prev.overrides, [id]: { ...(prev.overrides?.[id] ?? {}), ...patch } }
      }
    })

  const selectedAgents = (aiCfg?.enabledAgentIds ?? []).map((id) => ({
    id,
    template: aiLibrary.agents.find((a) => a.id === id)
  }))

  // ── 快捷命令编辑 ──
  const patchShortcut = (id: string, patch: Partial<CardShortcut>): void =>
    setShortcuts((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const removeShortcut = (id: string): void =>
    setShortcuts((prev) => prev.filter((s) => s.id !== id))

  const addShortcut = (): void =>
    setShortcuts((prev) => [...prev, { id: crypto.randomUUID(), label: '', command: '' }])

  const toggleBuiltin = (key: BuiltinCardToggle, checked: boolean): void =>
    setBuiltins((prev) => ({ ...prev, [key]: checked }))

  const toggleMore = (key: CardMoreToggle, checked: boolean): void =>
    setMore((prev) => ({ ...prev, [key]: checked }))

  const onWrite = async (): Promise<void> => {
    if (!project) return
    setWriting(true)
    try {
      const rep = await writeAiFiles(
        project.id,
        aiCfg && (aiCfg.enabledAgentIds.length > 0 || aiCfg.enabledSkillIds.length > 0)
          ? aiCfg
          : undefined
      )
      if (rep) {
        setWriteReport(rep)
        if (rep.warnings.length > 0) {
          message.warning(rep.warnings.join('；'))
        }
        message.success(
          t('projSettings.aiWriteReport', {
            n: rep.skills.length,
            file: rep.briefFile,
            action: rep.briefAction
          })
        )
      }
    } finally {
      setWriting(false)
    }
  }

  const onOk = async (): Promise<void> => {
    if (!project) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      // AI 配置：有实际内容才写入，避免凭空多出空 ai
      let ai: ProjectAiConfig | undefined
      if (aiCfg) {
        const cleanOverrides: Record<string, AgentOverride> = {}
        for (const [id, o] of Object.entries(aiCfg.overrides ?? {})) {
          const command = o?.command?.trim() || undefined
          const model = o?.model?.trim() || undefined
          if (command || model) cleanOverrides[id] = { command, model }
        }
        const hasAi =
          aiCfg.enabledAgentIds.length > 0 ||
          aiCfg.enabledSkillIds.length > 0 ||
          !!aiCfg.root?.trim() ||
          Object.keys(cleanOverrides).length > 0
        if (hasAi) {
          ai = {
            enabledAgentIds: aiCfg.enabledAgentIds,
            enabledSkillIds: aiCfg.enabledSkillIds,
            briefFile: aiCfg.briefFile,
            root: aiCfg.root?.trim() || undefined,
            overrides: Object.keys(cleanOverrides).length > 0 ? cleanOverrides : undefined
          }
        }
      }

      // 快捷命令：丢弃空行
      const cleanShortcuts = shortcuts
        .filter((s) => s.label?.trim() && s.command?.trim())
        .map((s) => ({ id: s.id, label: s.label.trim(), command: s.command.trim() }))

      // 内置按钮显隐：只保留 false（true = 默认显示，不落库）；只认已知 key，顺带清理历史脏字段
      const cleanBuiltins: Partial<Record<BuiltinCardToggle, boolean>> = {}
      for (const { key } of BUILTIN_TOGGLES) {
        if (builtins[key] === false) cleanBuiltins[key] = false
      }
      const hasHidden = Object.keys(cleanBuiltins).length > 0

      // 更多菜单上屏：只保留 true（false/undefined = 留在「⋯」菜单，不落库）
      const cleanMore: Partial<Record<CardMoreToggle, boolean>> = {}
      for (const { key } of MORE_TOGGLES) {
        if (more[key] === true) cleanMore[key] = true
      }
      const hasMore = Object.keys(cleanMore).length > 0

      const typeConfig: ProjectTypeConfig = {
        ...project.typeConfig,
        packageManager: values.packageManager === 'auto' ? undefined : values.packageManager,
        favoriteScripts: values.favoriteScripts ?? [],
        browserUrl: values.browserUrl?.trim() || undefined,
        useNvm: useNvm,
        nodeVersion: useNvm ? values.nodeVersion?.trim() || undefined : undefined,
        ai,
        cardShortcuts: cleanShortcuts.length > 0 ? cleanShortcuts : undefined,
        cardBuiltins: hasHidden ? cleanBuiltins : undefined,
        cardMore: hasMore ? cleanMore : undefined
      }
      const gitMode: string = values.gitMode ?? 'auto'
      const ok = await updateProject(project.id, {
        name: values.name,
        groupName: values.groupName?.trim() || '',
        gitRoot: gitMode === 'auto' ? null : gitMode === 'none' ? '' : gitMode,
        typeConfig
      })
      if (ok) {
        message.success(t('projSettings.saved'))
        close()
      }
    } finally {
      setSaving(false)
    }
  }

  // ── 通用 tab ──
  const generalPane = (
    <Form form={form} layout="vertical">
      <Form.Item
        name="name"
        label={t('import.name')}
        rules={[{ required: true, message: t('import.nameRequired') }]}
      >
        <Input />
      </Form.Item>
      <Form.Item name="groupName" label={t('import.group')}>
        <AutoComplete
          options={groupOptions}
          placeholder={t('import.groupPlaceholder')}
          allowClear
        />
      </Form.Item>
      <Form.Item name="packageManager" label={t('import.pm')}>
        <Select
          options={[
            {
              value: 'auto',
              label: t('card.pmAuto', { pm: project?.detectedPackageManager ?? 'npm' })
            },
            ...PM_OPTIONS
          ]}
        />
      </Form.Item>
      <Form.Item name="gitMode" label={t('import.gitMode')}>
        <Select options={gitOptions} />
      </Form.Item>
      <Form.Item label={t('import.nvmLabel')}>
        <Space align="start">
          <Switch checked={useNvm} onChange={setUseNvm} />
          {useNvm ? (
            <Form.Item name="nodeVersion" noStyle>
              <AutoComplete
                style={{ width: 200 }}
                options={nvmVersions.map((v) => ({ value: v, label: v }))}
                placeholder={t('import.nvmPlaceholder')}
              />
            </Form.Item>
          ) : (
            <span className="settings-label">{t('import.nvmOff')}</span>
          )}
        </Space>
      </Form.Item>
      <Form.Item name="favoriteScripts" label={t('import.favScripts')}>
        <Select mode="multiple" options={scriptOptions} allowClear />
      </Form.Item>
      <Form.Item name="browserUrl" label={t('import.browserUrl')}>
        <Input placeholder={t('import.browserUrlPlaceholder')} allowClear />
      </Form.Item>
    </Form>
  )

  // ── AI Agent tab ──
  const hasAiSelection =
    (aiCfg?.enabledAgentIds.length ?? 0) > 0 || (aiCfg?.enabledSkillIds.length ?? 0) > 0
  const aiPane = (
    <div>
      <Typography.Title level={5}>{t('projSettings.aiTabTitle')}</Typography.Title>
      <Form layout="vertical" style={{ marginBottom: 12 }}>
        <Form.Item label={t('projSettings.aiAgents')}>
          <Select
            mode="multiple"
            options={agentOptions}
            value={aiCfg?.enabledAgentIds ?? []}
            onChange={(v: string[]) => patchAi({ enabledAgentIds: v })}
            allowClear
            style={{ width: '100%' }}
          />
        </Form.Item>
        {selectedAgents.length > 0 && (
          <div className="ai-agent-overrides">
            {selectedAgents.map(({ id, template }) => (
              <div className="ai-agent-override-row" key={id}>
                <span className="ai-agent-override-name">{template?.name ?? id}</span>
                <Input
                  size="small"
                  style={{ width: 150 }}
                  placeholder={t('projSettings.aiAgentCommand')}
                  value={aiCfg?.overrides?.[id]?.command ?? ''}
                  onChange={(e) => updateOverride(id, { command: e.target.value })}
                />
                <Input
                  size="small"
                  style={{ width: 170 }}
                  placeholder={t('projSettings.aiAgentModel')}
                  value={aiCfg?.overrides?.[id]?.model ?? ''}
                  onChange={(e) => updateOverride(id, { model: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
        <Form.Item label={t('projSettings.aiSkills')} style={{ marginTop: 8 }}>
          <Select
            mode="multiple"
            options={skillOptions}
            value={aiCfg?.enabledSkillIds ?? []}
            onChange={(v: string[]) => patchAi({ enabledSkillIds: v })}
            allowClear
            style={{ width: '100%' }}
          />
        </Form.Item>
        <Form.Item label={t('projSettings.aiBriefFile')}>
          <Radio.Group
            value={aiCfg?.briefFile ?? 'CLAUDE.md'}
            onChange={(e) => patchAi({ briefFile: e.target.value })}
          >
            <Radio value="CLAUDE.md">CLAUDE.md</Radio>
            <Radio value="AGENTS.md">AGENTS.md</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item label={t('projSettings.aiRoot')}>
          <Input
            placeholder={project?.git?.root ?? project?.path}
            value={aiCfg?.root ?? ''}
            onChange={(e) => patchAi({ root: e.target.value })}
            allowClear
          />
        </Form.Item>
      </Form>
      <Space align="center">
        <Button
          type="primary"
          icon={<CodeOutlined />}
          loading={writing}
          disabled={!hasAiSelection}
          onClick={() => void onWrite()}
        >
          {t('projSettings.aiWrite')}
        </Button>
        <span className="settings-label">
          {t('projSettings.aiWriteHint', { file: aiCfg?.briefFile ?? 'CLAUDE.md' })}
        </span>
      </Space>
      {writeReport && (
        <Typography.Paragraph
          type="secondary"
          style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}
        >
          <div>根目录：{writeReport.root}</div>
          {writeReport.skills.map((s) => (
            <div key={s.id}>
              {s.name} → <code>{s.path}</code>（{s.action}）
            </div>
          ))}
          <div>
            简报：<code>{writeReport.briefPath}</code>（{writeReport.briefAction}）
          </div>
        </Typography.Paragraph>
      )}
    </div>
  )

  // ── 快捷命令 tab ──
  const shortcutsPane = (
    <div>
      <Typography.Title level={5}>{t('projSettings.shortcutsBuiltins')}</Typography.Title>
      <div className="prefs-row-desc" style={{ marginBottom: 8 }}>
        {t('projSettings.shortcutsBuiltinHint')}
      </div>
      <div className="shortcuts-builtins">
        {BUILTIN_TOGGLES.map(({ key, labelKey }) => (
          <div className="shortcuts-builtin-row" key={key}>
            <span className="settings-label">{t(labelKey)}</span>
            <Switch
              size="small"
              checked={builtins[key] !== false}
              disabled={key === 'stop' && running.length > 0}
              onChange={(checked) => toggleBuiltin(key, checked)}
            />
          </div>
        ))}
      </div>

      <Typography.Title level={5} style={{ marginTop: 16 }}>
        {t('projSettings.shortcutsMore')}
      </Typography.Title>
      <div className="prefs-row-desc" style={{ marginBottom: 8 }}>
        {t('projSettings.shortcutsMoreHint')}
      </div>
      <div className="shortcuts-builtins">
        {MORE_TOGGLES.map(({ key, labelKey }) => (
          <div className="shortcuts-builtin-row" key={key}>
            <span className="settings-label">{t(labelKey)}</span>
            <Switch
              size="small"
              checked={more[key] === true}
              onChange={(checked) => toggleMore(key, checked)}
            />
          </div>
        ))}
      </div>

      <Typography.Title level={5} style={{ marginTop: 16 }}>
        {t('projSettings.shortcutsCustom')}
      </Typography.Title>
      {shortcuts.length === 0 ? (
        <div className="prefs-row-desc" style={{ marginBottom: 8 }}>
          {t('prefs.listEmpty')}
        </div>
      ) : (
        <div className="shortcuts-list">
          {shortcuts.map((s, idx) => (
            <div className="shortcuts-row" key={s.id}>
              <Input
                size="small"
                placeholder={t('projSettings.shortcutsLabelPh')}
                value={s.label}
                onChange={(e) => patchShortcut(s.id, { label: e.target.value })}
                style={{ width: 140 }}
              />
              <Input
                size="small"
                placeholder={t('projSettings.shortcutsCmdPh')}
                value={s.command}
                onChange={(e) => patchShortcut(s.id, { command: e.target.value })}
                style={{ flex: 1 }}
              />
              <Tooltip title={t('projSettings.shortcutsRemove')}>
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeShortcut(s.id)}
                />
              </Tooltip>
              <span className="settings-label" style={{ width: 26, textAlign: 'right' }}>
                {idx + 1}
              </span>
            </div>
          ))}
        </div>
      )}
      <Button size="small" type="dashed" icon={<CodeOutlined />} onClick={addShortcut}>
        {t('projSettings.shortcutsAdd')}
      </Button>
    </div>
  )

  return (
    <Modal
      open={projectId !== null}
      onCancel={close}
      onOk={() => void onOk()}
      confirmLoading={saving}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      title={project ? t('projSettings.title') + ` — ${project.name}` : t('projSettings.title')}
      width={640}
      destroyOnClose
    >
      <Tabs
        items={[
          { key: 'general', label: t('projSettings.tabGeneral'), children: generalPane },
          { key: 'ai', label: t('projSettings.tabAi'), children: aiPane },
          { key: 'shortcuts', label: t('projSettings.tabShortcuts'), children: shortcutsPane }
        ]}
      />
    </Modal>
  )
}
