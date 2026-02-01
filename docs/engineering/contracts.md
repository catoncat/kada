# 数据契约（建议重构时优先稳定的部分）

本文件描述“外部可见/需要长期稳定”的数据结构：预案 JSON、Provider 配置、本地存储键，以及导出对图片的约束。

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

- Sidecar 返回 `{ imageBase64, mimeType }`，前端组装成 `data:<mimeType>;base64,<...>`。
- PPT 导出仅支持嵌入 `data:image/...` 的 dataURL（否则会展示占位提示）。
- 项目模式的图片索引目前使用 `sceneKey = lookIndex * 100 + sceneIndex`（隐含假设：每套场景数量很小且稳定）。

