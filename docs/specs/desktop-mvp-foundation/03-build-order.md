# Build Order：桌面端 MVP 基础（desktop-mvp-foundation）

> 目标：把 `01-feature-spec.md` + `02-ux-spec.md` 拆成可执行的构建步骤（prompts），用于先计划再编码。

## 约束（必须遵守）

- 不要手改生成/产物：`dist/`、`sidecar/dist/`、`src/routeTree.gen.ts`、`.tanstack/`、`src-tauri/target/`
- 任何契约/API 改动必须同步更新 `docs/engineering/contracts.md` / `docs/engineering/api.md`（先改文档再改代码）
- 本文只产出 prompts，不直接实施编码

## MVP 切片建议（避免范围爆炸）

> 你们已经意识到“自动化 + 版本管理 + AI Agent”很容易超出 MVP，本 build order 按“先把流程内（Lite）闭环跑通，再做全局（Agent）”拆分：

- Phase A（先做）：场景资产 + 项目生成方案 + 预览图 + Image Studio Lite + 版本/清理 + 任务队列
- Phase B（后做）：全局 AI Chat/Skills（Agent）与更强自动化
- Phase C（后做）：道具/服装/提示词预设的完整资产化（在 Phase A 的数据模型上扩展）

---

## Step 1：更新数据契约（Contracts）

- 目标：把“effective prompt 可编辑 + 版本/产物模型（GenerationRun/Artifact）”写入长期稳定契约，作为后续实现的真相源。
- 需要读的文件：
  - `docs/specs/desktop-mvp-foundation/01-feature-spec.md`
  - `docs/engineering/contracts.md`
- 需要改的文件：
  - `docs/engineering/contracts.md`
- Prompt（复制给 Coding Agent）：
  - 先只改文档，不写代码。
  - 在 `docs/engineering/contracts.md` 中新增/补齐：
    - `GenerationRun` / `GenerationArtifact`（图片至少包含：`effectivePrompt`、`promptContext`、`referenceImages`、`editInstruction`、`parentArtifactId`、文件路径、时间戳）
    - “effective prompt 一致性”原则：UI 展示/编辑的 prompt 必须与服务端实际使用的 prompt 一致（服务端需回显）。
    - 版本指针（ActivePointer）的最小表达（项目/资产的“当前版本”如何定义）。
  - 文档必须能支撑：Image Studio Lite、方案预览图、版本清理。
- 自测命令：
  - `pnpm lint`（只验证 Markdown 里是否引入明显格式问题；可选）
- 完成定义：
  - `docs/engineering/contracts.md` 明确写出：图片版本元信息字段、版本关系与 effective prompt 规则。

## Step 2：更新 API 参考（API）

- 目标：定义最小可用的版本管理与图片产物 API（供 UI 与任务队列复用）。
- 需要读的文件：
  - `docs/specs/desktop-mvp-foundation/01-feature-spec.md`
  - `docs/specs/desktop-mvp-foundation/02-ux-spec.md`
  - `docs/engineering/api.md`
- 需要改的文件：
  - `docs/engineering/api.md`
- Prompt（复制给 Coding Agent）：
  - 先只改文档，不写代码。
  - 在 `docs/engineering/api.md` 补齐/新增：
    - 图片生成/编辑的统一入口（可继续复用 `/api/ai/generate-image`，但需要支持并回显 `effectivePrompt`/`promptContext`）
    - 版本管理 API（最小集）：
      - 列表：按 `projectId`/`assetId` 拉版本（含缩略图、时间、来源）
      - 切换：设为当前版本
      - 删除：删除单个版本（同时清理文件；对当前版本需二次确认）
    - 产物落盘方案：AI 生成的 base64 图片如何变成 `/uploads/...` 文件（新增 base64 上传端点或 artifacts 端点）
  - 明确：哪些接口用于 UI，哪些用于任务队列/worker；但二者调用的“能力层”要一致（AI 原生原则）。
- 自测命令：
  - `pnpm lint`（可选）
- 完成定义：
  - `docs/engineering/api.md` 里能清楚回答：前端怎么拿到版本列表、怎么切换/删除、AI 图怎么落盘并回显 prompt。

## Step 3：为版本/产物新增 DB Schema + 迁移

- 目标：在 Sidecar SQLite 引入最小的版本/产物表，避免把大图 base64 直接塞进 JSON 字段。
- 需要读的文件：
  - `sidecar/src/db/schema.ts`
  - `agent_docs/sidecar.md`
  - `docs/engineering/contracts.md`
