# 本地项目管理/启动器 — 架构说明

Electron + Vite + React 的本地项目管理与启动工具。支持多项目类型（当前实现 Node.js）、扫描导入、脚本启动/停止、日志、浏览器打开、package.json 编辑、git 快速切换分支、分组与批量操作、nvm Node 版本、中英双语。

## 目录结构

```
src/
├─ main/              主进程
│  ├─ index.ts        窗口与生命周期（退出前杀掉全部任务进程树）
│  ├─ ipc.ts          全部 IPC handler 注册 + 项目信息富化（enrich）
│  ├─ db.ts           SQLite 数据层（唯一 DB 访问入口）
│  ├─ config.ts       扫描设置读写（settings 表）
│  ├─ scanner.ts      目录扫描 + 单目录检查（inspect）
│  ├─ tasks.ts        进程管理器（spawn/树杀/日志缓冲/事件推送/runs 落库）
│  ├─ git.ts          git 操作（父级仓库解析、信息、切分支）
│  ├─ nvm.ts          nvm 环境检测（nvm list 解析）
│  ├─ terminal.ts     打开系统终端（wt → cmd 回退）
│  ├─ editor.ts       代码编辑器探测与打开（VSCode 系 / Cursor 系）
│  ├─ browser.ts      打开浏览器（手填 URL > 运行日志探测 > 历史日志探测）
│  ├─ i18n.ts         主进程文案（错误消息）
│  └─ adapters/       ★ 项目类型适配器（可扩展核心）
│     ├─ types.ts     ProjectTypeAdapter 接口
│     ├─ index.ts     注册表 + 占位类型（java/python/docker）
│     └─ node.ts      Node 适配器
├─ preload/index.ts   contextBridge API（通道白名单，类型与 shared/api.ts 对齐）
├─ shared/
│  ├─ types.ts        全部共享类型
│  ├─ api.ts          渲染层可调用的 API 接口
│  └─ locales/        ★ 语言包（主进程与渲染层共用）
└─ renderer/src/
   ├─ i18n/index.ts   i18next 初始化（系统语言探测 + localStorage 记忆 + antd locale 映射）
   ├─ store.ts        zustand 全局状态（项目/任务/弹层/批量选择）
   ├─ toast.ts        antd message 实例桥（供非组件代码使用）
   └─ components/     ProjectCard / LogDrawer / SettingsModal / ImportModal /
                      PackageJsonModal / ProjectSettingsModal
```

## 核心设计

### 1. 项目类型适配器（新增项目类型的步骤）

通用能力（进程管理、日志、git、删除、分组）不感知项目类型，类型差异全部收敛在适配器接口里：

```ts
interface ProjectTypeAdapter {
  id: string
  label: string
  implemented: boolean
  detect(dir): Promise<boolean> // 类型自动识别
  loadInfo(dir): Promise<TypeInfo> // 脚本/包管理器等类型信息
  buildSpawn(project, scriptId): SpawnSpec // 产出执行命令
  resolveBrowserUrl?(logText): string | null // 日志 → 浏览器地址
}
```

接入 Java/Python 等类型：

1. 新建 `src/main/adapters/<type>.ts` 实现上述接口
2. 在 `adapters/index.ts` 的 `ADAPTERS` 注册，并从 `FUTURE_TYPES` 占位列表移除
3. `shared/locales/` 中如有类型相关文案补充（类型名来自 `label`，无需词条）

### 2. 数据持久化（SQLite）

Electron 内置 `node:sqlite`（零原生依赖；如需替换 better-sqlite3 只改 `db.ts`）。库文件：`%APPDATA%/local-project-management/app.db`。

