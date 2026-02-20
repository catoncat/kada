# Agent 上游差异收敛实施进度（执行跟踪）

更新时间：`2026-02-20`
关联主文档：`docs/dev/agent-upstream-gap.md`
关联偏离/SLA 文档：`docs/dev/agent-upstream-deviations.md`

## 当前状态

- 阶段：`P2`
- 结论：`已完成`
- 说明：`P0 + P1 + P2` 已全部完成；保留能力偏离说明、SLA、独立回归用例均已落地并通过验证。

## P0 完成项

| 事项 | 状态 | 结果 |
|---|---|---|
| `agent_entries.turn_id` 落地 | ✅ 完成 | `schema`、建表 SQL、补列逻辑、索引均已落地（仅新数据契约） |
| 移除 `agent_*` 历史兼容补列 | ✅ 完成 | `ensureColumns` 不再对 `agent_sessions/entries/events/outputs/toolresult_readability` 执行补列 |
| 会话回放按 `turnId` 过滤 | ✅ 完成 | `entries/events/outputs` 均支持 `turnId` 查询 |
| 会话详情支持单 turn 视图 | ✅ 完成 | `GET /sessions/:id?turnId=...` 返回过滤后的 entries/outputs |
| 新增 entries 回放接口 | ✅ 完成 | `GET /sessions/:id/entries` 已提供 `turnId` 和 `limit` |
| 前端类型与 view-model 对齐 | ✅ 完成 | `AgentEntry.turnId` 新增，渲染优先使用结构化列 |
| 自动化测试补齐 | ✅ 完成 | sidecar + frontend 新增/扩展用例并通过 |

## P1 完成项

| 事项 | 状态 | 结果 |
|---|---|---|
| Runtime 事件规范化入口集中 | ✅ 完成 | `runtime-router` 新增统一 `normalizeRuntimeEvent`，路由仅消费规范化事件 |
| 主备 runtime 关键字段全集对齐 | ✅ 完成 | `turn.started`、`assistant.completed`、`queue.updated`、`session.aborted`、`tool.result` 统一补齐默认字段 |
| 路由层错误码与请求校验标准化 | ✅ 完成 | `turn/steer/follow-up/promote/abort` 统一校验与错误码映射（含 `INTERNAL_ERROR`） |
| Runtime/API parity 测试补齐 | ✅ 完成 | 新增 `runtime-router` 规范化测试与双引擎路由 parity 测试 |

## P2 进展（本轮）

| 事项 | 状态 | 结果 |
|---|---|---|
| 保留特化能力偏离说明文档化 | ✅ 完成 | 新增 `docs/dev/agent-upstream-deviations.md`，覆盖 timeline/output rail/@mention/trace/readable |
| trace / tool readable 链路边界与 SLA 明确化 | ✅ 完成 | 已定义边界、硬约束、运行目标、告警建议 |
| 诊断链路与可读化链路独立回归用例 | ✅ 完成 | 新增 `agent-trace-store.test.ts` 与 `agent-toolresult-enhance.test.ts` 并纳入 sidecar 默认测试基线 |

## 本次关键变更文件

### 数据与存储

- `sidecar/src/db/schema.ts`
- `sidecar/src/db/index.ts`
- `sidecar/src/services/agent-session-store.ts`
- `sidecar/src/services/agent-event-store.ts`
- `sidecar/src/services/agent-external-event-dispatcher.ts`

### API 路由

- `sidecar/src/routes/agent.ts`

### Runtime 规范化

- `sidecar/src/agent/runtime/runtime-router.ts`
- `sidecar/src/agent/runtime/runtime-router.normalization.test.ts`

### 前端类型与适配

- `src/types/agent.ts`
- `src/lib/agent-api.ts`
- `src/components/agent/agent-message-view-model.ts`

### 测试

- `sidecar/src/services/agent-session-store.turn-id.test.ts`
- `sidecar/src/services/agent-event-store.turn-id.test.ts`
- `sidecar/src/routes/agent-replay-turn-filter.test.ts`
- `sidecar/src/routes/agent.runtime-parity.test.ts`
- `sidecar/src/services/agent-trace-store.test.ts`
- `sidecar/src/worker/handlers/agent-toolresult-enhance.test.ts`
- `src/__tests__/agent-message-view-model.test.ts`
- `src/__tests__/agent-message-list-scroll.test.tsx`

## 验证记录

已执行并通过：

- `pnpm -C sidecar exec tsc --noEmit`
- `pnpm -C sidecar test`
- `pnpm typecheck`
- `pnpm test:run -- src/__tests__/agent-message-view-model.test.ts src/__tests__/agent-message-list-scroll.test.tsx`
- `pnpm -C sidecar exec tsx --test src/services/agent-trace-store.test.ts src/worker/handlers/agent-toolresult-enhance.test.ts`

## 下一步（建议）

1. 在 CI 中固定 Node 版本（避免 `better-sqlite3` ABI 漂移导致偶发失败）。
2. 将 trace/readable 的关键指标纳入持续监控看板（失败率、超时率、限流占比）。
