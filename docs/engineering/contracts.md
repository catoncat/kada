# 数据契约（建议重构时优先稳定的部分）

本文件描述“外部可见/需要长期稳定”的数据结构：预案 JSON、Provider 配置、本地存储键、生成/版本/产物（artifacts），以及导出对图片的约束。

## 1) 单预案（Single Plan）

来源：LLM 返回的 JSON（中文字段 + `visualPrompt` 英文），再由前端补充 `id/createdAt` 用于历史记录。

最小结构：

```json
{
  "id": "1700000000000",
  "createdAt": 1700000000000,
  "title": "预案名称",
  "theme": "核心主题",
  "creativeIdea": "创意思路（中文）",
  "copywriting": "核心文案（中文）",
  "scenes": [
    {
      "location": "场景名称",
      "description": "场景描述（中文）",
      "shots": "镜头建议（中文）",
      "visualPrompt": "English prompt ..."
    }
  ]
}
```

相关类型：`src/types/single-plan.ts`、`src/lib/ppt-exporter.ts`（`ShootingPlan`）。

## 2) 项目预案（Project Plan：三套服装）

特点：固定每套 4 场景（主场景、叠搭A、叠搭B、纯色版面），并包含客户信息与服装输入。

关键字段（精简展示）：

```json
{
  "id": "1700000000000",
  "createdAt": 1700000000000,
  "client": { "age": 1, "gender": "不限", "usage": "电商" },
  "outfits": [{ "id": "o1", "name": "Look 1", "styleTags": [] }],
  "plans": [
    {
      "outfitId": "o1",
      "themeTitle": "这一套的主题名",
      "theme": "核心主题",
      "scenes": [
        { "type": "主场景", "location": "...", "visualPrompt": "..." },
        { "type": "叠搭A", "location": "...", "visualPrompt": "..." },
        { "type": "叠搭B", "location": "...", "visualPrompt": "..." },
        { "type": "纯色版面", "location": "...", "cutoutSpec": { "background": "...", "lighting": "...", "framing": "..." } }
      ]
    }
  ]
}
```

相关类型：`src/types/project-plan.ts`。

## 2.1) 项目（Project）上下文（长期稳定建议）

Project 是各类 AI 能力的“上下文容器”。为了保证风格一致、可追溯，Project 至少需要包含：

- `title`：项目名称
- `projectPrompt`：项目级提示词（可为空；会参与所有出图/生成的上下文拼接）
- `customer`：客户信息（人物列表 + 备注）
- `selectedScene`：已选场景资产 ID（作为背景环境约束）
- `generatedPlan`：AI 生成的分镜结构（包含每个场景的 `visualPrompt` 等）

说明：

- `projectPrompt` 与 `prompt_templates`（全局工作室提示词）是不同层级：前者按项目覆盖，后者是全局默认风格/约束。
- 图片生成时，前端传入的 `prompt` 只是 draft；服务端会拼接上下文得到 `effectivePrompt` 并回显。

## 3) Provider 配置（前端当前实现）

Provider 在前端 localStorage 存储，并在每次请求时随 body 发送给 Sidecar（当前 UI 未使用 Sidecar 的 providers 表）。

最小字段：

- `format`: `'gemini' | 'openai' | 'local'`
- `baseUrl`, `apiKey`, `textModel`, `imageModel`

相关文件：`src/types/provider.ts`、`src/lib/provider-storage.ts`、`sidecar/src/routes/ai.ts`。

## 4) 本地存储键（localStorage）

- `shooting_history`：预案历史（`PlanRecord[]`，上限 20）
- `shooting_recent_topics_v1`：最近主题（字符串数组，上限 8）
- `shooting_topic_examples_v1`：示例主题（字符串数组，上限 16）
- `ai_providers`：Provider 列表与默认值
- 兼容迁移旧键：`gemini_mode`、`gemini_api_key`、`gemini_base_url`

## 5) 图片与导出约束

- 图片生成的长期契约（建议）：
  - Sidecar 返回 **可持久化产物**（`GenerationArtifact`），包含 `filePath/mimeType/effectivePrompt/...`，前端以 `/uploads/*` 形式渲染。
  - 如需导出（PPT/其它格式），导出器可在导出时将本地文件转换为 dataURL/二进制再嵌入。
