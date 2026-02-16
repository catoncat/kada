# Agent Chat 资源 `@` 引用 + 多选 Pick（Feature Spec）

> FEATURE_SLUG: `agent-chat-resource-mentions`
> 适用范围：仅 `AgentShell` 主入口（`/workspace`）
> 不在范围：旧 `WorkspaceShell`

## 1. 背景与目标

当前 Agent Chat 仅支持纯文本输入，无法在对话时快速引用项目/场景/模特/图片资源，导致：

1. 资源上下文缺失，Agent 工具链需要反复查询。
2. 图像参考选择成本高，用户无法在输入时一次绑定多图。
3. 资源失效时体验脆弱，容易因结构化参数失败阻断发送。

本期目标是在 Agent Chat 输入层引入资源 `@` 引用与图片多选 Pick，使用户可在“自然语言 + 结构化资源”之间无缝切换，并保持发送链路的鲁棒性。

## 2. 范围

### 2.1 In Scope

1. Agent Chat 输入支持 `@` 触发资源候选。
2. 支持四类资源：`project` / `scene` / `model` / `image`。
3. 选中资源后可进入 Pick 面板，多选图片并绑定到 mention。
4. `turn` / `steer` / `follow-up` 三类发送均支持 `mentions` 透传。
5. 运行时在发送给 Runtime 前注入 mentions 结构化上下文块。
6. 资源或图片失效时降级为纯文本发送，不阻断。

### 2.2 Out of Scope

1. 旧 `WorkspaceShell` 兼容。
2. 自动分任务策略（本期明确不做）。
3. 后端新增复杂调度器或策略引擎（沿用现有 reference planner）。
4. 对历史会话消息进行 mention 富文本回填展示。

## 3. 关键决策（冻结）

1. 输入层技术方案：`react-mentions`。
2. pick 支持多选，不设前端硬上限。
3. 资源/图片失效时：丢弃结构化 mentions，保留原始文本继续发送。
4. 引用图片透传后端，由后端沿用现有 `reference-image-planner`。
5. mentions 仅作为“执行输入增强”，不改用户侧主消息展示文案。

## 4. 用户故事

1. 作为运营/策划，我在对话中输入 `@` 后能直接搜到项目、场景、模特和图片。
2. 作为运营/策划，我选择某个资源后，可以再选多张参考图一并绑定发送。
3. 作为运营/策划，即使资源后来被删，消息也能按原文发送，不会卡死。
4. 作为研发/排障人员，我能在日志/事件里观察 mentions 入参与降级结果。

## 5. 功能要求

### 5.1 资源检索

1. 提供统一搜索接口，支持 query、kind 过滤、limit。
2. 结果分组稳定（固定 kind 顺序），并在前端做去重。
3. 搜索结果包含最小可展示字段（id/title/subtitle/thumbnail）。

### 5.2 Mention 插入与生命周期

1. 输入 `@` 打开候选面板。
2. 键盘上下选择，Enter 确认插入 mention token，Esc 关闭候选。
3. mention token 可编辑/删除；删除后对应绑定自动清理。
4. 同一消息允许多个 mention。

### 5.3 Pick 多选

1. 资源插入后可打开图片 pick 面板。
2. 支持勾选、预览、反选、清空。
3. 单个 mention 可绑定多张图片。
4. 编辑 token 后，绑定关系随 mention 解析结果更新。

### 5.4 发送与降级

1. `turn`、`steer`、`follow-up` 请求统一支持 `mentions?: AgentMention[]`。
2. 后端发送前验证 mention 引用有效性。
3. 无效 mention / 无效图片被丢弃；当全部无效时按纯文本执行。
4. 不因 mentions 解析失败阻断消息发送。

## 6. 数据与契约

### 6.1 前端类型（`src/types/agent.ts`）

新增：

1. `AgentMentionKind`
2. `AgentMentionImageRef`
3. `AgentMention`
4. `AgentResourceSearchItem`

### 6.2 API 契约

1. `POST /api/agent/sessions/:id/turn`
   - body: `{ text: string, mentions?: AgentMention[] }`
2. `POST /api/agent/sessions/:id/steer`
   - body: `{ text: string, mentions?: AgentMention[] }`
3. `POST /api/agent/sessions/:id/follow-up`
   - body: `{ text: string, mentions?: AgentMention[] }`
4. `GET /api/agent/resources/search?q=&kinds=&limit=`
5. `GET /api/agent/resources/:kind/:id/images`

## 7. 验收标准

1. 输入交互：`@` 候选、方向键、Enter、Esc 与发送快捷键不冲突。
2. 资源覆盖：四类资源均可检索、插入、去重、稳定分组。
3. pick 多选：单 mention 绑定多图，编辑 token 后绑定可更新。
4. 降级行为：资源/图片失效不阻断发送，文本仍进入 turn。
5. 后端透传：turn/steer/follow-up 均能把 mentions 注入 runtime 输入。
6. 可观测性：日志或事件可定位 mentions 解析与降级结果。
7. 回归通过：无 `@` 的普通聊天、streaming、abort 行为不退化。

## 8. 风险与缓解

1. 风险：输入层键盘冲突（候选确认 vs 发送）。
   - 缓解：候选打开时 Enter 优先“选中候选”；仅在候选关闭时触发发送。
2. 风险：资源数据规模增长导致候选卡顿。
   - 缓解：后端 limit + 前端防抖 + 分组渲染。
3. 风险：mention 与图片绑定在编辑中丢失。
   - 缓解：基于 mentionId 做映射重建，删除 token 时显式清理。

