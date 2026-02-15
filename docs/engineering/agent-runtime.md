# Agent Runtime（照片与文案）

## 1. 目标与边界

本模块以 `pi-agent` 体系为核心，在 Sidecar 内提供可流式、可回放、可审计的 Agent 运行时，面向两类产物：

- `photo`：照片任务（通过任务队列与 worker 产出）
- `copy`：文案结果（结构化文本）

明确不做：

- 不接入 `pi-web-ui` 组件
- 不在首期接入 MCP 生态
- 不改动上游 npm 包核心源码（围绕 extension + skills 展开）

## 2. 代码结构

### 2.1 Sidecar Runtime

- 路由入口：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/routes/agent.ts`
- 运行时抽象：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/agent/runtime/agent-runtime.ts`
- 运行时路由器：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/agent/runtime/runtime-router.ts`
- 主引擎：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/agent/runtime/coding-agent-runtime.ts`
- 回退引擎：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/agent/runtime/agent-core-runtime.ts`

### 2.2 Tools 与 Skills

- 资源工具：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/agent/extensions/resource-extension.ts`
- 生图/文案工具：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/agent/extensions/photo-copy-extension.ts`
- 工具桥接：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/agent/extensions/tool-definitions.ts`
- Skills 目录：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/agent/skills/`

### 2.3 存储层

- Session/Entry/Output：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/services/agent-session-store.ts`
- Event Store：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/services/agent-event-store.ts`
- DB Schema：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/db/schema.ts`
- 迁移：`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/drizzle/0004_agent_runtime.sql`

## 3. 双引擎策略

### 3.1 会话创建时固定引擎

`POST /api/agent/sessions` 支持 `engine`：

- `coding-agent`（默认）
- `agent-core`（手动指定）

会话创建后引擎不在生命周期中途切换。

### 3.2 fallback 机制

在 `RuntimeRouter.ensureRuntime()` 内：

1. 优先创建 `coding-agent` runtime
2. 若初始化失败，自动 fallback 到 `agent-core`

仅在 runtime 初始化阶段发生 fallback，不会在同一会话中间热切换。

## 3.3 系统提示词一致性（两引擎同源）

目标：保证 `coding-agent` 与 `agent-core` 的行为一致，不因引擎差异出现“有时走工具、有时只输出文本”。

系统提示词需要稳定覆盖以下硬规则：

1. 用户明确要求生图时，必须走工具链：
   `photo_compose_prompt -> photo_enqueue_generation -> photo_get_generation_status`
2. 用户要求文案时，优先调用：
   `copy_generate_variants` 或 `copy_rewrite_by_tone`
3. 缺资源上下文时优先调用资源工具：
   `resource_search_scenes` / `resource_search_models` / `resource_get_project_context`
4. 输出保持中文，并显式给出可追踪 ID（`taskId`、`artifactId`）
5. 失败时必须说明状态与原因，禁止“伪完成”

维护要求：

- 修改提示词必须同步更新：
  - `sidecar/src/agent/runtime/coding-agent-runtime.ts`
  - `sidecar/src/agent/runtime/agent-core-runtime.ts`
- 改动后至少验证一次 tool call 触发（见第 11 节调试）

## 4. Agent API（已实现）

路由统一前缀：`/api/agent`

- `POST /sessions`
- `GET /sessions`
- `GET /sessions/:id`
- `POST /sessions/:id/turn`（SSE）
- `POST /sessions/:id/steer`
- `POST /sessions/:id/follow-up`
- `POST /sessions/:id/abort`
- `GET /sessions/:id/events?cursor=...&limit=...`
- `GET /sessions/:id/outputs?kind=photo|copy`

## 5. 事件协议（SSE）

标准事件定义在：

`/Users/envvar/Gao/projects/shooting-planner-v2/sidecar/src/agent/runtime/agent-runtime.ts`

事件类型：

- `turn.started`
- `assistant.delta`
- `assistant.completed`
- `tool.call`
- `tool.progress`
- `tool.result`
- `photo.task.created`
- `photo.task.updated`
- `photo.ready`
- `copy.ready`
- `queue.updated`
- `turn.completed`
- `turn.failed`
- `session.aborted`

写入策略：

- 每个事件都落库到 `agent_events`
- 每个会话内 `seq` 单调递增（可断线续播）
- `assistant.completed` 会写入 `agent_entries`
- `tool.result` 会写入 `agent_entries`
- `photo.ready` / `copy.ready` 会写入 `agent_outputs`

