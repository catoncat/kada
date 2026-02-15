---
name: spv2-agent-ui-flow
description: 实现与调试 shooting-planner-v2 的 Agent 前端交互流（/workspace）：会话列表、流式消息、工具时间线、产物栏、steer/follow-up/abort。用于“UI 不刷流”“时间线错位”“产物不同步”“断线续播异常”等问题。
---

# SPV2 Agent UI Flow

## 目标
保证 `/workspace` 的 Agent 体验稳定：消息流不断、工具态准确、产物栏实时同步。

## 关键数据流
1. 会话数据：`useAgentSessions` / `useAgentSession`。
2. 回合流式：`useAgentTurnStream` + SSE `onEvent`。
3. 时间线：消费 `tool.*`、`photo.*`、`copy.ready`。
4. 产物栏：消费 `outputs` 与会话刷新结果。

## UI 状态机要求
- `send` 仅在非流式时可用。
- `steer/follow-up/abort` 仅在流式中可用。
- `turn.completed/failed` 后必须刷新会话与产物。
- 断线重连优先使用 `events?cursor=...` 增量补齐。

## 调试顺序
1. 先看后端事件：确认是否真的产生 `tool.call/tool.result/photo.ready/copy.ready`。
2. 再看前端事件处理：检查 `handleChunk` 是否吞事件或覆盖状态。
3. 再看渲染：确认消息、时间线、产物是否来自同一 `sessionId`。
4. 最后查交互锁：确认 `disabled/streaming/submitting` 条件不互斥。

## 回归检查
- 发送一轮后消息列表不抖动。
- 工具时间线状态从 running 到 completed/error 正确过渡。
- `photo.ready` 与 `copy.ready` 后右栏立即可见。
- `abort` 后 UI 状态回到可发送。

## 参考
- 读取 `references/ui-debug-checklist.md` 使用事件到组件的排查清单。
