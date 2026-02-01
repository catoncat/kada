# Sidecar（Node.js 后端）指南

Sidecar 是桌面应用的本地服务层，负责数据持久化、Provider 配置管理与 AI 调用的统一入口。

## 目录结构

- 入口：`sidecar/src/index.ts`
- 路由：`sidecar/src/routes/`
- 数据库：
  - `sidecar/src/db/schema.ts`（Drizzle schema）
  - `sidecar/src/db/index.ts`（连接与初始化）
- 本地数据：`sidecar/data/`（SQLite 文件；已在 `.gitignore` 忽略）

## 数据模型（核心表）

- `providers`：AI 服务提供商配置（如 API Key、模型等）
- `plans`：拍摄计划（通常以 JSON 形式存储在 `data` 字段）
- `settings`：键值设置

## API 端点（摘要）

- `GET /health`：健康检查
- `/api/providers`：Provider CRUD
- `/api/plans`：计划管理
- `/api/ai/models`：获取模型列表
- `/api/ai/generate`：文本生成
- `/api/ai/generate-image`：图片生成
- `/api/ai/test`：连接/鉴权测试

## 数据库迁移（Drizzle）

在 `sidecar/` 目录下运行：

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

提交包含迁移的改动时：PR 里需要写清楚「是否需要执行迁移」以及迁移对已有数据的影响。
