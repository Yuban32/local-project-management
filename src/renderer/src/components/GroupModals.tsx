import { useEffect, useState } from 'react'
import { AutoComplete, Form, Input, Modal, Radio, Select } from 'antd'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'

/**
 * 分组相关弹窗集合：
 * - 新建 / 重命名分组（侧边栏触发）
 * - 删除分组（选择组内项目去向）
 * - 批量分组（批量条触发）
 */
export default function GroupModals() {
  return (
    <>
      <GroupEditModal />
      <GroupDeleteModal />
      <BatchAssignModal />
    </>
  )
}

/** 新建 / 重命名分组 */
function GroupEditModal() {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const groupEditor = useStore((s) => s.groupEditor)
  const closeGroupEditor = useStore((s) => s.closeGroupEditor)
  const createGroup = useStore((s) => s.createGroup)
  const renameGroup = useStore((s) => s.renameGroup)
  const [saving, setSaving] = useState(false)

  const open = groupEditor !== null && groupEditor.mode !== 'delete'

  useEffect(() => {
    if (groupEditor?.mode === 'rename') {
      form.setFieldsValue({ name: groupEditor.name })
    } else {
      form.resetFields()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupEditor])

  const onOk = async (): Promise<void> => {
    if (!groupEditor || groupEditor.mode === 'delete') return
    const { name } = await form.validateFields()
    setSaving(true)
    try {
      const ok =
        groupEditor.mode === 'create'
          ? await createGroup(name)
          : await renameGroup(groupEditor.name, name)
      if (ok) closeGroupEditor()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={closeGroupEditor}
      onOk={() => void onOk()}
      confirmLoading={saving}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      title={groupEditor?.mode === 'rename' ? t('group.renameTitle') : t('group.createTitle')}
      width={420}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label={t('group.nameLabel')}
          rules={[{ required: true, message: t('group.nameRequired') }]}
        >
          <Input placeholder={t('group.namePlaceholder')} maxLength={50} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

/** 删除分组：选择组内项目去向（未分组 / 其他分组） */
function GroupDeleteModal() {
  const { t } = useTranslation()
  const groupEditor = useStore((s) => s.groupEditor)
  const closeGroupEditor = useStore((s) => s.closeGroupEditor)
  const groups = useStore((s) => s.groups)
  const deleteGroup = useStore((s) => s.deleteGroup)

  const deleting = groupEditor?.mode === 'delete' ? groupEditor.name : null
  const [target, setTarget] = useState<'ungrouped' | 'other'>('ungrouped')
  const [otherName, setOtherName] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  const otherGroups = groups.filter((g) => g.name !== deleting)
  const count = groups.find((g) => g.name === deleting)?.count ?? 0

  useEffect(() => {
    if (deleting !== null) {
      setTarget('ungrouped')
      setOtherName(otherGroups[0]?.name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleting])

  const onOk = async (): Promise<void> => {
    if (deleting === null) return
    const moveTo = target === 'ungrouped' ? '' : (otherName ?? '')
    setSaving(true)
    try {
      const ok = await deleteGroup(deleting, moveTo)
      if (ok) closeGroupEditor()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={deleting !== null}
      onCancel={closeGroupEditor}
      onOk={() => void onOk()}
      confirmLoading={saving}
      okText={t('group.deleteOk')}
      okButtonProps={{ danger: true }}
      cancelText={t('common.cancel')}
      title={t('group.deleteTitle', { name: deleting ?? '' })}
      width={440}
      destroyOnClose
    >
      <p className="settings-label">{t('group.deleteContent', { n: count })}</p>
      <Radio.Group
        value={target}
        onChange={(e) => setTarget(e.target.value as 'ungrouped' | 'other')}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <Radio value="ungrouped">{t('group.deleteToUngrouped')}</Radio>
        <Radio value="other" disabled={otherGroups.length === 0}>
          <Select
            size="small"
            style={{ width: 200 }}
            placeholder={t('group.deletePickOther')}
            value={target === 'other' ? otherName : undefined}
            onChange={setOtherName}
            options={otherGroups.map((g) => ({ value: g.name, label: g.name }))}
            disabled={target !== 'other' || otherGroups.length === 0}
          />
        </Radio>
      </Radio.Group>
    </Modal>
  )
}

/** 批量分组：把选中的项目移动到指定分组（清空输入 = 未分组；输入新名会自动创建分组） */
function BatchAssignModal() {
  const { t } = useTranslation()
  const groups = useStore((s) => s.groups)
  const selectedCount = useStore((s) => s.selectedIds.length)
  const assignOpen = useStore((s) => s.assignOpen)
  const closeAssign = useStore((s) => s.closeAssign)
  const batchAssignGroup = useStore((s) => s.batchAssignGroup)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (assignOpen) setValue('')
  }, [assignOpen])

  const onOk = async (): Promise<void> => {
    setBusy(true)
    try {
      await batchAssignGroup(value.trim())
      closeAssign()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={assignOpen}
      onCancel={closeAssign}
      onOk={() => void onOk()}
      confirmLoading={busy}
      okText={t('batch.assignOk')}
      cancelText={t('common.cancel')}
      title={t('batch.assignTitle', { n: selectedCount })}
      width={440}
      destroyOnClose
    >
      <AutoComplete
        value={value}
        onChange={(v) => setValue(v ?? '')}
        options={[
          { value: '', label: t('group.ungrouped') },
          ...groups.map((g) => ({ value: g.name, label: g.name }))
        ]}
        placeholder={t('batch.assignPlaceholder')}
        style={{ width: '100%' }}
        allowClear
      />
    </Modal>
  )
}