- 需要改的文件：
  - `sidecar/src/db/schema.ts`
  - `sidecar/drizzle/*`（通过 drizzle-kit 生成迁移文件；不要手写）
- Prompt（复制给 Coding Agent）：
  - 在 `sidecar/src/db/schema.ts` 新增（或等价实现）：
    - `generation_runs`
    - `generation_artifacts`
    - （如需要）`project_plan_versions`（方案版本；项目表只存当前版本指针）
  - 表字段以 `docs/engineering/contracts.md` 为准：图片产物必须能存 effectivePrompt/promptContext/parentArtifactId/文件路径等。
  - 生成并执行迁移（在 `sidecar/` 下）：
    - `pnpm db:generate`
    - `pnpm db:migrate`
  - 注意迁移对已有数据的兼容（允许空值/渐进补齐）。
- 自测命令：
  - `cd sidecar && pnpm db:generate`
  - `cd sidecar && pnpm db:migrate`
  - `pnpm validate`
- 完成定义：
  - 本地数据库迁移成功；新表可在 Drizzle Studio 中看到（可选 `cd sidecar && pnpm db:studio`）。

## Step 4：实现“图片产物落盘 + 元信息入库”的后端能力

- 目标：把 AI 返回的 base64 图片保存为本地文件，并创建 artifact 记录；返回给前端可用的 `artifactId/path/effectivePrompt`。
- 需要读的文件：
  - `sidecar/src/routes/upload.ts`
  - `sidecar/src/routes/ai.ts`
  - `sidecar/src/worker/handlers/image-generation.ts`
  - `sidecar/src/index.ts`
- 需要改的文件：
  - `sidecar/src/routes/*`（新增如 `artifacts.ts` / `versions.ts`，或扩展现有 upload/ai 路由；按你选择）
  - `sidecar/src/worker/handlers/image-generation.ts`
  - `sidecar/src/db/schema.ts`（若需要补字段）
- Prompt（复制给 Coding Agent）：
  - 目标是把“生成图片”从“只返回 base64”升级为“返回可持久化的 artifact”：
    - worker 处理 `image-generation` 任务时：
      - 调用 provider 生成图片（可能带 referenceImages）
      - 将图片写入 `data/uploads/`（复用 sharp 压缩策略）
      - 写入 `generation_artifacts`（保存 effectivePrompt/promptContext/parentArtifactId 等）
      - task.output 返回 `artifactId + filePath + mimeType + effectivePrompt`
  - 确保：
    - 失败时 error 可读
    - 不在日志里输出敏感信息（apiKey）
- 自测命令：
  - `pnpm dev:sidecar`
  - （可选）用 curl/前端触发一张图，确认能在 `/uploads/*` 打开
- 完成定义：
  - 生成图片后，数据库里能看到 artifact 记录；文件系统里有对应图片文件；返回包含 effectivePrompt。

## Step 5：打通“方案版本 + 自动预览图（封面+N）”的任务链路

- 目标：方案生成产生“方案版本”，并自动排队生成预览图（默认封面+N，支持取消/重试）。
- 需要读的文件：
  - `sidecar/src/routes/projects.ts`
  - `sidecar/src/worker/handlers/plan-generation.ts`
  - `sidecar/src/worker/index.ts`
  - `src/routes/project.$id.index.tsx`
  - `src/routes/project.$id.result.tsx`
- 需要改的文件：
  - `sidecar/src/worker/handlers/plan-generation.ts`
  - `sidecar/src/routes/projects.ts`（如需新增版本相关端点）
  - `sidecar/src/db/schema.ts`（若引入 `project_plan_versions`）
- Prompt（复制给 Coding Agent）：
  - 将当前“覆盖写入 projects.generatedPlan”的方式改为“写入方案版本 + 更新 current pointer”（实现方式以 schema 为准）。
  - 方案版本写入后，按策略自动创建预览图任务：
    - 默认：封面（第 1 场景）+ 前 N 张（例如 2–4）
    - 任务关联：relatedId=projectId，relatedMeta=版本信息
  - 注意：自动化要可控
    - 任务队列可见
    - 支持取消后续排队（至少 UI 侧能停止创建任务；更进阶可做服务端取消）
- 自测命令：
  - `pnpm dev:all`
- 完成定义：
  - 生成方案后：项目有“版本”；任务队列出现预览图任务；完成后方案页能看到预览图。

## Step 6：前端增加“版本/产物”类型与 API Client/Hook

