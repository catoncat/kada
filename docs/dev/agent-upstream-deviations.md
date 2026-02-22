# Agent 保留特化能力偏离说明与 SLA（P2）

更新时间：`2026-02-20`  
关联文档：

- `docs/dev/agent-upstream-gap.md`
- `docs/dev/agent-upstream-gap-progress.md`
- 上游基线：`.upstream/pi-mono @ 3a3e37d`

## 目的

在 `P0 + P1` 已完成后，明确本仓保留能力与上游 `pi-mono` 的偏离边界，并给出可执行回滚条件与运行 SLA，避免后续演进再次“隐性分叉”。

## 1. 保留特化能力偏离记录

### 1.1 工具时间线（Tool Timeline）

1. 上游对照点：
- `.upstream/pi-mono/packages/web-ui/src/components/MessageList.ts`
- `.upstream/pi-mono/packages/web-ui/src/components/StreamingMessageContainer.ts`
2. 本仓实现：
- `src/components/agent/AgentToolTimeline.tsx`
3. 本仓偏离点：
- 在主消息流外新增右侧“工具时间线”独立视图。
- 时间线不仅展示 `tool.call/tool.result`，还展示 `photo.task.*`、`copy.ready`、`queue.updated`、`session.aborted` 等业务事件。
4. 偏离理由：
- 本仓工作流包含“工具调用 + 生图任务 + 文案任务”混合链路，单纯把工具结果内嵌到 assistant 消息里不利于排障和回放核对。
5. 回滚条件：
- 上游 Web UI 原生提供可配置的事件时间线（至少覆盖 tool + 业务扩展事件）且可无缝挂接本仓事件类型时，可收敛回上游实现。

### 1.2 产物栏（Output Rail）

1. 上游对照点：
- `.upstream/pi-mono/packages/web-ui/src/components/MessageList.ts`
- `.upstream/pi-mono/packages/web-ui/src/components/sandbox/ArtifactsRuntimeProvider.ts`
2. 本仓实现：
- `src/components/agent/AgentOutputRail.tsx`
- `sidecar/src/routes/agent.ts`（`appendAgentOutput` 落库）
3. 本仓偏离点：
- 将 `photo/copy` 作为结构化产物，从 `agent_outputs` 独立渲染为右侧栏，而不是混在聊天消息中。
4. 偏离理由：
- 本仓是“拍摄策划 + 生成产物”场景，产物需要按类别稳定沉淀和复用，侧栏比消息内嵌更符合检索/复盘路径。
5. 回滚条件：
- 上游提供通用 Artifact Rail，支持按 kind 分组、按 `turnId` 回放，并能承载 `photo/copy` 语义时，可评估回滚。

### 1.3 `@mention` 资源引用

1. 上游对照点：
- `.upstream/pi-mono/packages/web-ui/src/components/MessageEditor.ts`
- `.upstream/pi-mono/packages/coding-agent/src/core/resource-loader.ts`
2. 本仓实现：
- `src/components/agent/mention/MentionComposer.tsx`
- `src/components/agent/mention/MentionPickDialog.tsx`
- `src/components/agent/mention/mention-utils.ts`
- `sidecar/src/services/agent-resource-search.ts`
3. 本仓偏离点：
- 输入层支持 `@` 搜索 `project/scene/model/image`，可选自动首图/仅资源/手动挑图。
- 运行时把 mention 结构化上下文拼装入 turn 输入，支持降级丢弃和原因记录。
4. 偏离理由：
- 本仓核心数据在业务库中，附件上传无法替代“结构化资源引用 + 图片绑定”能力。
5. 回滚条件：
- 上游扩展体系出现等价“结构化资源 mention + 图片选择”能力，且可直接连接本仓资源检索 API 时，可逐步迁移。

### 1.4 Trace 诊断链路

1. 上游对照点：
- `.upstream/pi-mono/packages/agent/src/agent-loop.ts`
- `.upstream/pi-mono/packages/web-ui/src/components/AgentInterface.ts`
2. 本仓实现：
- `sidecar/src/services/agent-trace-store.ts`
- `sidecar/src/services/trace-fetch.ts`
- `sidecar/src/routes/agent.ts`
- `src/lib/agent-trace-client.ts`
3. 本仓偏离点：
- 新增跨层（ui/network/sse/render/api/runtime/provider/db）trace 落库与查询 API。
- 支持 `trace timeline` 与 `wire ndjson` 回放。
4. 偏离理由：
- 本仓存在“前端流式 + Sidecar 路由 + 双 runtime + 第三方 provider”联动问题，仅内存事件流不足以支撑离线排障。
5. 回滚条件：
- 上游提供稳定的持久化 trace 标准（含 `sessionId + turnId`）及查询/回放工具后，可缩减本仓实现为薄封装。

