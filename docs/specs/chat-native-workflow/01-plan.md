# Chat-Native AI 工作流重构计划（去“项目”概念）

## 1. 文档目的
将现有“项目驱动”流程重构为“会话驱动”流程，用户仅通过自然对话完成：
- 选场景
- 选模特
- 生成分镜文案
- 基于分镜+参考图优化提示词
- 生成最终照片

并确保系统具备可追踪、可恢复、可迭代能力。

## 2. 最终决策（已锁定）
1. 开发阶段不考虑历史兼容，可全新设计接口与数据模型。
2. 对外仅提供原子能力 API/Tool，不做公开阶段化 API。
3. 流程编排由 Skills 主导（AI 为核心）。
4. Guardrails 只做硬安全约束，不做重流程管控。
5. 单会话可多任务，支持连续迭代。
6. 关键确认采用混合交互：卡片确认优先，纯文本兜底。
7. 自动快照点：分镜确认后、出图成功后。
8. 默认出图策略：先生成 1 张可用图，再支持变体扩展。
9. 失败策略：同动作自动重试 1 次，失败后提供替代路径。

## 3. 产品体验目标
### 3.1 用户视角
用户无需“创建项目”，直接在 chat 中表达目标，例如：
- “我想拍一组新春氛围的人像，偏温暖电影感。”
系统应自动推进流程并在关键节点确认。

### 3.2 成功标准
1. 从模糊需求到首图成功，平均对话轮次可控。
2. 用户可以中途改需求且不会“流程断裂”。
3. 失败后有明确恢复动作，不出现“卡死”状态。
4. 所有关键产物都能版本化与回退。

## 4. 目标架构

### 4.1 三层结构
1. 原子能力层（API + Tool）
- resource：资源搜索/候选/确认
- copy：分镜生成/改写
- photo：提示词组装/生图任务/状态查询
- snapshot：快照创建/恢复

2. Skills 编排层
- orchestrator-main（主编排）
- resource-subskill
- storyboard-subskill
- image-subskill

3. Guardrails 层（硬约束）
- 参数完整性校验
- 非法资源拦截
- 危险输入拦截
- 数据一致性保护

### 4.2 设计原则
1. AI-native：决策由 skills 驱动。
2. 可扩展：新增能力只需新增原子 API/tool + 子 skill。
3. 可调试：全链路 trace + 轻量状态锚点。

## 5. 原子能力接口规划

### 5.1 Resource
- `resource.searchScenes(query, limit=3)`
- `resource.searchModels(query, limit=3)`
- `resource.confirmSelection(sceneId, modelId, note?)`

### 5.2 Copy
- `copy.generateStoryboard(input)`
- `copy.reviseStoryboard(storyboardId, instruction)`

### 5.3 Photo
- `photo.composePrompt({ storyboardId, sceneRefs, modelRefs, style, ratio })`
- `photo.enqueueGeneration({ promptId, count=1 })`
- `photo.getGenerationStatus(taskId)`
- `photo.generateVariants({ artifactId, count })`

### 5.4 Snapshot
- `snapshot.create({ type, sourceIds, label? })`
- `snapshot.list(sessionId)`
- `snapshot.restore(snapshotId)`

## 6. 会话状态与数据模型（全新）

### 6.1 `chat_state_anchor`
每会话轻量状态锚点，字段建议：
- `last_confirmed_scene_id`
- `last_confirmed_model_id`
- `last_storyboard_id`
- `last_prompt_id`
- `last_artifact_id`
- `last_retry_meta`
- `updated_at`

### 6.2 `chat_work_items`
记录会话中每个执行单元（候选、确认、分镜、出图任务）。

### 6.3 `chat_snapshots`
快照记录：
- `snapshot_id`
- `session_id`
- `storyboard_ref`
- `prompt_ref`
- `artifact_refs`
- `label`
- `created_at`

### 6.4 `chat_artifact_links`
关联分镜、prompt、图片等产物关系，支持回溯和恢复。