| 表         | 用途                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings` | 扫描目录、下探深度等（JSON value）                                                                                                                  |
| `projects` | 项目列表：path/name/type + `group_name`（分组）+ `git_root`（手动 git 根）+ `type_config` JSON（类型专属：包管理器覆盖、常用脚本、浏览器地址、nvm） |
| `runs`     | 任务运行历史（每项目保留最近 50 次）                                                                                                                |
| `logs`     | 运行日志（每次运行保留末尾 2000 行，重启后可回看）                                                                                                  |

轻量列迁移：`db.ts` 内 `ensureColumn()`，缺列自动 `ALTER TABLE`。

### 3. 进程管理（Windows 关键点）

- `spawn(cmd, args, { shell: true })`：Windows 经 cmd 解析 `npm.cmd/pnpm.cmd`；nvm 项目命令为 `nvm use <版本> && <pm> run <脚本>`
- **停止必须杀进程树**：`taskkill /pid <pid> /T /F`（npm run 会派生子进程，只杀 shell 会残留 dev server）
- 用户主动停止标记 `stopping`：Windows 强杀退出码为 1，按「已退出」而非「失败」记录
- 退出应用前 `killAll()` 防残留
- 日志：内存环形缓冲（5000 行）+ 400ms 批量落库 + 批量 IPC 推送（`logs:append`/`task:status`）

### 4. git 与父级仓库

`git_root` 解析优先级（`git.ts: resolveGitRoot`）：

1. 手动指定路径（导入/项目设置里确认的父级仓库）
2. 自动：项目目录逐级向上找 `.git`（monorepo 子包命中父仓库）
3. `''` 表示用户显式禁用 git

分支切换、分支列表、脏工作区检测全部基于解析后的仓库根。

### 5. i18n（新增语言的步骤）

- 字典在 `src/shared/locales/`，**主进程与渲染层共用一套**；`zh-CN.ts` 是结构源，其他语言 `satisfies Dict`，缺 key 编译报错
- 渲染层：react-i18next，默认跟随系统语言（`navigator.language`），手动选择后记忆 localStorage（`launcher.lang`）；antd 组件文案经 `i18n/antdLocales` 联动
- 主进程：`main/i18n.ts` 的 `t()`，跟随 `app.getLocale()`，用于 IPC 错误消息
- 校验脚本：`python scripts/check-i18n.py`（检查代码引用 key 与双语条目对齐）

新增语言三步：

1. `src/shared/locales/<locale>.ts`：复制 en-US 结构翻译，`export default <dict> satisfies Dict`
2. `src/shared/locales/index.ts`：`LOCALES` 登记
3. `src/renderer/src/i18n/index.ts`：`antdLocales` 补一行 antd 对应 locale（若该语言 antd 支持）

### 6. 批量操作与分组

- 卡片标题左侧复选框批量选择；选中后顶部出现批量条（移除列表 / 移入回收站，均带确认）
- 首页按 `group_name` 分区渲染，未分组固定最后，分组可折叠

### 7. 终端配置

「打开终端」支持选择终端软件，偏好持久化在 settings 表（`terminal` 字段）：

| kind           | 命令                              | 探测                                                    |
| -------------- | --------------------------------- | ------------------------------------------------------- |
| `wt`           | `wt.exe -d <dir>`                 | `where wt.exe`                                          |
| `gitbash`      | `git-bash.exe --cd=<dir>`         | 常见安装路径 + `where git.exe` 推导安装根（支持便携版） |
| `cmd`          | `cmd /k cd /d <dir>`              | 系统自带                                                |
| `powershell`   | `powershell -NoExit Set-Location` | 系统自带                                                |
| `auto`（默认） | 依次回退 wt → gitbash → cmd       | —                                                       |

顶栏终端选择器展示可用性（未检测到的项禁用）；卡片「⋯ → 打开终端」按偏好打开，显式指定的终端缺失时报错提示。注意 spawn 不可加 `windowsHide`（会以 SW_HIDE 创建窗口导致"无效"）。

### 8. 编辑器配置

「用编辑器打开」使用代码编辑器，手动配置持久化在 settings 表 'app' key 的 JSON（`editorPath` 字段，无独立列）。探测范围 = VSCode 系（VS Code / Insiders / VSCodium）+ Cursor 系（`editor.ts` 的 `EDITOR_DEFS` 注册表驱动）：

| kind        | win（exe）                                                              | mac                              | linux                  |
| ----------- | ----------------------------------------------------------------------- | -------------------------------- | ---------------------- |
| `vscode`    | `%LOCALAPPDATA%\Programs` / `ProgramFiles` / `ProgramFiles(x86)` 下 `Microsoft VS Code\Code.exe` + `where code` shim 推导 | app 内 `Resources/app/bin/code` | `/usr/bin/code` 等     |
| `cursor`    | 同上，`cursor\Cursor.exe` + `where cursor`                              | 同上 `bin/cursor`                | `/usr/bin/cursor`      |
| `vscodium`  | 同上，`VSCodium\VSCodium.exe` + `where codium`                          | 同上 `bin/codium`                | `/usr/bin/codium`      |
| `insiders`  | 同上，`Microsoft VS Code Insiders\Code - Insiders.exe` + `where code-insiders` | 同上 `bin/code-insiders`         | `/usr/bin/code-insiders` |

解析优先级与 git 一致：手动 `editorPath`（存在才用）> 候选首个（按 `vscode → cursor → vscodium → insiders` 顺序）；解析结果按手动值缓存，避免重复 `where` 查询。常规路径与 shim 推导可能命中同一 exe，候选按小写路径去重。

- `--version` 仅对 VSCode 系 basename 白名单执行；win 上以 `ELECTRON_RUN_AS_NODE=1` 调 GUI exe 跑安装内 `resources/app/out/cli.js`（GUI exe 直接 `--version` 无 stdout，此即官方 `bin/code.cmd` 的实现；cli.js 兼容标准布局与重定向布局），mac/linux 探测路径本身即 CLI 脚本直接执行。任意手动 exe 只做存在性校验，避免给 GUI 程序传 `--version` 产生弹窗副作用
- 打开目录：win 上经 `cmd /d /c start "" "exe" "dir"` 转发拉起——系统策略可能拦截 Electron 直接 CreateProcess 启动编辑器 exe（报 spawn EACCES，系统 node 同样被拦），cmd 的 ShellExecute 链路可正常拉起；mac/linux 直接 `spawn(exe, [dir])`（数组参数无 shell，路径含空格安全）。spawn 窗口化 GUI 进程不可加 `windowsHide`（同终端的坑；cmd 载体的 windowsHide 不影响 ShellExecute 显示编辑器窗口）
- 设置中心「通用」页的编辑器区复用 Git 配置的交互模式（自动/手动 Radio + 校验后落库 + 候选点击应用）；卡片入口在「⋯ → 用编辑器打开」，未检测到时报错引导去设置

## 安全模型

- `contextIsolation: true`，`nodeIntegration: false`；preload 仅暴露白名单通道
- 无通用 `invoke` 转发；渲染层无任何 Node/Electron 直访面

## 开发

```bash
pnpm dev          # 开发
pnpm build        # 构建（out/）
pnpm typecheck    # main + web 双 TS 检查
pnpm lint         # ESLint
pnpm format       # Prettier
```

pre-commit 钩子（husky + lint-staged）对暂存文件执行 `prettier --write` + `eslint --fix`，保证入库代码已格式化。

## 已知边界

- nvm 切换基于 nvm-windows 的全局版本符号链接，**并发运行不同 Node 版本的任务会互相影响**（nvm 机制本身限制）
- nvm POSIX 版（shell 函数）暂未支持
- 主进程错误消息语言跟随系统语言，不随渲染层手动切换（可按需扩展为 settings 驱动）
- 扫描不会深入含 package.json 的目录（monorepo 子包请手动添加，或对仓库根扫描后按需导入子目录）