- 兼容期说明：
  - 当前实现仍可能返回 `{ imageBase64, mimeType }`；但这不应成为长期依赖（会导致内存占用高、难以版本化与清理）。
- 现存实现约束（待重构清理）：
  - 项目模式的图片索引目前使用 `sceneKey = lookIndex * 100 + sceneIndex`（隐含假设：每套场景数量很小且稳定）。

## 6) 生成与版本（GenerationRun / GenerationArtifact）

> 目标：支撑“流程内 Image Studio Lite + 方案预览图 + 版本管理与清理”，并为 Phase B 的 Agent/skills 复用同一套能力层契约。

### 6.1 GenerationRun（一次生成动作）

`GenerationRun` 表示一次“生成类动作”的执行记录（可能由 UI 触发，也可能由 worker/Agent 触发）。

最小结构（建议）：

```json
{
  "id": "gr_...",
  "kind": "plan-generation | image-generation | image-edit | asset-caption",
  "trigger": "ui | worker | agent",
  "status": "queued | running | succeeded | failed | canceled",
  "relatedType": "project | asset",
  "relatedId": "p_... | a_...",
  "effectivePrompt": "string (image-only)",
  "promptContext": {},
  "parentRunId": "gr_... (optional)",
  "createdAt": 1700000000000,
  "error": { "message": "..." }
}
```

说明：

- `effectivePrompt` 仅对图片类 run 有意义（文本生成可以为空）。
- `promptContext` 为结构化上下文，MVP 可先做到“可回显、可追溯”，不要求 UI 可结构化编辑。

### 6.2 GenerationArtifact（一次生成产生的产物）

`GenerationArtifact` 表示 run 的产物（通常是图片文件，也可能是 JSON/文本）。

最小结构（建议）：

```json
{
  "id": "ga_...",
  "runId": "gr_...",
  "type": "image | json | text",
  "mimeType": "image/png",
  "filePath": "uploads/xxx.png",
  "width": 1024,
  "height": 1024,
  "sizeBytes": 123456,
  "owner": { "type": "asset | projectPlanVersion | planScene", "id": "...", "slot": "cover | scene:0" },
  "effectivePrompt": "string",
  "promptContext": {},
  "referenceImages": [{ "artifactId": "ga_...", "filePath": "uploads/..." }],
  "editInstruction": "string (optional)",
  "parentArtifactId": "ga_... (optional)",
  "createdAt": 1700000000000,
  "deletedAt": null
}
```

说明：

- `filePath` 建议为相对路径（由 Sidecar 静态路由映射到 `/uploads/*`），避免把绝对系统路径泄露到前端与导出。
- `owner.type/id/slot` 用于把 artifact 归属到“某个资产/某个方案版本/某个场景卡片”的某个图片位（slot）。
- `parentArtifactId` 用于表达“基于上一张图重新编辑/重新生成”的版本链路。

### 6.3 effective prompt 一致性原则（硬性）

只要 UI 里涉及“文生图 / 文+图生图”，必须满足：

- UI 允许用户编辑“本次生成要用的提示词”（draft）。
- 服务端最终用于出图的 **`effectivePrompt` 必须回显**（并建议同时回显 `promptContext`）。
- 前端展示的 “最终提示词（effective prompt）”以服务端回显为准（覆盖本地推导/拼接），确保可复用与可追溯。
- `effectivePrompt` 的生成规则由 `settings.key = "prompt_rules"` 管理（UI：设置 → 提示词编排），按 `taskType + ownerType` 选择对应规则。

### 6.4 版本指针（Active Pointer）

同一个 `owner.type + owner.id + owner.slot` 下可能有多个 artifact 版本，但必须存在“当前版本指针”：

- 例如：`asset.coverArtifactId`、`planScene.previewArtifactId`
- 删除当前版本必须有明确规则：
  - 本产品默认：允许删除任何版本；删除当前版本后自动回退到“最近版本”（按 `createdAt` 取最新）；若无版本则进入空状态（见 ADR 0004）
