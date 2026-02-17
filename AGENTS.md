# Repository Guidelines

本文件作为仓库协作与 Agent 的**入口索引**。文档已统一到 `docs/`，其中开发协作文档位于 `docs/dev/`。

## Quick Start

```bash
pnpm install
cd sidecar && pnpm install
pnpm dev:all     # 前端 :1420 + Sidecar :3001（推荐）
pnpm tauri:dev   # 需要桌面壳联调时使用
```

## 文档索引（详细说明）

- [docs/README.md](docs/README.md)：统一文档总索引（产品 / 工程 / 开发 / ADR / Specs）
- [docs/dev/commands.md](docs/dev/commands.md)：开发/构建/DB 常用命令
- [docs/dev/architecture.md](docs/dev/architecture.md)：三层架构、端口、通信与打包方式
- [docs/dev/frontend.md](docs/dev/frontend.md)：前端目录结构、路由、UI/样式约定（含组件使用约定）
- [docs/dev/macos-hig-reference.md](docs/dev/macos-hig-reference.md)：macOS HIG 设计规范速查（排版、控件尺寸、圆角、间距、表单布局）
- [docs/dev/sidecar.md](docs/dev/sidecar.md)：Sidecar 结构、API、数据库与迁移
- [docs/dev/contributing.md](docs/dev/contributing.md)：代码风格、验证/测试、提交与 PR、安全注意事项
- [docs/dev/skills.md](docs/dev/skills.md)：UX「先设计后编码」skills 与完整流程（输出到 `docs/specs/`，skills 位于 `.claude/skills/`）
- [docs/dev/upstream-pi-mono.md](docs/dev/upstream-pi-mono.md)：`pi-mono` 本地参考基线、同步命令与对齐范围
- [docs/engineering/agent-mentions.md](docs/engineering/agent-mentions.md)：Agent `@` 资源引用实现说明（前端交互、快捷键、后端降级与上下文注入）

## 项目结构速览

- `src/`：React + TypeScript 前端（TanStack Router 文件路由在 `src/routes/`）
- `sidecar/`：Node.js Sidecar（Hono + Drizzle + SQLite）
- `src-tauri/`：Tauri 2 Rust 壳与打包配置
- `public/`：静态资源

## 关键约定（摘要）

- 不要手改生成/产物：`dist/`、`sidecar/dist/`、`src/routeTree.gen.ts`、`.tanstack/`、`src-tauri/target/`
- 默认端口：前端 `1420`（`strictPort`），Sidecar `3001`
- Python 脚本统一优先使用 `uv run`（按需用 `--with` 注入依赖），避免全局 Python 依赖缺失导致命令失败
- 不要提交密钥/Provider 凭据；避免在日志中输出敏感信息（详见 `docs/dev/contributing.md`）
- 前端开发默认优先复用 `src/components/ui/` 组件（详见 `docs/dev/frontend.md`）
- 涉及 Agent 运行时/事件/toolResult 交互的改动，先对齐本地上游参考 `.upstream/pi-mono`（详见 `docs/dev/upstream-pi-mono.md`）

## Agent 研发参考源优先级（强制）

适用范围：Agent runtime / tool 调用 / toolResult 展示 / skills / extensions / 提示词编排。

1. 第一优先：先检索 Pi 社区现成实现（`https://pi.dev/packages`），优先复用已存在 package/extension/skill。
2. 第二优先：本地上游基线 `.upstream/pi-mono`（必要时对照远端 `https://github.com/badlogic/pi-mono`）确认官方实现方式。
3. 第三优先：业界顶级开源方案对标（必须覆盖以下来源）  
   - Codex: `https://github.com/openai/codex`  
   - Claude Code: `https://github.com/anthropics/claude-code`  
   - OpenCode: `https://github.com/opencode-ai/opencode`
4. 默认策略：能复用就不重复造轮子；只有在上述来源都不满足时，才做本仓自定义实现，并写明偏离理由。

## Agent 交互开发流程（强制）

适用范围：聊天区、toolResult、流式过程区、折叠/展开、TUI/Web 交互行为。

1. 先查本地上游实现，不允许先拍脑袋设计：  
   `rg -n "关键词" .upstream/pi-mono/packages/tui .upstream/pi-mono/packages/web-ui .upstream/pi-mono/packages/coding-agent`
2. 输出方案时必须给出上游对照点（至少 2 个文件路径或模块名）。
3. 若本仓实现偏离上游，必须先写偏离理由（约束/产品目标/兼容要求），再实施。
4. 未完成上游对照前，不进入“UI 定稿”或“大段实现代码”阶段。
