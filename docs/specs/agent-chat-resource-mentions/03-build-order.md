# Agent Chat 资源 `@` 引用 + 多选 Pick（Build Order）

> FEATURE_SLUG: `agent-chat-resource-mentions`
> 前置：`01-feature-spec.md` + `02-ux-spec.md`

## 全局约束

1. 仅改造当前 `AgentShell` 主入口。
2. 不回滚现有未提交改动；冲突时先人工确认。
3. mentions 失败必须降级为纯文本，不得阻断发送。
4. 本期不实现自动分任务策略。

## Step 1：后端资源检索服务

### 目标

新增统一资源检索/取图能力，供 Agent Chat mention 使用。

### 变更

1. 新增 `sidecar/src/services/agent-resource-search.ts`
2. 聚合四类资源：`project/scene/model/image`
3. 导出：
   - `searchAgentResources({ q, kinds, limit })`
   - `listAgentResourceImages({ kind, id })`
   - `resolveAgentMentionsForRuntime(mentions)`

### 要点

1. 结果分组稳定且去重。
2. `image` 资源来源于 `generation_artifacts`（未删除）。
3. 路径统一转成前端可用的 `/uploads/...` 形式。

## Step 2：后端 Agent 路由扩展

### 目标

为 Agent 提供资源接口，并让 turn/steer/follow-up 支持 mentions。

### 变更

1. 修改 `sidecar/src/routes/agent.ts`
2. 新增接口：
   - `GET /api/agent/resources/search`
   - `GET /api/agent/resources/:kind/:id/images`
3. 扩展入参：
   - `POST /sessions/:id/turn` body `{ text, mentions? }`
   - `POST /sessions/:id/steer` body `{ text, mentions? }`
   - `POST /sessions/:id/follow-up` body `{ text, mentions? }`
4. 调用 runtime 前注入 mentions 上下文块（仅执行输入）。

### 要点

1. mentions 解析失败不抛错，不中断发送。
2. 无有效 mention 时仅发送原文本。
3. entry 持久化可带 mentions 元数据用于排障。

## Step 3：前端类型与 API 层

### 目标

前端具备 mentions/资源搜索/资源图片请求能力。

### 变更

1. 修改 `src/types/agent.ts`
   - 新增 `AgentMentionKind`、`AgentMentionImageRef`、`AgentMention`、`AgentResourceSearchItem`
2. 修改 `src/lib/agent-api.ts`
   - `streamAgentTurn`/`steerAgentSession`/`followUpAgentSession` 支持 `mentions`
   - 新增 `searchAgentResources`、`listAgentResourceImages`
3. 修改 `src/hooks/useAgentTurnStream.ts`
   - `runTurn` 入参支持 `mentions`

## Step 4：Mention 输入与 Pick 面板

### 目标

完成输入层 `@` + 多选 Pick 交互。

### 变更

1. 新增目录：`src/components/agent/mention/`
2. 组件建议：
   - `MentionComposer.tsx`（基于 `react-mentions`）
   - `MentionSuggestions.tsx`
   - `MentionPickDialog.tsx`
   - `mention-utils.ts`
3. 行为：
   - `@` 候选、键盘导航、token 高亮
   - pick 多选（勾选/反选/清空）
   - mentionId 与图片绑定维护

## Step 5：AgentComposer / AgentShell 接入

### 目标

保持现有发送体验，替换输入内核为 mention 版。

### 变更

1. 修改 `src/components/agent/AgentComposer.tsx`
   - 使用 MentionComposer 输出 `{ text, mentions }`
   - 保持 Enter/Shift+Enter/Esc 语义
2. 修改 `src/components/agent/AgentShell.tsx`
   - `handleSend/handleSteer/handleFollowUp` 透传 mentions
   - 乐观消息仍只展示 plain text

## Step 6：测试与回归

### 自动检查

1. `pnpm typecheck`
2. `pnpm test:run`
3. `pnpm -C sidecar build`
4. `node --import tsx --test sidecar/src/**/*.test.ts`

### 手动检查

1. `pnpm dev:all`
2. 覆盖场景：
   - `@` 候选与键盘交互
   - 四类资源搜索
   - pick 多选与绑定更新
   - 资源失效降级
   - 无 `@` 路径、streaming、abort 回归

