import { useState } from 'react'
import { App, Button, InputNumber, List, Modal, Space, Table, Tag } from 'antd'
import { FolderAddOutlined, ScanOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ScanCandidate } from '../../../shared/types'
import { useStore } from '../store'

/** 扫描设置：管理扫描目录 + 深度，立即扫描并批量导入 */
export default function SettingsModal() {
  const { message } = App.useApp()
  const { t } = useTranslation()
  const open = useStore((s) => s.settingsOpen)
  const close = useStore((s) => s.closeSettings)
  const settings = useStore((s) => s.settings)
  const refresh = useStore((s) => s.refresh)

  const [dirs, setDirs] = useState<string[]>(settings.scanDirs)
  const [depth, setDepth] = useState<number>(settings.scanDepth)
  const [scanning, setScanning] = useState(false)
  const [results, setResults] = useState<ScanCandidate[] | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [importing, setImporting] = useState(false)

  const addDir = async (): Promise<void> => {
    const dir = await window.api.chooseDirectory()
    if (!dir) return
    setDirs((prev) => (prev.includes(dir) ? prev : [...prev, dir]))
  }

  const doScan = async (): Promise<void> => {
    setScanning(true)
    try {
      await window.api.saveScanSettings({ scanDirs: dirs, scanDepth: depth })
      const candidates = await window.api.scan()
      setResults(candidates)
      setSelectedKeys(candidates.filter((c) => !c.imported).map((c) => c.path))
      message.success(t('settings.scanned', { n: candidates.length }))
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }

  const importSelected = async (): Promise<void> => {
    if (!results) return
    const targets = results.filter((c) => selectedKeys.includes(c.path) && !c.imported)
    if (targets.length === 0) {
      message.info(t('settings.selectNew'))
      return
    }
    setImporting(true)
    let ok = 0
    for (const c of targets) {
      try {
        await window.api.addProject(c.path, {
          name: c.name,
          type: c.type,
          typeConfig: { packageManager: c.typeInfo?.packageManager }
        })
        ok += 1
      } catch (err) {
        message.error(
          t('settings.importFailed', {
            name: c.name,
            error: err instanceof Error ? err.message : String(err)
          })
        )
      }
    }
    setImporting(false)
    await refresh()
    // 刷新导入状态
    await doScan()
    if (ok > 0) message.success(t('settings.imported', { n: ok }))
  }

  return (
    <Modal
      open={open}
      onCancel={close}
      title={t('settings.title')}
      width={760}
      footer={[
        <Button key="close" onClick={close}>
          {t('common.close')}
        </Button>,
        <Button key="scan" icon={<ScanOutlined />} loading={scanning} onClick={() => void doScan()}>
          {t('settings.saveAndScan')}
        </Button>,
        <Button
          key="import"
          type="primary"
          loading={importing}
          disabled={!results || results.every((c) => c.imported)}
          onClick={() => void importSelected()}
        >
          {t('settings.importSelected')}
        </Button>
      ]}
    >
      <div className="settings-section">
        <div className="settings-title">{t('settings.dirsTitle')}</div>
        <List
          size="small"
          bordered
          dataSource={dirs}
          locale={{ emptyText: t('settings.dirsEmpty') }}
          renderItem={(dir) => (
            <List.Item
              actions={[
                <Button
                  key="del"
                  type="text"
                  size="small"
                  danger
                  onClick={() => setDirs((prev) => prev.filter((d) => d !== dir))}
                >
                  {t('settings.remove')}
                </Button>
              ]}
            >
              {dir}
            </List.Item>
          )}
        />
        <Space style={{ marginTop: 12 }}>
          <Button icon={<FolderAddOutlined />} onClick={() => void addDir()}>
            {t('settings.addDir')}
          </Button>
          <span className="settings-label">{t('settings.depth')}</span>
          <InputNumber min={0} max={5} value={depth} onChange={(v) => setDepth(v ?? 2)} />
          <span className="settings-label">{t('settings.depthUnit')}</span>
        </Space>
      </div>

      {results && (
        <div className="settings-section">
          <div className="settings-title">{t('settings.resultTitle', { n: results.length })}</div>
          <Table<ScanCandidate>
            size="small"
            rowKey="path"
            dataSource={results}
            pagination={false}
            scroll={{ y: 300 }}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: (keys) => setSelectedKeys(keys),
              getCheckboxProps: (c) => ({ disabled: c.imported })
            }}
            columns={[
              { title: t('settings.colName'), dataIndex: 'name', width: 160, ellipsis: true },
              { title: t('settings.colPath'), dataIndex: 'path', ellipsis: true },
              {
                title: t('settings.colType'),
                dataIndex: 'typeLabel',
                width: 80,
                render: (label: string) => <Tag color="geekblue">{label}</Tag>
              },
              {
                title: t('settings.colPm'),
                width: 90,
                render: (_: unknown, c) => c.typeInfo?.packageManager ?? '-'
              },
              {
                title: t('settings.colStatus'),
                dataIndex: 'imported',
                width: 80,
                render: (imported: boolean) =>
                  imported ? (
                    <Tag>{t('settings.statusImported')}</Tag>
                  ) : (
                    <Tag color="success">{t('settings.statusNew')}</Tag>
                  )
              }
            ]}
          />
        </div>
      )}
    </Modal>
  )
}
