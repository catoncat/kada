---
name: spv2-agent-debug
description: 调试 shooting-planner-v2 的 Agent 端到端链路（UI、API、Runtime、Provider、SSE、Render），优先使用 Trace v1。用于“给定 ChatID/traceId 排查无响应”“空回复”“steer/follow-up 中断”“多 chat 并发串线”等问题。注意：本项目 ChatID 等同 sessionId（agent_sessions.id）。
---

# SPV2 Agent Debug

## 目标
快速给出可证据化结论：请求是否发出、是否到达 Sidecar、Runtime 是否执行、Provider 返回了什么、SSE/渲染是否落地。

## 关键事实（先统一口径）
- 本项目里 `ChatID` 就是 `sessionId`（`agent_sessions.id`），不是独立字段。
- Trace 主证据在 `agent_trace_logs`，业务语义在 `agent_entries/agent_events/agent_outputs`。
- 数据库路径是 `DATA_DIR/shooting-planner.db`；未设置 `DATA_DIR` 时默认 `sidecar/data/shooting-planner.db`（以 sidecar 进程工作目录为准）。

## 执行流程
1. 先做 ID 归一化：把用户给的 `ChatID` 当作 `sessionId` 处理。
2. 先验 `sessionId` 是否存在，再查关联 `traceId`（不要先猜“链路断了”）。
3. 用 `agent:trace --session <sessionId>` 首次回放，拿到关联 trace 与断点诊断。
4. 对命中的 `traceId` 再执行 `agent:trace --trace <traceId>`，补齐事件时序细节。
5. 必要时查 `/api/agent/traces/:traceId/timeline` 与 `/wire`，确认 provider 摘要与网络层细节。
6. 回看 `agent_entries/agent_events/agent_outputs` 做业务语义核对（是否真调用过工具、是否写入产物）。
7. 输出“断点 + 证据 + 可复现命令 + 下一步修复”。

## 无命中分支（必须覆盖）
- `session 不存在`：优先判断是否连错环境/连错数据库文件，再判断 ID 是否录入错误。
- `session 存在但 trace 为空`：优先检查 trace 开关/采样/保留窗口（`AGENT_TRACE_ENABLED`、`AGENT_TRACE_SAMPLE_RATE`、`AGENT_TRACE_RETENTION_HOURS`），再看是否请求根本没到 `/api/agent/*`。
- `trace 存在但 runtime 事件缺失`：重点排查 API 校验拒绝、turn gate 冲突、runtime 初始化失败或 provider 调用未发出。

## 优先命令
- `pnpm -C sidecar agent:trace --session <sessionId>`
- `pnpm -C sidecar agent:trace --trace <traceId>`
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
- `Scope`: `chatId(sessionId)/traceId` 与时间窗口
- `Identity`: 说明 ID 映射与数据源位置（本地 DB 路径）
- `Timeline`: UI/API/Runtime/Provider/SSE/Render 分阶段事件
- `Breakpoints`: 断点诊断（按链路先后）
- `Evidence`: 关键 `event + seq + timestamp + payload摘要`
- `Next Actions`: 可执行修复与验证命令

## 参考
- 读取 `references/sql-and-event-patterns.md` 获取 ID 映射、DB 路径判定、Trace v1 与 SQL 查询模板。
