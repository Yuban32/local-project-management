# AGENTS.md — 本地项目管理/启动器

Electron + React 的本地项目管理/启动器（Windows 优先，兼容 macOS/Linux）。详细架构见 **ARCHITECTURE.md**（适配器扩展、i18n 新增语言、终端配置等均以它为准），本文件只列未来代理容易踩坑的项目特定事实。

## 常用命令

```bash
pnpm dev                      # 开发（electron-vite）
pnpm build                    # 构建 → out/
pnpm typecheck                # main + web 双 tsconfig 检查
pnpm lint                     # ESLint（pre-commit 经 lint-staged 自动 format+fix）
python scripts/check-i18n.py  # 校验 t('key') 引用与双语词条对齐
```

无测试框架；验证手段 = typecheck + lint + build + `pnpm dev` 冒烟（渲染层 console 需 `ELECTRON_ENABLE_LOGGING=1` 才进终端）。

## 改动链路（新增功能必走全链）

`shared/types.ts`（类型）→ `shared/api.ts`（API 接口）→ `main/ipc.ts`（handler 白名单）→ `preload/index.ts`（contextBridge 映射）→ `renderer/src/store.ts`（zustand 动作）→ 组件。漏任何一环会导致渲染层调用不到或类型报错。

- **`main/db.ts` 是唯一 DB 访问入口**（Electron 内置 `node:sqlite`，零原生依赖）；轻量列迁移用 `ensureColumn()`
- **渲染层无 Node/Electron 直访面**：不要在组件里绕过 store 直接 `ipcRenderer`；所有写操作走 store 动作 → IPC → `refresh()`，子组件不自行刷新
- 弹层开关统一收在 store（`xxxOpen` / `openXxx` / `closeXxx`），弹窗组件常驻挂载在 `App.tsx` 根部
- 主进程报错用 `t('main.*')`（经 IPC 抛给渲染层 toast），语言跟随设置中心选择

## 编码约定

- 注释、提交信息、UI 文案全部中文；每个用户可见文案必须同时补 `shared/locales/zh-CN.ts` 和 `en-US.ts`（`en-US` 受 `satisfies Dict` 约束，缺 key 编译失败），跑 `check-i18n.py` 自检
- antd 5 暗色主题（ConfigProvider darkAlgorithm）；非组件代码弹 toast 用 `renderer/src/toast.ts` 的 `toast` 桥
- zustand 选择器返回**新数组/新对象时必须 `useShallow`**，否则无限重渲染（见 ProjectCard.tsx 注释）
- git 提交信息格式：`feat: xxx` / `fix: xxx` / `docs: xxx`（中文描述）

## 平台与运行时坑

- **`node:sqlite` 只存在于 Electron 内置的 Node 22**；系统 Node 20 跑不了含 `node:sqlite` 的脚本。独立验证 DB 逻辑用：
  `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe <script.js>`
- **spawn 终端窗口绝不可加 `windowsHide`**（进程带 SW_HIDE 创建，窗口不可见）；隐藏执行的后台命令（git 等）才用 `windowsHide: true`
- 停止任务必须杀进程树（`taskkill /pid <pid> /T /F`），只杀 shell 会残留 dev server；应用退出前 `taskManager.killAll()`
- git 命令一律经 `git.ts` 的 `resolveGitExe()`（手动配置 > PATH > 常规安装路径），不要直接 `spawn('git')`
- 替换数据库（备份恢复/导入）流程固定：停止全部任务 → `closeDb()` → 覆盖 `app.db`（删 `-wal/-shm`）→ 重新 `initDb()` → 渲染层 `refresh()`
- 项目 id = 项目路径小写化后 sha1 前 16 位（路径即身份，同路径重复导入是更新不是新增）
- 分组 = `projects.group_name` 字符串 + `groups` 表登记，二者并集展示；重命名/删除的级联逻辑收在 `db.ts`（`renameGroup`/`deleteGroup`），不要在渲染层循环改项目

## 已知环境问题

远程/无头会话下 Electron 窗口可能黑屏（GPU 合成不呈现），**截图黑 ≠ 渲染失败**：基线版本同样黑屏。判断渲染是否正常看 `ELECTRON_ENABLE_LOGGING=1` 的 console 输出（React DevTools 提示 = 已挂载）。最终视觉验证需用户本机进行。

## 文档指引

改动以下区域前先读 ARCHITECTURE.md 对应章节：新增项目类型（§1 适配器）、新增语言（§5）、终端/备份/设置中心（§7 及 settings 表）。`out/` 为构建产物不要手改。
