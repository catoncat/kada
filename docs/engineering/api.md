# Sidecar API 参考（/api）

Sidecar 在开发期监听 `http://localhost:3001`，前端通过 Vite proxy 以相对路径 `/api/*` 访问。

注意：打包到 Tauri 后，相对路径 `/api/*` 是否仍可用需要明确（见 `docs/refactor/known-issues.md`）。

## 标记约定

- （已实现）：当前代码可直接调用
- （规划中）：作为 Phase A/后续的目标契约，先写文档再落地

## 健康检查（已实现）

- `GET /health` → `{ status: "ok", timestamp }`

## Upload（已实现）

- `POST /api/upload`（`multipart/form-data`：`file`）→ `{ filename, path, size }`
- `DELETE /api/upload/:filename` → `{ success: true }`

## Tasks（已实现）

通用异步任务队列接口（轮询式）。`input/output` 均为 JSON。

- `POST /api/tasks`
  - 请求：`{ type: string, input: object, relatedId?: string, relatedMeta?: string }`
  - 响应：`{ task: { id, type, status: "pending" } }`
- `GET /api/tasks/:id` → `{ task }`
- `GET /api/tasks?status=pending,running,completed,failed&type=...&relatedId=...&limit=50` → `{ tasks }`
- `DELETE /api/tasks/:id` → `{ success: true }`（`running` 任务不可删）
- `POST /api/tasks/:id/retry`（规划中，见 ADR 0005）
  - 语义：创建一个“重试任务”（新 task id），复制原任务的 `type + input + relatedId/relatedMeta`，并保留原失败任务记录不变
  - 响应：`{ task: { id, type, status: "pending" }, retryOfTaskId: string }`
- `GET /api/tasks/:id/detail`（已实现，task-replay-center）
  - 语义：返回任务复盘详情聚合视图（`task + run + artifacts + timeline + recoveryContext`）
  - 响应：`{ detail: TaskDetailView }`
  - 404 语义：任务不存在时返回 `{ error }`；前端使用深链备用参数（`sourceType/relatedId/owner*`）展示可恢复页
- `POST /api/tasks/:id/replay`（已实现，task-replay-center）
  - 请求：`{ requestId: string }`
  - 语义：复制原任务参数创建新任务；原任务不变；支持幂等去重
  - 响应：`{ task: { id, type, status }, replayOfTaskId: string, deduped: boolean }`
- `POST /api/tasks/batch-status`（用于批量轮询）
  - 请求：`{ ids: string[] }`
  - 响应：`{ tasks }`

### Replay 定稿策略（task-replay-center）

- 按任务类型分流：
  - `plan-generation`：有可用文本能力（在线或本地降级）时允许 replay
  - `image-generation`：无可用图片能力（无 Provider / 无 Key / 模型不支持 image）时阻断 replay，并返回可恢复错误
- 幂等要求：
  - `requestId` 为必填幂等键
  - 推荐幂等窗口：`30-60s`
  - 命中去重时返回同一 `taskId` 且 `deduped=true`
- 错误码建议：
  - `400`：原任务不可重放（输入缺失/类型不支持）
  - `401/403`：鉴权失败
  - `404`：原任务不存在
  - `409`：请求冲突（可选，若实现锁语义）
  - `500`：内部异常

### 任务类型约定（规划中，Phase A）

> 目标：把“生成方案/生成图片”统一收敛到任务队列，并让产物落盘进入版本系统（见 `docs/engineering/contracts.md`）。

- `plan-generation`
  - input：`{ projectId: string, providerId?: string, customPrompt?: string }`
  - output（规划）：`{ planVersionId: string }`（并自动创建预览图相关任务）
- `image-generation`
  - input（规划）：`{ prompt: string, providerId?: string, referenceImages?: string[], options?: object, owner?: object, parentArtifactId?: string }`
  - output（规划）：`{ artifactId: string, filePath: string, mimeType: string, effectivePrompt: string }`
  - 说明：`referenceImages` 支持 `data:`、`http(s):`、以及本地 `/uploads/*` 路径（用于文+图生图；模型不支持时会被忽略）。

## Assets（已实现）

目前先实现"场景资产（scenes）"闭环。

- `GET /api/assets/scenes` → `{ data: SceneAsset[], total }`
- `GET /api/assets/scenes/:id` → `SceneAsset`
- `POST /api/assets/scenes` → `SceneAsset`
- `PUT /api/assets/scenes/:id` → `SceneAsset`
- `DELETE /api/assets/scenes/:id` → `{ success: true }`

### 模特资产（已实现）

模特资产支持全局（`projectId` 为空）和项目专属（`projectId` 非空）两种。查询时可传 `?projectId=xxx` 返回"全局 + 项目专属"合集。

- `GET /api/assets/models?projectId=xxx` → `{ data: ModelAsset[], total }`
- `GET /api/assets/models/:id` → `ModelAsset`
- `POST /api/assets/models` → `ModelAsset`
  - 请求：`{ name, gender?, ageRangeMin?, ageRangeMax?, description?, appearancePrompt?, primaryImage?, referenceImages?, tags?, projectId? }`