- 目标：前端用强类型调用版本与产物 API，供 Image Studio/方案页复用。
- 需要读的文件：
  - `src/lib/api-config.ts`
  - `src/lib/tasks-api.ts`
  - `src/hooks/useTasks.ts`
  - `src/lib/scene-assets-api.ts`
- 需要改的文件：
  - `src/types/*`（新增 generation/version 类型）
  - `src/lib/*`（新增 artifacts/versions API client）
  - `src/hooks/*`（新增 useArtifacts/useVersions）
- Prompt（复制给 Coding Agent）：
  - 新增 TS 类型：`GenerationArtifact`、`GenerationRun`、（可选）`PlanVersion`
  - 新增 API client：支持
    - 拉版本列表
    - 设为当前版本
    - 删除版本
  - 扩展 tasks 类型：让 `image-generation` task.output 支持 artifactId/path/effectivePrompt
- 自测命令：
  - `pnpm typecheck`
  - `pnpm validate`
- 完成定义：
  - 前端可通过 hooks 拉到版本列表，并能在 devtools/network 看到请求成功。

## Step 7：实现 Image Studio Lite（通用图片生成/编辑组件）

- 目标：在“需要出图”的页面复用同一组件，满足：展示图、展示/编辑 effective prompt、重新生成/重新编辑、版本切换/删除、任务进度。
- 需要读的文件：
  - `docs/specs/desktop-mvp-foundation/02-ux-spec.md`
  - `src/components/ImageUploader.tsx`
  - `src/components/TaskQueueDrawer.tsx`
  - `src/routes/project.$id.result.tsx`
- 需要改的文件：
  - `src/components/*`（新增 `ImageStudioLite.tsx` 或目录；按项目风格命名）
  - 相关样式/小组件（如需要）
- Prompt（复制给 Coding Agent）：
  - 组件能力（按 UX Spec 的“渐进披露”）：
    - 默认态：图片 + 主要按钮（生成/重新生成/重新编辑）+ 状态
    - 折叠区：effective prompt 编辑器（可复制）+ 版本列表（缩略图/时间）+ 删除/设为主图
  - 数据一致性：
    - 点击生成后，服务端回显 effectivePrompt；UI 更新为回显值（避免不一致）
  - 交互要求：
    - 删除当前版本要二次确认
    - 失败显示在组件内，不只 toast
- 自测命令：
  - `pnpm dev`
  - `pnpm validate`
- 完成定义：
  - 任意页面挂载组件后：能生成图片并看到版本列表；prompt 可编辑且可再生成。

## Step 8：在“场景资产”流程里接入 Image Studio Lite（Lite，不做强引导）

- 目标：在场景资产的创建/编辑或详情中，让用户能对图片做“生成/重新生成/版本管理”，并可设为主图。
- 需要读的文件：
  - `src/routes/assets.scenes.tsx`
  - `src/components/assets/SceneForm.tsx`
  - `src/components/assets/SceneCard.tsx`
- 需要改的文件：
  - `src/components/assets/SceneForm.tsx`（或改为新增场景详情页；按你选择）
  - `src/components/assets/*`
- Prompt（复制给 Coding Agent）：
  - 在不破坏当前表单结构的前提下接入 Image Studio Lite：
    - 让用户对主图进行 AI 编辑/生成并形成版本
    - 设为主图后写回 `primaryImage`
  - UI 保持极简：默认只显示主按钮与当前图；prompt/版本放折叠区。
- 自测命令：
  - `pnpm dev:all`
- 完成定义：
  - 场景资产中可生成/编辑图片并设为主图；刷新后仍能回显（从 DB/文件读取）。

## Step 9：在“方案查看页”接入预览图与批量生成（封面+N/全部）

- 目标：方案页每个场景卡片都能看到预览图，并能打开 Image Studio Lite 修改 prompt 后重新生成；支持批量生成与取消。
- 需要读的文件：
  - `src/routes/project.$id.result.tsx`
  - `src/routes/project.$id.index.tsx`
  - `src/contexts/TaskQueueContext.tsx`
- 需要改的文件：
  - `src/routes/project.$id.result.tsx`
  - （可能）`src/lib/projects-api.ts`（新增版本/预览图相关调用）
- Prompt（复制给 Coding Agent）：
  - 为每个场景卡片：
    - 展示预览图（无则占位）
    - 展示“查看/编辑提示词”折叠区（effective prompt 可编辑）
    - 集成 Image Studio Lite（对该场景生成/重新生成）
  - 批量生成：
    - 有二次确认（提示额度/耗时）
    - 显示进度（x/y），支持取消后续任务创建
  - 错误恢复：单张失败不影响其它场景。
