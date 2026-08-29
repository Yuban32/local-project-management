import { useEffect, useState } from 'react'
import { App, AutoComplete, Form, Input, Modal, Select, Space, Switch, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import type { ProjectTypeConfig } from '../../../shared/types'
import { useStore } from '../store'

const PM_OPTIONS = ['npm', 'pnpm', 'yarn', 'bun'].map((v) => ({ value: v, label: v }))

/** 手动添加项目：目录已选择，配置类型 / 名称 / 包管理器 / 分组 / git 关联 / nvm / 常用脚本 */
export default function ImportModal() {
  const { message } = App.useApp()
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const open = useStore((s) => s.importOpen)
  const prefill = useStore((s) => s.importPrefill)
  const types = useStore((s) => s.types)
  const groups = useStore((s) => s.groups)
  const close = useStore((s) => s.closeImport)
  const refresh = useStore((s) => s.refresh)
  const [saving, setSaving] = useState(false)
  const [useNvm, setUseNvm] = useState(false)
  const [nvmVersions, setNvmVersions] = useState<string[]>([])

  useEffect(() => {
    if (open && prefill) {
      setUseNvm(false)
      form.setFieldsValue({
        name: prefill.name,
        type: prefill.type,
        packageManager: prefill.typeInfo?.packageManager ?? 'auto',
        groupName: '',
        gitMode: prefill.parentGitRoot ? prefill.parentGitRoot.path : 'auto',
        favoriteScripts: [],
        browserUrl: ''
      })
      void window.api
        .nvmList()
        .then((info) => setNvmVersions(info.versions))
        .catch(() => setNvmVersions([]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill])

  const scriptOptions = (prefill?.typeInfo?.scripts ?? []).map((s) => ({ value: s, label: s }))
  const groupOptions = groups.map((g) => ({ value: g.name, label: g.name }))

  // git 关联选项：自动检测 / 检测到的父级仓库（确认）/ 不关联
  const gitOptions = [
    { value: 'auto', label: t('import.gitAuto') },
    ...(prefill?.parentGitRoot
      ? [
          {
            value: prefill.parentGitRoot.path,
            label:
              t('import.gitParent', { path: prefill.parentGitRoot.path }) +
              (prefill.parentGitRoot.currentBranch
                ? t('import.gitParentBranch', { branch: prefill.parentGitRoot.currentBranch })
                : '')
          }
        ]
      : []),
    { value: 'none', label: t('import.gitNone') }
  ]

  const onOk = async (): Promise<void> => {
    if (!prefill) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      const typeConfig: ProjectTypeConfig = {
        packageManager: values.packageManager === 'auto' ? undefined : values.packageManager,
        favoriteScripts: values.favoriteScripts ?? [],
        browserUrl: values.browserUrl?.trim() || undefined,
        useNvm: useNvm,
        nodeVersion: useNvm ? values.nodeVersion?.trim() || undefined : undefined
      }
      const gitMode: string = values.gitMode ?? 'auto'
      await window.api.addProject(prefill.path, {
        name: values.name,
        type: values.type,
        typeConfig,
        groupName: values.groupName?.trim() || undefined,
        gitRoot: gitMode === 'auto' ? null : gitMode === 'none' ? '' : gitMode
      })
      await refresh()
      message.success(t('import.done', { name: values.name }))
      close()
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={close}
      onOk={() => void onOk()}
      confirmLoading={saving}
      okText={t('import.ok')}
      cancelText={t('common.cancel')}
      title={t('import.title')}
      width={560}
    >
      {prefill && (
        <>
          <div className="import-path">
            <Tag color="geekblue">{prefill.typeLabel}</Tag>
            <span title={prefill.path}>{prefill.path}</span>
          </div>
          <Form form={form} layout="vertical">
            <Form.Item
              name="name"
              label={t('import.name')}
              rules={[{ required: true, message: t('import.nameRequired') }]}
            >
              <Input placeholder={t('import.name')} />
            </Form.Item>
            <Form.Item name="type" label={t('import.type')}>
              <Select
                options={types.map((ty) => ({
                  value: ty.id,
                  label: ty.implemented ? ty.label : `${ty.label}（${t('import.comingSoon')}）`,
                  disabled: !ty.implemented
                }))}
              />
            </Form.Item>
            <Form.Item name="groupName" label={t('import.group')}>
              <AutoComplete
                options={groupOptions}
                placeholder={t('import.groupPlaceholder')}
                allowClear
              />
            </Form.Item>
            <Form.Item name="packageManager" label={t('import.pm')}>
              <Select options={[{ value: 'auto', label: t('import.pmAuto') }, ...PM_OPTIONS]} />
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
                      placeholder={
                        nvmVersions.length > 0
                          ? t('import.nvmPlaceholder')
                          : t('import.nvmPlaceholderMissing')
                      }
                    />
                  </Form.Item>
                ) : (
                  <span className="settings-label">{t('import.nvmOff')}</span>
                )}
              </Space>
            </Form.Item>
            <Form.Item name="favoriteScripts" label={t('import.favScripts')}>
              <Select
                mode="multiple"
                options={scriptOptions}
                placeholder={t('import.multiPlaceholder')}
                allowClear
              />
            </Form.Item>
            <Form.Item name="browserUrl" label={t('import.browserUrl')}>
              <Input placeholder={t('import.browserUrlPlaceholder')} allowClear />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  )
}