- `PUT /api/assets/models/:id` → `ModelAsset`
- `DELETE /api/assets/models/:id` → `{ success: true }`
- `POST /api/assets/models/auto-match`
  - 请求：`{ projectId: string, people: Array<{ id, role, gender?, age? }> }`
  - 响应：`{ matches: Record<personId, Array<{ modelId, name, score }>> }`
  - 说明：按性别（+50）、年龄范围（+40）、同项目（+10）打分，每人返回 Top-3

## Projects（已实现）

- `GET /api/projects` → `{ data: Project[], total }`
- `GET /api/projects/:id` → `Project`
- `POST /api/projects` → `Project`
- `PUT /api/projects/:id` → `Project`
- `DELETE /api/projects/:id` → `{ success: true }`

### 生成方案（已实现，后续会版本化）

- `POST /api/projects/:id/generate`
  - 请求：`{ mode?: "preview" | "execute", customPrompt?: string }`
  - 响应：
    - `mode=preview`：`{ prompt: string }`（只返回 prompt，不创建任务）
    - `mode=execute`：`{ taskId: string, status: "pending" | "running", message: string }`（创建/复用任务）

### 获取项目相关任务（已实现）

- `GET /api/projects/:id/tasks` → `{ tasks: Task[] }`

## AI 网关（/api/ai）（已实现）

这组接口用于直接调用 Provider。Phase A 起，建议 UI 侧把“会产生版本/需要落盘的生成类动作”逐步迁移到 `Tasks + Artifacts` 模型中，而不是长期依赖 base64。

### `POST /api/ai/models`（已实现）

请求（两种方式二选一）：

- `{ provider: { format, baseUrl, apiKey, textModel, imageModel } }`
- 或 `{ providerId: "<id>" }`（从 Sidecar DB 读取；若不传则取默认 Provider）

响应：`{ models: [{ id, name, description? }] }`

### `POST /api/ai/generate`（已实现）

请求：`{ prompt: string, provider?: Provider, providerId?: string }`  
响应：`{ text: string }`

### `POST /api/ai/generate-image`（已实现，兼容期）

请求：`{ prompt: string, provider?: Provider, providerId?: string, referenceImages?: string[], options?: object }`  
响应：`{ imageBase64: string, mimeType: string }`

> 规划：后续由 worker 统一落盘并返回 `GenerationArtifact`（`artifactId/filePath/effectivePrompt`），避免前端长期持有 base64。

### `POST /api/ai/test`（已实现）

请求：`{ format, baseUrl, apiKey, model }`  
响应：`{ success: boolean, message: string }`

## Providers（/api/providers）（已实现）

注意：当前前端可能仍在 localStorage 维护 provider；但 Sidecar 已提供完整 CRUD（便于桌面端统一管理与未来 Agent 复用）。

- `GET /api/providers` → `{ providers: Provider[] }`
- `GET /api/providers/default` → `{ provider: Provider | null }`
- `GET /api/providers/:id` → `{ provider: Provider }`
- `POST /api/providers` → `{ provider: Provider }`
- `PUT /api/providers/:id` → `{ provider: Provider }`
- `DELETE /api/providers/:id` → `{ success: true }`
- `POST /api/providers/:id/set-default` → `{ success: true }`

## Settings（/api/settings）（已实现）

键值存储；`value` 支持 JSON 自动序列化/反序列化。

- `GET /api/settings/:key` → `{ key, value }`（不存在则 `value: null`）
- `PUT /api/settings/:key` → `{ key, value }`（upsert）
- `DELETE /api/settings/:key` → `{ success: true }`
- `POST /api/settings/batch` → `{ data: Record<string, unknown> }`

### 推荐的设置键（规划中）

- `auto_preview_images_policy`: `"off" | "cover_plus_n" | "all"`（见 ADR 0003）
- `auto_preview_images_n`: number（可选；未设置时默认 `3`；见 ADR 0003）

## Prompts（/api/prompts）（已实现）

用于在 UI 侧预览“服务端拼接后的 `effectivePrompt`”（不会创建任务/不会生成图片）。

- `POST /api/prompts/preview-image`
  - 请求：`{ prompt: string, owner?: { type: 'asset' | 'projectPlanVersion' | 'planScene', id: string, slot?: string }, editInstruction?: string }`
  - 响应：`{ effectivePrompt: string, rule: { key: string, id: string }, renderedBlocks: Array<{ id: string, kind: string, label: string, text: string }>, promptContext?: object }`

## Generations / Artifacts / Versions（规划中，Phase A）

> 目标：让 UI 的“Image Studio Lite / 方案预览图 / 版本清理”与未来 Phase B 的 Agent 复用同一套“能力层 API”。

建议新增（或等价实现）最小集：

- 版本列表：
  - `GET /api/artifacts?ownerType=...&ownerId=...&slot=...` → `{ artifacts: GenerationArtifact[], currentArtifactId?: string }`
- 切换当前版本：
  - `POST /api/artifacts/:artifactId/set-current` → `{ success: true }`
- 删除版本（含文件清理）：
  - `DELETE /api/artifacts/:artifactId` → `{ success: true }`（删除当前版本需二次确认/遵循回退规则）

方案版本（可先做项目级，不做复杂 diff）：

- `GET /api/projects/:id/plan-versions` → `{ versions, currentVersionId }`
- `POST /api/projects/:id/plan-versions/:versionId/set-current` → `{ success: true }`
- `DELETE /api/projects/:id/plan-versions/:versionId` → `{ success: true }`
