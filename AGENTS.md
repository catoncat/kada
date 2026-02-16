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
- [docs/engineering/agent-mentions.md](docs/engineering/agent-mentions.md)：Agent `@` 资源引用实现说明（前端交互、快捷键、后端降级与上下文注入）

## 项目结构速览

- `src/`：React + TypeScript 前端（TanStack Router 文件路由在 `src/routes/`）
- `sidecar/`：Node.js Sidecar（Hono + Drizzle + SQLite）
- `src-tauri/`：Tauri 2 Rust 壳与打包配置
- `public/`：静态资源

## 关键约定（摘要）

- 不要手改生成/产物：`dist/`、`sidecar/dist/`、`src/routeTree.gen.ts`、`.tanstack/`、`src-tauri/target/`
- 默认端口：前端 `1420`（`strictPort`），Sidecar `3001`
- 不要提交密钥/Provider 凭据；避免在日志中输出敏感信息（详见 `docs/dev/contributing.md`）
- 前端开发默认优先复用 `src/components/ui/` 组件（详见 `docs/dev/frontend.md`）
