# Agent Mention 实现说明（当前版）

本文档描述当前仓库中 Agent 聊天 `@` 资源引用（mention）能力的实现方式与行为边界，作为后续迭代的基线文档。

## 1. 目标与范围

- 目标：在 Agent 输入框中通过 `@` 引用项目资源，并把结构化引用上下文传入运行时。
- 覆盖资源类型：`project | scene | model | image`
- 支持能力：
  - 资源搜索候选
  - 资源关联图片选择（自动首图 / 仅资源 / 手动挑图）
  - Mention chip 可视化与二次调整
  - 发送前后端校验与降级

## 2. 核心数据契约

定义位置：`src/types/agent.ts`

- `AgentMention`
  - `mentionId`: 前端生成的稳定引用 ID
  - `kind/resourceId/resourceTitle`: 被引用资源身份
  - `images`: 可选，用户选择的图片引用列表
- `AgentMentionImageRef`
  - `id/kind/resourceId/filePath/label`

前端发送 `turn/steer/follow-up` 时，会把 `mentions` 与 `text` 一并传给 Sidecar：
- `src/lib/agent-api.ts`
- 接口：`/api/agent/sessions/:id/turn|steer|follow-up`

## 3. 前端实现结构

### 3.1 主要文件

- `src/components/agent/mention/MentionComposer.tsx`
  - 主输入框与候选交互、快捷键、自动绑图逻辑
- `src/components/agent/mention/MentionPickDialog.tsx`
  - 手动多图选择弹窗
- `src/components/agent/mention/mention-utils.ts`
  - mention token 编解码、occurrence -> mentions 合并
- `src/components/agent/mention/mention-suggestion-layout.ts`
  - 候选列表可用空间计算（maxHeight）
- `src/components/agent/AgentComposer.tsx`
  - 发送行为与 IME/快捷键冲突规避

### 3.2 候选层布局策略

`MentionsInput` 使用：
- `suggestionsPortalHost={document.body}`：避免父容器 `overflow` 裁剪
- `customSuggestionsContainer`：动态计算并设置候选列表 `maxHeight`
- `allowSuggestionsAboveCursor`：空间不足时允许向上翻转

布局计算基于输入框与候选层实时 `getBoundingClientRect`，并监听：
- `resize`
- `scroll`（capture）
- `ResizeObserver`

## 4. 交互流程（当前）

### 4.1 输入与候选

1. 用户输入 `@` 触发 `searchAgentResources`
2. 候选项显示资源信息与“当前策略”
3. 候选支持二级动作（键盘优先）：
   - `→` 打开动作菜单
   - `↑/↓` 切换动作
   - `Enter` 确认动作
   - `←/Esc` 关闭动作菜单

### 4.2 资源动作语义（按 kind）

- `image`
  - 仅 `引用图片`（等价于直接使用该图片）
- `project/scene/model`
  - `自动首图`（默认）
  - `仅资源`（不绑定图片）
  - `手动挑图`（插入 mention 后立即打开 pick 弹窗）

### 4.3 插入后行为

插入 mention 时通过 `onAdd` 解析 token，按策略执行：

- `自动首图`
  - 调 `listAgentResourceImages(limit=1)` 取首图
  - 回填到该 mention 的 `images`
  - 带重试机制，避免 mention 刚插入时机导致写入丢失
- `仅资源`
  - 不附带图片
- `手动挑图`
  - 打开 `MentionPickDialog`，用户多选后写回 `images`

### 4.4 Mention chip

- 显示资源标签与当前图数
- 有图时显示首图缩略图，无图时显示类型占位
- 支持再次打开弹窗做“调整图片”

## 5. 快捷键设计（当前）

### 5.1 候选态快捷键

- `Enter`：确认当前候选
- `Alt+Enter`：将当前候选策略设为“手动挑图”（若支持）
- `→`：打开候选动作菜单
- `↑/↓`：动作菜单内切换
- `Enter`：动作菜单内确认
- `←/Esc`：关闭动作菜单

### 5.2 输入框态快捷键

- `Alt+Enter`：
  - 优先打开“未选图”的 mention
  - 如无未选图 mention，回退到最后一个 mention

### 5.3 与发送行为冲突规避

- 在 `AgentComposer` 中发送快捷键为：`Enter && !Shift && !Alt`
- 避免 `Alt+Enter` 被误判为发送
- 同时保留 IME 组合输入防抖（`isComposing/keyCode=229`）

## 6. 后端解析与降级

实现位置：
- `sidecar/src/routes/agent.ts`
- `sidecar/src/services/agent-resource-search.ts`

流程：

1. Sidecar 接收 `mentions` 后执行 `resolveAgentMentionsForRuntime`
2. 按 `kind + resourceId` 重新拉取候选图片并比对，过滤失效引用
3. 构建 `[MENTIONS_CONTEXT]...[/MENTIONS_CONTEXT]` JSON block 追加到 runtime 文本

降级策略：

- 资源不存在：丢弃该 mention
- 图片不存在：丢弃该图片
- `kind === image` 且未选中图片：自动回退到资源首图
- 不因 mention 失效阻断发送（退化为纯文本/部分引用）

## 7. 相关 API

- `GET /api/agent/resources/search?q=&kinds=&limit=`
- `GET /api/agent/resources/:kind/:id/images`
- `POST /api/agent/sessions/:id/turn`
- `POST /api/agent/sessions/:id/steer`
- `POST /api/agent/sessions/:id/follow-up`

## 8. 已知边界与后续方向

- 当前“输入框态 Alt+Enter”仍是启发式目标选择（未选图优先/最后一个兜底），不是显式点选某个既有 mention。
- 候选二级菜单是 inline 形态，后续可演进为独立浮层（减少列表拥挤、提升可读性）。
- 不同 `kind` 的动作语义已初步分化，后续可继续精细化（例如 scene/model 的默认图选择策略差异化）。
