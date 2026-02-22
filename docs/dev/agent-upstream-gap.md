# Agent 上游差异与去重清单（pi-mono 对照）

更新时间：`2026-02-17`  
上游基线：`.upstream/pi-mono @ 3a3e37d`

## 当前实施状态（2026-02-17）

- 本清单对应的 **P0 + P1 已完成落地**（数据契约 + 回放过滤 + 前端适配 + Runtime 事件规范化 + 路由错误码标准化 + 自动化测试）。
- 进度与验收记录见：`docs/dev/agent-upstream-gap-progress.md`。
- 说明：本次按“开发阶段可清空数据库”的约束执行，明确不做历史数据回填与读兼容迁移。

## 目的

在不牺牲本仓业务能力（拍摄资源、产物栏、可读化增强、Trace）的前提下，识别 Agent 相关“重复造轮子”区域，并给出可执行、可验收、可回滚的收敛路径。

## 本次修订（补洞）

1. 明确了 `sessionId + turnId` 的跨表数据契约，补齐落库一致性要求。
2. 补充了主备 Runtime 事件对齐矩阵，区分“强一致”与“弱一致”事件。
3. 将 P0/P1/P2 从“方向性动作”细化为“可交付 + 完成定义（DoD）”。
4. 给每条验收标准绑定测试场景，避免“口头验收”。

## 对照范围

- 本仓：`sidecar/src/routes/agent.ts`、`sidecar/src/agent/runtime/*`、`sidecar/src/agent/extensions/*`、`sidecar/src/services/*agent*`、`src/components/agent/*`、`src/lib/agent-*`
- 上游：`.upstream/pi-mono/packages/agent`、`.upstream/pi-mono/packages/coding-agent`、`.upstream/pi-mono/packages/web-ui`

## 逐项结论（修订后）

| # | 能力项 | 本仓关键文件 | 上游对照点 | 重复风险 | 决策 |
|---|---|---|---|---|---|
| 1 | Agent API 与会话控制 | `sidecar/src/routes/agent.ts` | `.upstream/pi-mono/packages/agent/src/agent.ts`<br/>`.upstream/pi-mono/packages/agent/src/agent-loop.ts`<br/>`.upstream/pi-mono/packages/agent/src/proxy.ts` | 中低 | 保留（REST/SSE 为本仓壳层能力） |
| 2 | Runtime 编排（主备） | `sidecar/src/agent/runtime/runtime-router.ts`<br/>`sidecar/src/agent/runtime/coding-agent-runtime.ts`<br/>`sidecar/src/agent/runtime/agent-core-runtime.ts` | `.upstream/pi-mono/packages/agent/src/agent-loop.ts`<br/>`.upstream/pi-mono/packages/coding-agent/src/core/agent-session.ts` | 高 | 收敛（先统一事件语义，再减少双实现分叉） |
| 3 | 自定义工具扩展 | `sidecar/src/agent/extensions/resource-extension.ts`<br/>`sidecar/src/agent/extensions/photo-copy-extension.ts`<br/>`sidecar/src/agent/extensions/tool-definitions.ts` | `.upstream/pi-mono/packages/coding-agent/src/core/extensions/index.ts`<br/>`.upstream/pi-mono/packages/coding-agent/src/core/resource-loader.ts` | 低 | 保留（复用上游扩展点做业务特化） |
| 4 | ToolResult 可读化增强 | `sidecar/src/worker/handlers/agent-toolresult-enhance.ts`<br/>`sidecar/src/services/agent-toolresult-readability-store.ts`<br/>`sidecar/src/agent/runtime/coding-agent-runtime.ts` | `.upstream/pi-mono/packages/coding-agent/src/core/export-html/tool-renderer.ts`<br/>`.upstream/pi-mono/packages/web-ui/src/components/AgentInterface.ts` | 低 | 保留（上游无等价后端增强流水线） |
| 5 | 存储与回放体系 | `sidecar/src/db/schema.ts`<br/>`sidecar/src/services/agent-session-store.ts`<br/>`sidecar/src/services/agent-event-store.ts` | `.upstream/pi-mono/packages/coding-agent/src/core/session-manager.ts`<br/>`.upstream/pi-mono/packages/coding-agent/src/core/agent-session.ts` | 高（逻辑） | 收敛（SQLite 形态保留，但语义契约与回放行为对齐） |
| 6 | @ Mention 资源引用 | `sidecar/src/services/agent-resource-search.ts`<br/>`src/components/agent/mention/MentionComposer.tsx`<br/>`src/components/agent/mention/MentionPickDialog.tsx`<br/>`src/components/agent/mention/mention-utils.ts` | `.upstream/pi-mono/packages/web-ui/src/components/*`（未发现等价组件）<br/>`.upstream/pi-mono/packages/coding-agent/src/*`（未发现等价资源 mention） | 低 | 保留（产品特化能力） |
| 7 | 前端 Agent 工作台 | `src/components/agent/AgentShell.tsx`<br/>`src/components/agent/AgentMessageList.tsx`<br/>`src/components/agent/agent-message-view-model.ts`<br/>`src/components/agent/AgentToolTimeline.tsx`<br/>`src/components/agent/AgentOutputRail.tsx` | `.upstream/pi-mono/packages/web-ui/src/components/AgentInterface.ts`<br/>`.upstream/pi-mono/packages/web-ui/src/components/MessageList.ts`<br/>`.upstream/pi-mono/packages/web-ui/src/components/Messages.ts` | 中高 | 部分收敛（消息壳层收敛，时间线/产物栏保留） |
| 8 | Trace/诊断链路 | `sidecar/src/services/agent-trace-store.ts`<br/>`sidecar/src/services/trace-fetch.ts`<br/>`sidecar/src/services/agent-trace-context.ts`<br/>`sidecar/src/config/agent-trace-flags.ts`<br/>`src/lib/agent-trace-client.ts`<br/>`sidecar/scripts/agent-trace.ts` | `.upstream/pi-mono/packages/agent/src/agent-loop.ts`（仅事件流） | 低 | 保留（上游无等价 trace 落库与诊断工具） |

