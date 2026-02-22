# 常用命令（前端 / Sidecar / Tauri）

## 前置要求

- Node.js `25.x`（建议 `25.0.0`，避免 `better-sqlite3` ABI 漂移）
- pnpm 9+
- Rust toolchain（仅在运行/打包 Tauri 时需要）

## 安装依赖

```bash
pnpm install
cd sidecar && pnpm install
```

## 本地开发

```bash
pnpm dev          # 仅前端（Vite，http://localhost:1420）
pnpm dev:sidecar  # 仅 Sidecar（http://localhost:3001）
pnpm dev:all      # 同时启动两者（推荐）
```

## BDD（Chat-First 行为场景）

```bash
pnpm exec playwright install chromium  # 首次运行前安装浏览器
pnpm bdd:export   # 导出可用步骤词典（给 AI 生成场景用）
pnpm bdd:gen      # 从 .feature 生成 Playwright 测试
pnpm bdd:smoke    # 仅运行 @smoke 场景
pnpm bdd:test     # 运行全部 BDD 场景
pnpm bdd:report   # 打开 Playwright HTML 报告
```

说明：`bdd:test` 会自动启动 `pnpm dev:all`，并使用隔离的 `DATA_DIR=.tmp/bdd-data`。

## 构建与预览

```bash
pnpm build        # tsc typecheck + vite build
pnpm preview      # 预览构建产物
```

## Tauri（桌面壳）

```bash
pnpm tauri:dev    # 启动桌面应用（联调/权限/CSP 等问题优先用它验证）
pnpm tauri:build  # 先构建 sidecar，再打包 Tauri 应用
```

## Sidecar（在 `sidecar/` 下执行）

```bash
pnpm dev          # tsx watch src/index.ts
pnpm build        # 构建（打包/产物输出到 dist，供 Tauri 使用）
pnpm start        # 运行 dist/index.js
```

### 数据库（Drizzle）

```bash
pnpm db:generate  # 生成迁移
pnpm db:migrate   # 执行迁移
pnpm db:studio    # 打开 Drizzle Studio
```