## 7. Skills 编排规范

### 7.1 主编排 Skill：`orchestrator-main`
职责：
1. 理解用户意图。
2. 判断下一步调用哪个原子能力。
3. 何时发起确认。
4. 失败时选择重试或替代路径。

### 7.2 子 Skills
1. `resource-subskill`：候选生成（3个+1推荐）
2. `storyboard-subskill`：输出结构化分镜
3. `image-subskill`：提示词优化、出图、变体生成

### 7.3 编排约束
1. Skills 可自由决策流程。
2. Guardrails 仅拦截“不可执行动作”，不强制阶段顺序。

## 8. 交互协议

### 8.1 关键确认点
1. 资源确认：场景 + 模特
2. 出图前确认：最终 prompt + 参数摘要

### 8.2 确认交互模式
1. 卡片按钮确认（默认）
2. 文本确认兜底（如“用推荐方案继续”）

### 8.3 缺信息策略
用户信息不足时：
1. 先给 3 个候选 + 1 个推荐。
2. 若仍不明确，发起一轮最小追问。

## 9. 快照与恢复策略

### 9.1 自动快照
1. 分镜确认后自动创建文本快照。
2. 出图成功后创建完整快照（分镜+prompt+图片）。

### 9.2 手动快照
用户可要求：
- “把这个版本存下来”
- “回到上一个版本再改”

### 9.3 恢复后行为
恢复不会新建项目，仅在当前会话继续迭代，skills 自动读取恢复锚点。

## 10. 错误恢复与重试

### 10.1 默认策略
1. 同动作自动重试 1 次。
2. 仍失败则返回替代路径卡片：
- 换候选
- 微调分镜
- 降级参数出图
- 直接重组提示词

### 10.2 反馈规范
所有失败都返回：
- `taskId`（如有）
- 失败摘要
- 下一步建议动作

## 11. 可观测性与追踪

### 11.1 必须记录的链路
1. 用户输入
2. skills 决策
3. tool 调用与结果
4. guardrail 拦截
5. SSE 事件
6. 前端 commit 渲染

### 11.2 关键事件建议
- `planner.decision.made`
- `tool.invoked`
- `tool.completed`
- `guardrail.blocked`
- `snapshot.created`
- `snapshot.restored`
- `image.generation.completed`

## 12. 实施计划（Build Order）

### Phase A：基础骨架
1. 新数据模型与基础存储。
2. 原子 API 的统一输入输出 schema。
3. trace 字段补齐。

### Phase B：能力接入
1. Resource/Copy/Photo/Snapshot 原子能力打通。
2. Tool 注册与调用链打通。

### Phase C：Skills 编排
1. 主编排 skill + 子 skill 接入。
2. 混合确认交互接入。
3. 缺信息候选推荐逻辑接入。

### Phase D：恢复与体验
1. 快照自动创建与恢复。
2. 失败重试与替代路径。
3. 变体出图流程。

### Phase E：验收与稳定性
1. E2E 场景测试。
2. 压测与异常注入测试。
3. 体验调优与指标基线。

## 13. 测试验收清单

1. 模糊需求可在会话内完成首图闭环。
2. 用户中途改需求（换模特/换风格）可继续推进。
3. 卡片确认和文本确认都能生效。
4. 分镜快照与图片快照均可恢复。
5. 失败重试一次后有替代路径。
6. `taskId/artifactId` 全链路可追踪。

## 14. 风险与缓解

1. 风险：skills 过度自由导致行为漂移
- 缓解：skill 输出结构化 action + 关键 guardrails

2. 风险：无阶段 API 可能难调试
- 缓解：保留轻量状态锚点和强 trace 事件

3. 风险：候选质量不稳定
- 缓解：推荐策略可配置 + prompt 模板迭代

## 15. 默认参数（首版）
1. 候选数量：3
2. 推荐数量：1
3. 首次出图：1 张
4. 自动重试：1 次
5. 快照自动创建：2 次（分镜确认后、出图成功后）