## 关键数据契约（P0 必落地）

| 载体 | 关键键 | 约束 | 当前状态 | 修订决策 |
|---|---|---|---|---|
| `agent_sessions` | `id` | 会话主键 | 已满足 | 保持 |
| `agent_events` | `session_id` + `turn_id` + `seq` | 每个事件必须挂会话；turn 级事件必须带 turnId | 已满足 | 保持 |
| `agent_entries` | `session_id` + `turn_id`（新增列） | user/assistant/toolResult 统一可按 turn 检索 | 未满足（仅 payload 内含 turnId） | 新增 `turn_id` 实列 + 索引（不做历史回填） |
| `agent_outputs` | `session_id` + `turn_id` | 产物可按 turn 聚合 | 已满足 | 保持 |
| `agent_toolresult_readability` | `session_id` + `turn_id` + `entry_id` | 可读化记录与 toolResult entry 一一对应 | 已满足 | 保持 |
| `agent_trace_logs` | `trace_id` + `session_id` + `turn_id` | 诊断链路可按 turn 过滤 | 已满足 | 保持 |

### `agent_entries.turn_id` 落地规则

1. 新建迁移：为 `agent_entries` 增加 `turn_id` 列（nullable）与索引 `idx_agent_entries_session_turn_created_at(session_id, turn_id, created_at)`。
2. 不做回填策略：不从 `payload_json.turnId` 回填历史 `turn_id`，旧数据不兼容。
3. 不做读兼容：读取与过滤仅使用 `row.turn_id`，不回退 `payload.turnId`。
4. 写入策略：`turn` / `steer` / `follow-up` / `assistant.completed` / `tool.result` 生成的 entries，必须显式写 `turn_id`。

## Runtime 事件对齐矩阵（主备统一边界）

| 事件 | 一致性级别 | 必需字段 | 当前差异 | 收敛决策 |
|---|---|---|---|---|
| `turn.started` | 强一致 | `engine` `providerId` `model` | 主备字段数量不一致 | 统一字段集合，缺值填 `null`/`[]` |
| `assistant.delta` | 强一致 | `delta` | 基本一致 | 保持 |
| `assistant.completed` | 强一致 | `text` `stopReason` `errorMessage` `usage` | `agent-core` 缺 `stopReason/errorMessage/usage` | `agent-core` 补齐字段（未知填 `null`） |
| `queue.updated` | 强一致 | `queueAction` `clientMessageId` `mode` `text` | 基本一致 | 保持 |
| `steer.applied` / `followup.applied` | 强一致 | `clientMessageId` `text` `mode` `queuedAt` `appliedAt` | 基本一致 | 保持 |
| `session.aborted` | 强一致 | `reason` | 基本一致 | 保持 |
| `tool.call/progress/result` | 弱一致 | `toolCallId` `toolName`（result 需含 `isError`） | `agent-core` 当前未发 | 定义为可选；前端 adapter 必须可处理“无 tool 事件” |
| `turn.completed` / `turn.failed` | 强一致 | `message`（失败时） | 基本一致 | 保持 |

### 收敛实现边界

1. 统一在 `sidecar/src/agent/runtime/runtime-router.ts` 增加事件规范化入口，避免分散在两个 runtime 文件内重复修补。
2. `sidecar/src/routes/agent.ts` 只消费“规范化后事件”，不感知主备差异。

