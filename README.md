# 拍摄预案助手 v2

基于 Tauri 2.0 + Sidecar Node.js 的桌面应用。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2.0 |
| 前端 | React + TanStack Router + Vite + Tailwind CSS |
| 后端 | Hono.js (Node.js Sidecar) |
| 数据库 | SQLite + Drizzle ORM |

## 项目结构

```
shooting-planner-v2/
├── src/                      # 前端代码
│   ├── routes/               # TanStack Router 文件路由
│   ├── components/           # React 组件
│   └── lib/                  # 工具函数
├── src-tauri/                # Tauri 核心
│   ├── src/                  # Rust 代码
│   ├── binaries/             # Sidecar 二进制文件
│   └── tauri.conf.json       # Tauri 配置
├── sidecar/                  # Node.js 后端
│   ├── src/
│   │   ├── index.ts          # 入口
│   │   ├── routes/           # Hono API 路由
│   │   ├── db/               # Drizzle ORM
│   │   └── services/         # 业务服务
│   └── package.json
└── package.json
```

## 开发

### 前置要求

- Node.js 22+
- pnpm 9+
- Rust (for Tauri)

### 安装依赖

```bash
# 前端依赖
pnpm install

# Sidecar 依赖
cd sidecar && pnpm install
```

### 开发模式

```bash
# 同时启动前端和 Sidecar
pnpm dev:all

# 或分别启动
pnpm dev           # 前端 (http://localhost:1420)
pnpm dev:sidecar   # Sidecar (http://localhost:3001)
```

### Tauri 开发

```bash
pnpm tauri:dev
```

### 构建

```bash
# 构建 Sidecar 并打包 Tauri 应用
pnpm tauri:build
```

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /health | 健康检查 |
| GET | /api/providers | 获取所有 Provider |
| POST | /api/providers | 创建 Provider |
| PUT | /api/providers/:id | 更新 Provider |
| DELETE | /api/providers/:id | 删除 Provider |
| GET | /api/plans | 获取所有计划 |
| POST | /api/plans | 创建计划 |
| POST | /api/ai/models | 获取模型列表 |
| POST | /api/ai/generate | 生成文本 |
| POST | /api/ai/generate-image | 生成图片 |
| POST | /api/ai/test | 测试 API 连接 |
