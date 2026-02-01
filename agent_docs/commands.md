# 常用命令（前端 / Sidecar / Tauri）

## 前置要求

- Node.js 22+
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