## 文件级去重执行清单（Decision Complete）

### P0（优先）

| 动作 | 文件 | 可交付物 | 完成定义（DoD） |
|---|---|---|---|
| `agent_entries.turn_id` 落地 | `sidecar/src/db/schema.ts`<br/>`sidecar/src/services/agent-session-store.ts`<br/>`sidecar/src/routes/agent.ts`<br/>`src/types/agent.ts` | schema + 迁移 + 严格读写契约 | 新数据可按 `sessionId + turnId` 查询 entries |
| 会话语义收敛 | `sidecar/src/services/agent-session-store.ts`<br/>`sidecar/src/services/agent-event-store.ts` | turn 级回放接口（按 `turnId` 过滤） | 回放接口支持“会话全量”与“单 turn”两种模式 |
| 消息渲染核心抽离 | `src/components/agent/AgentMessageList.tsx`<br/>`src/components/agent/agent-message-view-model.ts` | 独立 adapter（事件归一化 + tool 配对） | `AgentShell` 不再包含 runtime 分支判断逻辑 |

### P1（次优）

| 动作 | 文件 | 可交付物 | 完成定义（DoD） |
|---|---|---|---|
| Runtime 事件映射集中 | `sidecar/src/agent/runtime/runtime-router.ts`<br/>`sidecar/src/agent/runtime/coding-agent-runtime.ts`<br/>`sidecar/src/agent/runtime/agent-core-runtime.ts` | 统一事件规范层 | 主备运行同一组事件快照测试通过 |
| API 壳层标准化 | `sidecar/src/routes/agent.ts` | 请求校验和错误码枚举表 | `turn/steer/follow-up/abort` 错误码行为一致 |

### P2（保持现状，增强约束）

| 动作 | 文件 | 可交付物 | 完成定义（DoD） |
|---|---|---|---|
| 特化能力留存 | `src/components/agent/AgentToolTimeline.tsx`<br/>`src/components/agent/AgentOutputRail.tsx`<br/>`src/components/agent/mention/*`<br/>`sidecar/src/services/agent-resource-search.ts` | 偏离上游说明文档 | 每项能力都可在文档中定位偏离原因 |
| Trace/可读化链路留存 | `sidecar/src/services/agent-trace-store.ts`<br/>`sidecar/src/worker/handlers/agent-toolresult-enhance.ts` | 维护边界与 SLA 说明 | 诊断链路与可读化链路有独立回归用例 |

## 测试与验收映射

| 验收项 | 自动化测试（新增/调整） | 手动回归场景 |
|---|---|---|
| `steer/follow-up/abort` 主备一致，且可回放 | `sidecar/src/routes/agent.runtime-parity.test.ts`（新增）<br/>`sidecar/src/services/agent-event-store.test.ts`（新增） | 同一会话分别使用 `coding-agent` / `agent-core`，验证事件序列与错误码 |
| 前端消息流不依赖 runtime 分支 | `src/__tests__/agent-message-view-model.test.ts`（扩展双引擎样例）<br/>`src/__tests__/agent-message-list-scroll.test.tsx`（维持流式断点） | 切换引擎后 UI 的消息、时间线、产物栏均正常 |
| 跨表可按 `sessionId + turnId` 关联 | `sidecar/src/services/agent-session-store.turn-id.test.ts`（新增）<br/>`sidecar/src/services/agent-toolresult-readability-store.test.ts`（新增） | 随机抽一个 turn，在 entries/events/outputs/readability/trace 全链路查到记录 |
| 保留特化能力均有偏离说明 | `docs` lint/链接检查 + 评审清单 | 抽查 mention、产物栏、trace、tool readable 四项 |

## 不做事项（明确边界）

1. 不回退为上游 JSONL 会话存储；本仓继续使用 SQLite。
2. 不删除 `tool.result.enhanced` 链路；仅做接口与事件语义对齐。
3. 不把 `@mention`、产物栏、工具时间线降级为上游最小聊天壳。

## 偏离上游记录模板（用于 P2 能力）

每个保留特化能力至少记录以下字段：

1. 上游对照点（至少 2 个文件路径或模块名）。
2. 本仓偏离点（接口、数据、交互行为）。
3. 偏离理由（约束/产品目标/兼容要求）。
4. 回滚条件（何时可收敛回上游实现）。

## 验收标准（去重后）

1. `steer/follow-up/abort` 在主备引擎上行为一致，事件可按会话与 turn 回放。
2. 前端消息渲染仅依赖统一 view model，不依赖 runtime 分支判断。
3. 会话/事件/输出/readability/trace 可通过同一 `sessionId + turnId` 关联追踪。
4. 所有保留特化能力都具备“偏离上游原因 + 回滚条件”文档记录。
