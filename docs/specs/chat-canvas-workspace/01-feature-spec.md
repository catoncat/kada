# Chat-Canvas Workspace V1（独立会话中心）

> FEATURE_SLUG: `chat-canvas-workspace`

## 背景与目标

- 目标用户：创意策划 / 主理人。
- 核心价值：在 10 分钟内从零产出可复用画布草案。
- 交互主轴：`Chat 驱动画布`，用户输入意图后，系统返回可预览动作卡，用户手动点击应用。
- V1 边界：仅做建议与草案，不直接触发图片生成或任务执行。

## 范围定义

- In Scope：
  - 独立工作台路由 `/workspace`
  - 会话中心（`1 会话 = 1 画布`）
  - 会话 CRUD、消息、画布保存、动作卡应用
  - JSON 导入导出（消息与布局可还原）
  - 无 Provider 时整页禁用与恢复入口
- Out of Scope：
  - 与 Project 自动写回
  - 手绘涂鸦
  - 自动执行任务
  - 多人协作

## 信息架构与页面形态

- 一级导航新增“工作台”。
- 工作台采用固定三栏：
  - 左栏：会话列表
  - 中栏：画布
  - 右栏：Chat + 动作卡
- 焦点规则：
  - 初次进入优先可创建会话
  - 已有会话默认打开最近更新项
  - 消息发送后焦点回到输入框

## 数据模型与持久化

- 新增表：
  - `workspace_sessions`
  - `workspace_messages`
  - `workspace_nodes`
- 关键约束：
  - `workspace_sessions.revision` 作为乐观并发版本号
  - `workspace_messages` 仅保留最近 200 条
  - `workspace_nodes` 保存绝对坐标、尺寸、层级、分组、扩展元信息

## API 契约（/api/workspace）

- `GET /sessions`
- `POST /sessions`
- `GET /sessions/:id`
- `PATCH /sessions/:id`
- `DELETE /sessions/:id`
- `GET /sessions/:id/messages`
- `POST /sessions/:id/messages`
- `PUT /sessions/:id/canvas`
- `POST /sessions/:id/actions/apply`
- `GET /sessions/:id/export`
- `POST /import`

错误码（定稿）：

- `PROVIDER_REQUIRED`
- `SESSION_NOT_FOUND`
- `REVISION_CONFLICT`
- `INVALID_ACTION_CARD`
- `ASSET_NOT_FOUND`
- `INVALID_PAYLOAD`

## 前端能力清单

- 路由：`/workspace`
- 组件：`WorkspaceShell / SessionList / CanvasBoard / ChatPanel / ActionCards / ProviderGate`
- 画布：
  - 平移 / 缩放 / 适配视图
  - 拖拽、框选、多选、分组
  - Undo/Redo（本地栈，至少 50 步）
- Chat 上下文：
  - 注入当前选中节点
  - 支持 `@` 引用场景与模特资产
- 导入导出：
  - JSON 导出
  - JSON 导入并恢复消息与布局

## 状态机（Empty / Loading / Error）

- Empty：
  - 无会话
  - 有消息无节点
- Loading：
  - 会话列表加载
  - 消息发送中
  - 动作卡应用中（仅锁定当前卡）
- Error：
  - `PROVIDER_REQUIRED`
  - `REVISION_CONFLICT`
  - `INVALID_ACTION_CARD`
  - `ASSET_NOT_FOUND`
  - `INVALID_PAYLOAD`

## 验收标准

- [ ] A：完成“输入意图 → 返回动作卡 → 应用动作 → 会话持久化”闭环。
- [ ] B：100 卡片以内支持拖拽、框选、多选、分组、平移缩放、Undo/Redo。
- [ ] C：会话可 JSON 导出与导入，导入后消息与布局可还原。

## 显式假设

- 单用户本地桌面场景。
- V1 不与 Project 直接绑定。
- 消息上限 200。
- 性能目标 100 节点内。
- 无 Provider 时工作台完全禁用。
- 建议生成为同步请求（不走任务队列）。
