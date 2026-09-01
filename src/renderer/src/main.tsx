import { useEffect } from 'react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App as AntApp, ConfigProvider, theme } from 'antd'
import { useTranslation } from 'react-i18next'
import './i18n'
import { antdLocales } from './i18n'
import App from './App'
import './styles.css'

/** 用 useTranslation 订阅语言变化，联动 antd 组件文案 */
function ThemedRoot() {
  const { t, i18n } = useTranslation()
  const antdLocale = antdLocales[i18n.language] ?? antdLocales['en-US']
  // 标题随语言动态切换：document.title 会同步到窗口标题栏（独立于 index.html 的静态回退）
  useEffect(() => {
    document.title = t('app.title')
  }, [t])
  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#4f7cff',
          borderRadius: 8
        }
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemedRoot />
  </React.StrictMode>
)
