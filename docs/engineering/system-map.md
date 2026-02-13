# 系统地图（当前实现）

## 分层与职责

### Frontend（`src/`）
- UI：`src/routes/index.tsx`（主页面状态机：空白/加载/单预案/项目预案）
- 业务组件：`src/components/`（Sidebar、SettingsPanel、OutfitPlannerForm 等）
- UI 原子：`src/components/ui/`（基于 @base-ui/react 的封装）
- 核心能力：
  - 文生文/文生图：`src/lib/ai-client.ts`（统一走 `/api/ai/*`）
  - Provider 本地存储：`src/lib/provider-storage.ts`（localStorage）
  - 项目 prompt：`src/lib/project-prompt.ts`
  - LLM JSON 解析：`src/lib/llm-json.ts`
  - PPT 导出：`src/lib/ppt-exporter.ts` + `src/lib/ppt-templates.ts`

### Sidecar（`sidecar/`）
- 服务：`sidecar/src/index.ts`（Hono server，端口 `3001`）
- API：
  - `/api/ai/*`：作为“Provider 网关”，把前端的 Provider 配置转成对外部模型的调用
  - `/api/providers`、`/api/plans`：提供 DB CRUD（当前前端未接入）
- DB：SQLite + Drizzle，schema 在 `sidecar/src/db/schema.ts`

### Tauri（`src-tauri/`）
- 桌面壳与 CSP：`src-tauri/tauri.conf.json`
- 当前 Rust 侧未看到启动 Sidecar 的逻辑（需要在重构阶段明确“Sidecar 如何随桌面应用启动”）。

## 关键数据流

### A. 生成分镜方案（文本）
1. UI 组装 prompt（单主题内置 prompt；项目模式用 `buildProjectPrompt`）
2. 若配置了在线 Provider：前端 `POST /api/ai/generate { prompt, provider }`
3. 否则：走本地/降级实现 `src/lib/gemini-nano.ts`
4. 使用 `parseLlmJson` 提取严格 JSON
5. 写入 React state，并持久化到 localStorage 历史

### B. 生成参考图（图片）
1. UI 触发创建任务（`image-generation`），传入 **draft prompt**（通常来自场景 `visualPrompt` 或用户编辑）与 `owner`（用于归属与上下文）
2. Sidecar Worker 根据 **Prompt 编排规则**拼接上下文，生成服务端最终用于出图的 `effectivePrompt`（并回显/落库）
   - 拼接来源：全局工作室提示词（`prompt_templates` 默认模板）+ 项目提示词（`projects.project_prompt`）+ 客户信息（`projects.customer`）+ 场景信息（项目分镜/场景资产）+ draft prompt
   - 规则配置：`settings.key = "prompt_rules"`（对应 UI：设置 → 提示词编排）
3. Sidecar 调外部模型生成图片，落盘到 `data/uploads/*`，并写入 `GenerationRun + GenerationArtifact`（含 `effectivePrompt + promptContext`）
4. 前端通过项目详情接口（`GET /api/projects/:id` 注入 `previewArtifactPath`）或 artifacts 接口（`/api/artifacts`）展示图片与版本历史

### C. 导出 PPT
- 前端使用 `pptxgenjs` 直接生成并 `writeFile` 下载：
  - 单预案：`exportToPPT(plan, { images, styleId })`
  - 项目预案：`exportProjectToPPT(projectPlan, { images, styleId })`

## 读代码从哪里开始

- `src/routes/index.tsx`：产品主流程与状态机（最高优先级）
- `src/lib/ai-client.ts` + `sidecar/src/routes/ai.ts`：模型调用链路与 Provider 约定
- `src/lib/ppt-exporter.ts`：导出结构与图片嵌入约束
- `sidecar/src/db/schema.ts`：未来要接入“持久化”的基础
