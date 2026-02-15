---
name: spv2-agent-debug
description: 调试 shooting-planner-v2 的 Agent 会话链路（session/turn/SSE/tool/outputs）。当用户说“回放会话”“查看完整对话”“为什么没触发 tool.call”“为什么没出图/没文案”“排查 steer/follow-up 失效”时使用。
---

# SPV2 Agent Debug

## 目标
快速拿到一次会话的完整事实链：用户输入 -> 事件时序 -> 工具调用 -> 产物落库 -> 失败点。

## 执行流程
1. 获取目标 `sessionId`。未指定时取最新会话。
2. 回放完整对话：读取 `agent_entries`。
3. 回放完整流程：读取 `agent_events`，按 `seq` 与 `turn_id` 排序。
4. 核对产物：读取 `agent_outputs`，确认 `photo.ready/copy.ready` 与落库一致。
5. 输出诊断结论：明确“未触发工具 / 工具报错 / 任务未完成 / 仅文本回答”。

## 优先命令
- `pnpm -C sidecar agent:trace`
- `pnpm -C sidecar agent:trace <sessionId>`

## 手工核查点
- `turn.started` 后是否出现 `tool.call`。
- 存在 `tool.call` 时是否出现 `tool.result`，以及 `isError` 值。
- 生图链路是否出现 `photo.task.created -> photo.task.updated/photo.ready`。
- 文案链路是否出现 `copy.ready`。
- 仅有 `assistant.delta/completed` 且无 `tool.call` 时，归类为“模型未进工具链”。

## 常见归因
- 工具参数设计过重，模型放弃调用。
- 系统提示或技能规则过弱，模型直接文本回答。
- Provider 或模型能力与工具策略不匹配。
- 回退引擎未加载同一工具集，主备行为不一致。

## 交付格式
- `Session`: `id`, `engine`, `status`
- `Timeline`: 每个 turn 的关键事件
- `Findings`: 按严重级别列问题
- `Next Actions`: 仅列可执行修复动作

## 参考
- 读取 `references/sql-and-event-patterns.md` 获取 SQL 与事件模式模板。