## 6. 数据模型

### 6.1 `agent_sessions`

- `id`, `title`, `engine`, `status`, `provider_id`
- `created_at`, `updated_at`, `last_turn_at`

### 6.2 `agent_entries`

- `id`, `session_id`, `entry_type`, `parent_entry_id`, `payload_json`, `created_at`
- 用于回放 user/assistant/toolResult 链路

### 6.3 `agent_events`

- `id`, `session_id`, `turn_id`, `seq`, `event_type`, `payload_json`, `created_at`
- 用于 SSE cursor 续播与诊断

### 6.4 `agent_outputs`

- `id`, `session_id`, `turn_id`, `kind`, `ref_id`, `content_json`, `created_at`
- `photo` 通过 `ref_id` 关联 artifact
- `copy` 直接落结构化内容

## 7. 工具命名约束（重要）

OpenAI 兼容工具名需匹配：`^[a-zA-Z0-9_-]+$`。

因此本项目统一使用下划线命名，禁止点号命名：

- `resource_search_scenes`
- `resource_search_models`
- `resource_get_project_context`
- `photo_compose_prompt`
- `photo_enqueue_generation`
- `photo_get_generation_status`
- `copy_generate_variants`
- `copy_rewrite_by_tone`

## 8. 出图与文案能力分层

### 8.1 文案

- 工具：`copy_generate_variants` / `copy_rewrite_by_tone`
- 调用路径：Agent Tool -> `generateText()` -> provider 文本接口

### 8.2 图片

- 工具：`photo_compose_prompt` / `photo_enqueue_generation` / `photo_get_generation_status`
- 调用路径：Agent Tool -> `tasks` -> worker `image-generation` -> `generation_artifacts`

图片不直接在 Agent 内返回二进制，统一通过任务与产物链路落盘和追踪。

## 9. Provider 路由策略（简化版）

### 9.1 核心原则

1. 文本 provider 与图片 provider 可分离
2. 图片路由采用“能力优先 + best-effort 回退”
3. 能力探测结果用于“建议路由”，不作为唯一阻断条件

### 9.2 出图 provider 选择（Agent 侧）

当 `photo_enqueue_generation` 未显式传 `providerId` 时，优先级：

1. `agent.image_provider_with_refs_id`（仅有参考图时）
2. `agent.image_provider_id`
3. 自动评分选择候选 provider

### 9.3 worker 执行路由（模型调用侧）

1. 先根据 capability 选主路由（`chat` 或 `images`）
2. 主路由失败后自动尝试次路由
3. 聚合失败原因（例如：`chat: ... | images: ...`）返回上层

### 9.4 相关设置键

- `agent.image_provider_id`
- `agent.image_provider_with_refs_id`

## 10. 与前端关系

`/workspace` 已替换为 Agent Shell，核心文件：

- `/Users/envvar/Gao/projects/shooting-planner-v2/src/routes/workspace.tsx`
- `/Users/envvar/Gao/projects/shooting-planner-v2/src/components/agent/*`
- `/Users/envvar/Gao/projects/shooting-planner-v2/src/hooks/useAgentTurnStream.ts`

前端渲染遵循：

- 主消息流 + 工具时间线 + 右侧产物栏（photo/copy）
- 断线后优先走 events cursor 增量补齐

## 11. 调试与验收（最小手册）

### 11.1 一次完整排查流程

1. 建立会话并触发 turn，抓 SSE 事件
2. 检查是否出现 `tool.call` / `tool.result`
3. 用 `agent:trace` 回放会话
4. 对照 `tasks` 与 `generation_artifacts` 查真实状态
5. 若为 provider 问题，检查 `capabilities` 与路由结果

### 11.2 常用命令

工具调用探针（验证模型是否触发工具）：

```bash
pnpm -C sidecar exec tsx scripts/probe-auto-toolcall.ts
```

会话回放：

```bash
pnpm -C sidecar agent:trace <sessionId>
```

直接查任务状态（在 `sidecar` 目录执行）：

```bash
node -e "const Database=require('better-sqlite3');const db=new Database('data/shooting-planner.db');console.log(db.prepare('select id,status,error,output from tasks where id=?').get('<taskId>'));"
```

### 11.3 最小验收标准

1. 生图请求可观测到三段工具链（compose/enqueue/status）
2. 文案请求可观测到文案工具调用
3. 失败时返回可定位错误，不出现“伪完成”