### 1.5 ToolResult 可读化增强链路

1. 上游对照点：
- `.upstream/pi-mono/packages/coding-agent/src/core/export-html/tool-renderer.ts`
- `.upstream/pi-mono/packages/web-ui/src/components/AgentInterface.ts`
2. 本仓实现：
- `sidecar/src/worker/handlers/agent-toolresult-enhance.ts`
- `sidecar/src/services/agent-toolresult-readability-store.ts`
- `sidecar/src/routes/agent.ts`
3. 本仓偏离点：
- `tool.result` 入库后异步进入增强任务，维护 `pending/completed/failed/skipped` 状态与缓存复用。
- 增强结果必须通过证据校验（evidence/token 均需在源文本可追溯）。
4. 偏离理由：
- 上游侧重渲染，不提供后端“规则层 + AI 增强层”双层可读化流水线；本仓需要面向业务同学输出稳定中文摘要。
5. 回滚条件：
- 上游引入等价的服务端可读化增强协议（含状态、缓存、证据校验）并满足本仓审计要求时，可收敛。

## 2. Trace / Tool readable 维护边界

| 链路 | 写入入口 | 存储 | 读取/消费 | 故障策略 | 非目标 |
|---|---|---|---|---|---|
| Trace | `src/lib/agent-trace-client.ts`、`sidecar/src/services/trace-fetch.ts`、`sidecar/src/routes/agent.ts` | `agent_trace_logs` + 可选 wire 文件 | `/api/agent/traces*`、`sidecar/scripts/agent-trace.ts` | best-effort，采样未命中/写入失败不阻断 turn | 不做长期审计系统；不替代业务日志 |
| Tool readable | `sidecar/src/routes/agent.ts`（`tool.result`） -> `tasks` -> `agent-toolresult-enhance` | `agent_toolresult_readability` | 会话详情回放（entry payload merge） | 增强失败/超时标记 `failed/skipped`，不影响主回复链路 | 不改写工具原始结果真值 |

## 3. SLA（当前硬约束 + 运行目标）

### 3.1 Trace 链路

1. 硬约束（代码）：
- 采样开关：`AGENT_TRACE_ENABLED`（默认非生产开启）。
- 采样率：`AGENT_TRACE_SAMPLE_RATE`（默认 `1`，按 `traceId` 稳定采样）。
- 单条最大：`AGENT_TRACE_MAX_EVENT_BYTES`（默认 `4096` 字节）。
- wire 文件大小上限：`AGENT_TRACE_WIRE_MAX_FILE_BYTES`（默认 `262144` 字节）。
- 保留时长：`AGENT_TRACE_RETENTION_HOURS`（默认 `72` 小时），清理周期 `30` 分钟。
- 查询分页上限：`/traces` `limit` 被限制在 `1~500`。
2. 运行目标（P2）：
- 在 trace 开启且采样命中时，客户端事件应在 `5s` 内可被 `/api/agent/traces` 查询到。
- `api.stream.closed_by_server` 比率长期高于 `98%`（排除用户主动关闭）时无需告警；低于阈值需排查断流。

### 3.2 Tool readable 链路

1. 硬约束（代码）：
- 任务超时：`ENHANCE_TIMEOUT_MS = 1800`。
- 触发阈值：`chars >= 320` 或 `jsonDepth >= 3` 或 `isError` 或 `ruleScore < 0.65` 或未知工具或疑似栈噪声。
- 会话限速：`60s` 内若可读化记录数 `> 6`，新任务标记 `RATE_LIMITED_PER_SESSION` 并跳过。
- 输出约束：`summary <= 72` 字符、`detail <= 500` 字符、输入源截断 `<= 8000` 字符。
- 增强结果必须通过证据校验，不通过直接 `failed`。
2. 运行目标（P2）：
- `tool.result` 到 `completed/skipped/failed` 的状态收敛时间目标 `<= 5s`（缓存命中通常显著更快）。
- `failed` 中 `ENHANCE_TIMEOUT` 占比连续升高时触发模型/网络侧排查。

## 4. 回归与告警（P2 收口）

1. 新增独立回归用例：
- `sidecar/src/services/agent-trace-store.test.ts`
- `sidecar/src/worker/handlers/agent-toolresult-enhance.test.ts`
2. 告警建议：
- trace：按 `channel/event/level` 聚合，关注 `*.failed`、`level=error`、`api.stream.closed_by_client` 异常激增。
- readable：关注 `pending` 滞留、`RATE_LIMITED_PER_SESSION` 激增、`ENHANCE_OUTPUT_PARSE_FAILED` 与 `TOKEN_NOT_FOUND`。
