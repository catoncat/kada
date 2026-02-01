# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

拍摄预案助手 v2 - 基于 Tauri 2.0 的桌面应用，集成 AI 能力辅助拍摄计划制作。

## 常用命令

```bash
# 安装依赖
pnpm install                    # 前端依赖
cd sidecar && pnpm install      # Sidecar 依赖

# 开发模式
pnpm dev:all                    # 同时启动前端和 Sidecar（推荐）
pnpm dev                        # 仅前端 (http://localhost:1420)
pnpm dev:sidecar                # 仅 Sidecar (http://localhost:3001)

# Tauri 开发
pnpm tauri:dev                  # 启动 Tauri 桌面应用

# 构建
pnpm tauri:build                # 构建 Sidecar 并打包 Tauri 应用

# 数据库（在 sidecar 目录下执行）
cd sidecar
pnpm db:generate                # 生成 Drizzle 迁移
pnpm db:migrate                 # 执行迁移
pnpm db:studio                  # 打开 Drizzle Studio
```

## 架构

### 三层架构

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

- **前端 (`src/`)**: React 19 + TanStack Router + Tailwind CSS 4
- **Sidecar (`sidecar/`)**: Hono.js 服务器 + SQLite + Drizzle ORM
- **桌面外壳 (`src-tauri/`)**: Tauri 2.0 Rust 核心

### 前端结构

- `src/routes/` - TanStack Router 文件路由（自动代码分割）
- `src/components/ui/` - 基于 @base-ui/react 的 UI 组件库（类 shadcn 风格）
- `src/components/` - 业务组件
- `src/lib/` - 工具函数，`@/lib/utils` 导出 `cn()` 用于类名合并

### Sidecar 结构

- `sidecar/src/routes/` - Hono API 路由
- `sidecar/src/db/schema.ts` - Drizzle 数据库 schema（providers, plans, settings 三表）
- `sidecar/src/db/index.ts` - 数据库连接

### 通信方式

开发时前端通过 Vite proxy 转发 `/api/*` 到 Sidecar；生产环境 Sidecar 打包为二进制由 Tauri 管理。

## 技术栈要点

| 组件 | 技术 |
|------|------|
| 包管理 | pnpm |
| 前端框架 | React 19 |
| 路由 | TanStack Router（文件路由） |
| 样式 | Tailwind CSS 4 |
| UI 基础 | @base-ui/react + class-variance-authority |
| 图标 | lucide-react |
| 动画 | framer-motion |
| 后端框架 | Hono.js |
| ORM | Drizzle ORM |
| 数据库 | better-sqlite3 |
| 桌面 | Tauri 2.0 |
| PPT 导出 | pptxgenjs |

## 路径别名

- `@/*` → `./src/*`（tsconfig 和 vite 均配置）

## 数据模型

三个核心表：
- `providers` - AI 服务提供商配置（API key、模型等）
- `plans` - 拍摄计划（data 字段存储 JSON）
- `settings` - 键值设置

## API 端点

- `/health` - 健康检查
- `/api/providers` - Provider CRUD
- `/api/plans` - 计划管理
- `/api/ai/models` - 获取模型列表
- `/api/ai/generate` - AI 文本生成
- `/api/ai/generate-image` - AI 图片生成
- `/api/ai/test` - API 连接测试

## 开发注意

- 前端开发服务器端口固定为 1420（`strictPort: true`）
- Sidecar 端口为 3001
- CSP 配置允许连接 googleapis.com、openai.com、openrouter.ai
