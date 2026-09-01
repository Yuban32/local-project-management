# 本地项目管理器

[English](../README.md) · **简体中文**

一款面向开发者的**本地项目管理 / 启动器**桌面应用。将所有本地项目统一纳入一个随时待命的卡片面板——扫描发现、一键启动脚本、实时日志、分支切换、分组整理,帮你免去在多个终端窗口之间反复切换的繁琐操作。

基于 **Electron + Vite + React + TypeScript** 构建,**Windows 优先**,兼容 macOS / Linux。

> 架构设计与扩展指引见 [ARCHITECTURE.md](../ARCHITECTURE.md),开发约定与易踩坑点见 [AGENTS.md](../AGENTS.md)。

---

## ✨ 功能特性

### 项目管理

- **扫描发现**：配置一个或多个扫描目录,自动下探识别本地项目(marker 文件如 `package.json`),已经在列表中的项目自动标记「已导入」,已识别项目的目录不再重复下探(适合 monorepo 场景)
- **手动导入**：选择任意目录添加,自动预填名称 / 类型 / 包管理器,并检测**父级 git 仓库**供确认关联
- **分组整理**：侧边栏分组导航,支持新建 / 重命名 / 删除分组,**批量移动**项目到分组
- **批量操作**：卡片多选,一键批量移除出列表或**移入系统回收站**(可恢复)
- **全局搜索**：按名称 / 路径 / 分组 / 脚本 / 包管理器 / 分支等任意可见信息即时过滤

### 一键运行

- 卡片直达常用脚本(`dev` / `start` / `preview` 等启动类、`build` 类自动归类),也可从下拉菜单选择任意 `npm scripts`
- **停止保证干净**：Windows 下以 `taskkill /pid /T /F` 杀掉整棵进程树,不会残留 dev server;应用退出前自动清理所有运行中任务
- **自定义命令快捷按钮**：为项目配置任意 shell 命令并上屏为卡片按钮
- **多 Node 版本**：接入 **nvm-windows**,可按项目指定 Node 版本运行脚本
- **nvm / 包管理器识别**：自动探测(`packageManager` 字段 > 锁文件),也可手动覆盖 npm / pnpm / yarn / bun

### 运行观测

- **实时日志**：日志抽屉实时滚动,stdout / stderr 分色显示,同时落库
- **历史回放**：每次运行保留最近 50 次历史与末尾 2000 行日志,重启后可回看
- **浏览器直达**：从运行日志自动探测 `localhost` 服务地址一键打开,也可手动指定
- **package.json 在线编辑**：卡片内直接改动并校验 JSON 后落盘

### Git 集成

- **仓库根智能解析**：手动指定 > 项目目录向上找 `.git`(monorepo 子包自动命中父级仓库)
- **分支切换**：卡片上即切即用,支持本地 / 远程跟踪分支分组展示;**脏工作区切换前二次确认**
- **远程更新**：一键 `git fetch --all --prune`,并支持**搜索分支**

### 环境联动

- **多终端**：Windows Terminal / Git Bash / CMD / PowerShell 按偏好打开,顶栏可视缺省回退策略
- **多编辑器**：自动探测 VS Code / Insiders / VSCodium / Cursor 任一安装,一键用编辑器打开项目

### AI 辅助

- **智能体模板**：内置 Claude Code / Cursor 模板,可自定义命令与模型
- **技能库**：维护可复用的 Markdown 技能,一键写入项目 `.claude/skills/<id>/SKILL.md`
- **项目简报托管**：将启用的智能体与技能汇总写入项目 `CLAUDE.md` / `AGENTS.md` 的**哨兵区块**,绝不覆盖用户手写内容

### 数据与安全

- **自动备份**：按间隔自动备份数据库、按份数保留上限;支持手动备份 / **恢复** / **导出 / 导入**数据
- **开放扩展**：项目类型基于**适配器接口**驱动,接入新类型只需实现一个接口
- **安全沙箱**：`contextIsolation: true` + `nodeIntegration: false`,preload 仅暴露白名单通道,渲染层无任何 Node / Electron 直访面

### 界面

- **中英双语**：跟随系统语言,可手动切换并记忆;antd 组件文字同步联动
- **暗色主题**：antd 5 `darkAlgorithm` 全套暗色风格

---

## 🧰 技术栈

