---
name: spv2-agent-runtime-dev
description: 在 shooting-planner-v2 中开发与修改 Agent Runtime（coding-agent 主 + agent-core 备）、extensions/tools、事件映射与会话存储。用于“接入新工具”“改路由与事件协议”“保证主备一致且不改上游 npm 包源码”。
---

# SPV2 Agent Runtime Dev

## 目标
在不修改 `@mariozechner/*` 上游源码的前提下，扩展项目内 Agent 能力并保持可升级。

## 约束
- 只修改项目代码，不修改 `sidecar/node_modules` 与上游包源码。
- 主引擎 `coding-agent` 与回退引擎 `agent-core` 保持工具能力一致。
- 事件必须可回放、可追踪、可落库。

## 实施顺序
1. 定义或更新工具：优先在 `sidecar/src/agent/extensions/` 实现。
2. 对齐主备引擎：确保 `coding-agent` 与 `agent-core` 共享工具定义或等价实现。
3. 映射运行时事件：统一到 `turn/tool/photo/copy/queue/session` 事件域。
4. 持久化：写入 `agent_entries`、`agent_events`、`agent_outputs`。
5. 路由联通：确保 `/api/agent/...` 的请求、SSE 与游标续播正确。
6. 验证：`pnpm -C sidecar exec tsc --noEmit`、`pnpm -C sidecar build`。

## 必做检查
- 新工具是否有 schema 校验。
- 工具失败是否产生可诊断的 `tool.result(isError=true)` 或 `turn.failed`。
- `abort` 与 `turn.completed/failed` 状态是否互相覆盖。
- `agent-core` 回退后是否仍可出图和产文案。

## 交付格式
- `Changed Files`: 列出改动文件与目的。
- `Behavior`: 列出新增/变更事件与 API 行为。
- `Validation`: 编译、构建、回放验证结果。
- `Risks`: 明确尚未覆盖的测试面。

## 参考
- 读取 `references/runtime-file-map.md` 获取核心文件地图与修改边界。
