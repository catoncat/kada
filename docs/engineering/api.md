# Sidecar API 参考（/api）

Sidecar 在开发期监听 `http://localhost:3001`，前端通过 Vite proxy 以相对路径 `/api/*` 访问。

注意：打包到 Tauri 后，相对路径 `/api/*` 是否仍可用需要明确（见 `docs/refactor/known-issues.md`）。

## 健康检查

- `GET /health` → `{ status: "ok", timestamp }`

## AI 网关（/api/ai）

### `POST /api/ai/models`

请求（两种方式二选一）：

- `{ provider: { format, baseUrl, apiKey, textModel, imageModel } }`
- 或 `{ providerId: "<id>" }`（从 Sidecar DB 读取；当前前端未走这条路径）

响应：

- `{ models: [{ id, name, description? }] }`

### `POST /api/ai/generate`

请求：`{ prompt: string, provider?: Provider, providerId?: string }`  
响应：`{ text: string }`

### `POST /api/ai/generate-image`

请求：`{ prompt: string, provider?: Provider, providerId?: string }`  
响应：`{ imageBase64: string, mimeType: string }`

### `POST /api/ai/test`

请求：`{ format, baseUrl, apiKey, model }`  
响应：`{ success: boolean, message: string }`

## Plans（/api/plans）

说明：Sidecar 已实现 Plans CRUD（SQLite/Drizzle），但当前前端历史仍使用 localStorage。

- `GET /api/plans?limit=20`：列表（`data` 会被解析为 JSON）
- `GET /api/plans/:id`
- `POST /api/plans`：`{ title, kind, data }`
- `PUT /api/plans/:id`：`{ title, data }`
- `DELETE /api/plans/:id`

## Providers（/api/providers）

说明：Sidecar 已实现 Providers CRUD，但当前前端 Provider 实际存放在 localStorage，并随 AI 请求传入。

- `GET /api/providers`
- `GET /api/providers/default`
- `GET /api/providers/:id`
- `POST /api/providers`
- `PUT /api/providers/:id`
- `DELETE /api/providers/:id`
- `POST /api/providers/:id/set-default`

