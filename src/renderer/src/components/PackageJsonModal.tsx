import { useEffect, useState } from 'react'
import { App, Modal, Input } from 'antd'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'

/** package.json 原文编辑：保存前 JSON 校验，失败不落盘 */
export default function PackageJsonModal() {
  const { message } = App.useApp()
  const { t } = useTranslation()
  const projectId = useStore((s) => s.pkgProjectId)
  const projects = useStore((s) => s.projects)
  const close = useStore((s) => s.closePackage)
  const refresh = useStore((s) => s.refresh)

  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const project = projects.find((p) => p.id === projectId)

  useEffect(() => {
    if (!projectId) return
    window.api
      .readPackageJson(projectId)
      .then(setContent)
      .catch((err: unknown) => message.error(err instanceof Error ? err.message : String(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const onOk = async (): Promise<void> => {
    try {
      JSON.parse(content)
    } catch (err) {
      message.error(
        t('pkg.invalidJson', { error: err instanceof Error ? err.message : String(err) })
      )
      return
    }
    if (!projectId) return
    setSaving(true)
    try {
      await window.api.writePackageJson(projectId, content)
      message.success(t('pkg.saved'))
      await refresh()
      close()
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
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
      title={project ? t('pkg.titleWith', { name: project.name }) : t('pkg.title')}
      width={720}
      destroyOnClose
    >
      <Input.TextArea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={20}
        className="pkg-editor"
        spellCheck={false}
      />
    </Modal>
  )
}
