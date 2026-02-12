# Repository Guidelines

本文件作为仓库协作与 Agent 的**入口索引**。更具体的规则、架构说明与命令清单放在 `agent_docs/` 中（按需阅读）。

## Quick Start

```bash
pnpm install
cd sidecar && pnpm install
pnpm dev:all     # 前端 :1420 + Sidecar :3001（推荐）
pnpm tauri:dev   # 需要桌面壳联调时使用
```

## 文档索引（详细说明）

- [agent_docs/commands.md](agent_docs/commands.md)：开发/构建/DB 常用命令
- [agent_docs/architecture.md](agent_docs/architecture.md)：三层架构、端口、通信与打包方式
- [agent_docs/frontend.md](agent_docs/frontend.md)：前端目录结构、路由、UI/样式约定（含组件使用约定）
- [agent_docs/sidecar.md](agent_docs/sidecar.md)：Sidecar 结构、API、数据库与迁移
- [agent_docs/contributing.md](agent_docs/contributing.md)：代码风格、验证/测试、提交与 PR、安全注意事项
- [docs/README.md](docs/README.md)：产品与重构文档索引（面向功能/流程/重构规划）
- [agent_docs/skills.md](agent_docs/skills.md)：UX「先设计后编码」skills 与完整流程（输出到 `docs/specs/`，skills 位于 `.claude/skills/`）

## 项目结构速览

- `src/`：React + TypeScript 前端（TanStack Router 文件路由在 `src/routes/`）
- `sidecar/`：Node.js Sidecar（Hono + Drizzle + SQLite）
- `src-tauri/`：Tauri 2 Rust 壳与打包配置
- `public/`：静态资源

## 关键约定（摘要）

- 不要手改生成/产物：`dist/`、`sidecar/dist/`、`src/routeTree.gen.ts`、`.tanstack/`、`src-tauri/target/`
- 默认端口：前端 `1420`（`strictPort`），Sidecar `3001`
- 不要提交密钥/Provider 凭据；避免在日志中输出敏感信息（详见 `agent_docs/contributing.md`）
- 前端开发默认优先复用 `src/components/ui/` 组件（详见 `agent_docs/frontend.md`）