- 自测命令：
  - `pnpm dev:all`
- 完成定义：
  - 方案页可批量生成预览图；单张可编辑 prompt 后重新生成；任务队列可见且可恢复。

> 关键默认规则（已决策，落地时必须遵守）：
> - 自动预览图属于“额外消耗额度”的自动化：首次触发前必须弹一次授权并可记住选择（关 / 封面+N / 全部）；MVP 固定 `N=3`（ADR 0003）

## Step 10：提供“版本管理与清理”最小 UI

- 目标：让用户能查看/切换/删除方案版本与图片版本，并能清理释放空间（最小可用，不做复杂 diff）。
- 需要读的文件：
  - `docs/specs/desktop-mvp-foundation/01-feature-spec.md`
  - `docs/specs/desktop-mvp-foundation/02-ux-spec.md`
  - `src/components/ui/dialog`（现有对话框模式）
- 需要改的文件：
  - `src/routes/project.$id.result.tsx`（增加版本入口）
  - `src/components/*`（新增版本管理弹窗/面板）
  - `sidecar/src/routes/*`（若缺少删除/切换端点）
- Prompt（复制给 Coding Agent）：
  - UI 要求：
    - 常显“当前版本 + 历史数量”
    - 允许删除任何版本；删除当前版本必须二次确认，并在确认中明确“将自动回退到最近版本；若无版本则进入空状态”（ADR 0004）
    - 删除后立即回显释放空间（MVP 可先显示“已删除 n 个版本”+ 估算大小）
  - 数据要求：
    - 删除要清理 DB 记录 + 文件系统文件
    - 若删除失败，错误必须可读并给出下一步
- 自测命令：
  - `pnpm validate`
  - `pnpm tauri:dev`（可选：验证桌面壳下文件路径/权限）
- 完成定义：
  - 用户可以在 UI 中切换版本、删除版本；删除后刷新不会再出现；磁盘文件被清理。

## Step 11（可选 / Phase B）：实现全局 AI Chat（Agent + Skills）骨架

- 目标：先实现“可控执行”的最小闭环：AI 给出计划与动作清单，用户确认后调用后端 API 执行（只做低风险动作）。
- 需要读的文件：
  - `docs/specs/desktop-mvp-foundation/01-feature-spec.md`
  - `docs/specs/desktop-mvp-foundation/02-ux-spec.md`
  - `src/routes/__root.tsx`
  - `docs/engineering/api.md`
- 需要改的文件：
  - `src/components/*`（AI 面板）
  - `sidecar/src/routes/*`（skills 执行入口；或复用现有 API）
- Prompt（复制给 Coding Agent）：
  - 先做“只读建议”→“低风险可执行”两档：
    - 低风险动作示例：创建项目、创建草稿资产、更新标签（不允许删除/批量覆盖）
  - 每次执行都写入执行记录（可在任务队列/日志中看到）。
- 自测命令：
  - `pnpm dev:all`
- 完成定义：
  - 用户可打开 AI 面板，输入自然语言，看到动作卡片并确认执行，执行结果反映到 UI。

## Step 12：回归验证与收尾

- 目标：用最小的验证矩阵确保不回归（任务队列、生成、版本、清理、设置）。
- 需要读的文件：
  - `docs/specs/desktop-mvp-foundation/01-feature-spec.md`
  - `docs/specs/desktop-mvp-foundation/02-ux-spec.md`
- 需要改的文件：
  - （可选）新增/补齐 Vitest 测试文件：按实现涉及范围决定
- Prompt（复制给 Coding Agent）：
  - 跑基础校验：`pnpm validate`、`pnpm test:run`
  - 跑联调：`pnpm dev:all`（必要时 `pnpm tauri:dev`）
  - 手工验证关键路径（至少 10 分钟可完成）：
    - 无 Provider 的错误恢复
    - 生成方案 → 自动预览图 → 批量取消 → 单张重试
    - effective prompt 编辑后再生成，且回显一致
    - 删除版本/清理文件后刷新仍正确
- 自测命令：
  - `pnpm validate`
  - `pnpm test:run`
  - `pnpm dev:all`
  - `pnpm tauri:dev`（可选）
- 完成定义：
  - 关键路径通过；无明显 console error；文档与实现一致。
