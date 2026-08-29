import { useEffect, useState } from 'react'
import { App, AutoComplete, Form, Input, Modal, Select, Space, Switch } from 'antd'
import { useTranslation } from 'react-i18next'
import type { ProjectTypeConfig } from '../../../shared/types'
import { useStore } from '../store'

const PM_OPTIONS = ['npm', 'pnpm', 'yarn', 'bun'].map((v) => ({ value: v, label: v }))

/** 项目设置：名称 / 分组 / 包管理器 / git 关联 / nvm / 常用脚本 / 浏览器地址 */
export default function ProjectSettingsModal() {
  const { message } = App.useApp()
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const projectId = useStore((s) => s.projSettingsId)
  const projects = useStore((s) => s.projects)
  const groups = useStore((s) => s.groups)
  const close = useStore((s) => s.closeProjectSettings)
  const updateProject = useStore((s) => s.updateProject)
  const [saving, setSaving] = useState(false)
  const [useNvm, setUseNvm] = useState(false)
  const [nvmVersions, setNvmVersions] = useState<string[]>([])

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

  const onOk = async (): Promise<void> => {
    if (!project) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      const typeConfig: ProjectTypeConfig = {
        ...project.typeConfig,
        packageManager: values.packageManager === 'auto' ? undefined : values.packageManager,
        favoriteScripts: values.favoriteScripts ?? [],
        browserUrl: values.browserUrl?.trim() || undefined,
        useNvm: useNvm,
        nodeVersion: useNvm ? values.nodeVersion?.trim() || undefined : undefined
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

  return (
    <Modal
      open={projectId !== null}
      onCancel={close}
      onOk={() => void onOk()}
      confirmLoading={saving}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      title={project ? t('projSettings.title') + ` — ${project.name}` : t('projSettings.title')}
      width={560}
      destroyOnClose
    >
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
    </Modal>
  )
}