| 层       | 技术                                                           |
| -------- | -------------------------------------------------------------- |
| 桌面容器 | Electron 37                                                    |
| 构建     | electron-vite 3 + Vite 6                                       |
| 界面     | React 18 + Ant Design 5(`@ant-design/icons`)                   |
| 状态     | zustand                                                        |
| 国际化   | i18next + react-i18next(主进程与渲染层共用一套语言包)          |
| 数据     | **SQLite**(Electron 内置 `node:sqlite`,零原生依赖)             |
| 语言     | TypeScript 5(双 tsconfig:main + web)                           |
| 质量     | ESLint + Prettier + husky / lint-staged(pre-commit 自动格式化) |

---

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org) **20+**
- [pnpm](https://pnpm.io) 包管理器
- 平台：Windows(首选)/ macOS / Linux

### 安装与运行

```bash
# 安装依赖
pnpm install

# 开发(热更新启动应用)
pnpm dev
```

### 常用脚本

| 命令                           | 说明                                    |
| ------------------------------ | --------------------------------------- |
| `pnpm dev`                     | 开发模式,启动 Electron 并热更新         |
| `pnpm start`                   | 预览已构建产物(`electron-vite preview`) |
| `pnpm build`                   | 构建到 `out/`                           |
| `pnpm typecheck`               | main + web 双 tsconfig 类型检查         |
| `pnpm lint` / `pnpm lint:fix`  | ESLint 检查 / 自动修复                  |
| `pnpm format`                  | Prettier 全量格式化                     |
| `python scripts/check-i18n.py` | 校验代码引用的 i18n key 与双语词条对齐  |

---

## 🗂️ 项目结构

```
src/
├─ main/              主进程
│  ├─ index.ts        窗口与生命周期(退出前杀掉全部任务进程树)
│  ├─ ipc.ts          全部 IPC handler 注册 + 项目信息富化(enrich)
│  ├─ db.ts           SQLite 数据层(唯一 DB 访问入口)
│  ├─ config.ts       扫描 / 应用 / AI 库设置读写
│  ├─ scanner.ts      目录扫描 + 单目录检查(inspect)
│  ├─ tasks.ts        进程管理器(spawn / 树杀 / 日志缓冲 / 事件推送)
│  ├─ git.ts          git 操作(父级仓库解析、信息、切分支、fetch)
│  ├─ nvm.ts          nvm 环境检测
│  ├─ terminal.ts     打开系统终端(wt → gitbash → cmd 回退)
│  ├─ editor.ts       代码编辑器探测与打开(VSCode 系 / Cursor 系)
│  ├─ browser.ts      打开浏览器(手填 URL > 运行日志探测 > 历史日志)
│  ├─ aiWriter.ts     AI 技能 / 简报落盘(哨兵区块合并)
│  ├─ backup.ts       备份 / 恢复 / 导入导出 / 自动备份调度
│  ├─ i18n.ts         主进程文案
│  └─ adapters/       项目类型适配器(可扩展核心,当前实现 Node.js)
├─ preload/index.ts   contextBridge API(通道白名单)
├─ shared/            全部共享类型 / API 接口 / 语言包
└─ renderer/src/      渲染层组件与状态
   ├─ store.ts        zustand 全局状态
   └─ components/     ProjectCard / LogDrawer / SettingsModal / ImportModal /
                      PackageJsonModal / ProjectSettingsModal / GroupModals / PreferencesModal
```

数据文件位于 `%APPDATA%/local-project-management/app.db`(macOS 为 `~/Library/Application Support/...`)。

---

## 🧩 核心设计

- **项目类型适配器**：进程管理、日志、git、分组等通用能力不感知项目类型,差异全部收敛在 `ProjectTypeAdapter` 接口(`detect / loadInfo / buildSpawn / resolveBrowserUrl`)。
- **数据持久化**：SQLite(settings / projects / runs / logs 四表),轻量列迁移用 `ensureColumn()` 自动补列。
- **进程安全**：Windows 停止任务必须杀进程树,用户主动停止按「已退出」而非「失败」记录。
- **可扩展语言**：语言包 `satisfies Dict` 强约束,缺 key 编译报错。

详见 [ARCHITECTURE.md](../ARCHITECTURE.md) 的完整设计说明。

---

## 🗺️ 路线图

- [ ] **Java / Python / Docker** 项目类型适配器(UI 已预留「即将支持」占位)
- [ ] nvm POSIX 版(shell 函数)支持
- [ ] 主进程错误消息跟随界面语言而非系统语言

---

## 📄 License

[MIT](LICENSE) © 2026 Yuban32
