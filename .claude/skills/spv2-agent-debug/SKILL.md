---
name: spv2-agent-debug
description: 调试 shooting-planner-v2 的 Agent 端到端链路（UI、API、Runtime、Provider、SSE、Render），优先使用 Trace v1。用于“消息被吞”“空回复”“steer/follow-up 中断”“多 chat 并发串线”“看起来无响应”等问题定位。
---

# SPV2 Agent Debug

## 目标
快速给出可证据化结论：请求是否发出、是否到达 Sidecar、Runtime 是否执行、Provider 返回了什么、SSE/渲染是否落地。

## 执行流程
1. 优先拿 `traceId`。没有 `traceId` 时，先用 `sessionId` 查关联 trace。
2. 用 `agent:trace` 回放时序与断点诊断。
3. 必要时查 `/api/agent/traces/:traceId/timeline` 与 `/wire`，确认链路断点和 provider 摘要。
4. 再回看 `agent_entries/agent_events/agent_outputs` 做业务语义核对。
5. 给出“可复现 + 可验证”的根因结论，并附具体证据点（event + seq + 时间）。

## 优先命令
- `pnpm -C sidecar agent:trace --trace <traceId>`
- `pnpm -C sidecar agent:trace --session <sessionId>`
- `pnpm -C sidecar agent:trace`（未传参数时取最新 session）

## Trace 核查重点
- 是否出现 `ui.submit_click` 但无 `api.request.start`（前端未发出或请求未达）。
- 是否出现 `api.request.start` 但无 `api.turn.accepted`（路由校验拒绝或提前失败）。
- 是否出现 `runtime.turn.start` 但无 `provider.request`（未触发模型调用）。
- 是否出现 `provider.request` 但无 `runtime.assistant.completed`（provider/流中断）。
- 是否出现 `runtime.assistant.completed(stop,textLen=0,totalTokens=0)`（空回复结束）。
- 是否出现 `sse.open` 但无 `render.assistant_message_commit`（前端渲染链路异常）。

## 常见归因
- 前端交互已触发，但网络请求未发出或被中断。
- Sidecar 收到请求但被会话状态拒绝（running/archived/payload invalid）。
- Runtime 已执行，但 Provider 返回空 stop 或异常流。
- SSE 已回流，但会话切换/渲染过滤导致“看起来无响应”。
- 多 chat 并发时 trace 维度未对齐导致误判（需按 traceId 分析）。

## 交付格式
- `Scope`: `traceId/sessionId/chatId` 与时间窗口
- `Timeline`: UI/API/Runtime/Provider/SSE/Render 分阶段事件
- `Breakpoints`: 断点诊断（按链路先后）
- `Evidence`: 关键 `event + seq + timestamp + payload摘要`
- `Next Actions`: 可执行修复与验证命令

## 参考
- 读取 `references/sql-and-event-patterns.md` 获取 Trace v1 与 SQL 查询模板。
