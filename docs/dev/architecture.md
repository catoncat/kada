# 架构概览

## 项目概述

拍摄预案助手 v2：基于 **Tauri 2** 的桌面应用，集成 AI 能力辅助拍摄计划制作。

## 技术栈（摘要）

- 前端：React 19 + TypeScript + Vite + TanStack Router + TanStack Query + Tailwind CSS 4
- UI/交互：@base-ui/react、class-variance-authority、lucide-react、framer-motion
- Sidecar：Hono + Drizzle ORM + SQLite（better-sqlite3）
- 桌面：Tauri 2（Rust）
- 导出：pptxgenjs
- 工程化：Biome (lint/format) + Vitest (测试)

## 三层结构

```
┌─────────────────────────────────────────────────────┐
│                    Tauri Shell                       │
│  ┌──────────────────┐    ┌────────────────────────┐ │
│  │   React 前端      │◄──►│   Node.js Sidecar      │ │
│  │  (Vite + TS)     │    │   (Hono + Drizzle)     │ │
│  │   :1420          │    │   :3001                │ │
│  └──────────────────┘    └────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

- **前端**：`src/`（React 19 + TanStack Router + Tailwind CSS 4）
- **Sidecar**：`sidecar/`（Hono API + SQLite + Drizzle ORM）
- **桌面壳**：`src-tauri/`（Rust 核心、权限/CSP、打包配置）

## 通信与运行方式

- 开发环境：前端通过 Vite proxy 将 `/api/*` 转发到 Sidecar（便于本地联调）。
- 生产环境：Sidecar 会被构建为二进制/产物并由 Tauri 管理启动（相关配置与产物位于 `src-tauri/`）。

## 端口与安全配置

- 前端开发端口固定为 `1420`（严格占用端口，避免自动漂移）。
- Sidecar 默认端口为 `3001`。
- CSP/网络访问需与实际调用的 Provider 域名匹配；当前配置允许连接 `googleapis.com`、`openai.com`、`openrouter.ai`。
- 新增外部依赖域名/Provider 时，记得同步更新 Tauri 配置并在 PR 中说明。

## 数据持久化

所有数据统一存储在 Sidecar 的 SQLite 数据库中：

- **providers**：API 提供商配置（API key、endpoint、模型等）
- **plans**：预案历史记录（单预案和项目预案）
- **settings**：应用设置

前端通过 TanStack Query + API 客户端与 Sidecar 交互，不再使用 localStorage。
首次启动时会自动迁移旧 localStorage 数据到 SQLite（`src/lib/data-migration.ts`）。
