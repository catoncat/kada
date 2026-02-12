# 模特资产模块 + 全中文 Prompt 优化（Model Assets & Chinese Prompt）

> FEATURE_SLUG: `model-assets`
> 产品形态：桌面应用（Tauri），本地优先 / 开箱即用

## 1. 背景与目标

### 1.1 一致性问题分析

当前系统生成预览图时存在人物一致性问题，根因如下：

1. **场景间人物割裂**：项目中 3-4 个分镜场景各自独立调用 `imageGenerationHandler`，每个场景的 `visualPrompt` 没有携带统一的人物外观描述，导致 Gemini 每次"想象"出不同的人物形象。
2. **客户信息过于简略**：`projects.customer` 中的 `people` 字段只有 `role/gender/age`，缺少外观特征（肤色、发型、体型、五官特点等），模型没有足够锚点来保持一致。
3. **缺少参考图注入**：当前 `referenceImages` 仅用于场景资产图片，没有"人物参考图"传入机制——这是 Gemini 图片生成保持人物一致性的关键手段。
4. **visualPrompt 语言混杂**：`plan-generation.ts` 的 prompt 指令要求 `visualPrompt` 使用英文 SD 风格描述（`"A highly detailed English stable diffusion prompt..."`），但周围的上下文 blocks 全是中文。Gemini 并非 Stable Diffusion，中英混杂导致语义权重分配不均。

### 1.2 模特资产模块的定位

- **独立可复用**：模特资产独立于项目存在，可跨项目复用（如同一个模特在多个项目中担任主角）。
- **跨场景一致性锚点**：通过 `appearancePrompt`（外观提示词）+ 参考照片，为同一项目中所有分镜场景提供统一的人物描述和视觉参考。
- **与现有资产体系对齐**：数据结构参考 `scene_assets` 表模式，API 参考 `assetsRoutes` 路由风格。

### 1.3 全中文 Prompt 的决策

- **Gemini 原生中文理解**：Gemini 的多语言理解能力使中文 prompt 与英文 prompt 在图片生成质量上差异不大，但统一语言可避免模型在中英切换时的语义损耗。
- **上下文一致性**：`prompt-engine.ts` 中所有 block（studioPrompt、projectPrompt、customerInfo、planScene 等）已全部使用中文，唯独 `visualPrompt` 是英文，统一后信息密度和连贯性更高。
- **用户可读性**：中文 prompt 对中国用户更直观，便于在 Image Studio Lite 中查看和编辑 `effectivePrompt`。

## 2. 核心概念

### 2.1 模特资产 (Model Asset)

全局工作室级别的可复用人物模型，核心属性：

| 属性 | 说明 |
|---|---|
| 名称 (name) | 模特资产的展示名称，如"小明"、"妈妈A" |
| 性别 (gender) | `male` / `female` / `other` |
| 年龄范围 (ageRangeMin, ageRangeMax) | 年龄区间（岁），如 3-5、25-30 |
| 描述 (description) | 自由文本描述，供策划/摄影师参考 |
| 外观提示词 (appearancePrompt) | **中文**外观描述，注入到出图 prompt，如"圆脸，短发，大眼睛，皮肤白皙，微胖体型" |
| 主参考照片 (primaryImage) | 最关键的一致性锚点，作为 referenceImage 传入 Gemini |
| 辅助参考照片 (referenceImages) | 多角度/多表情/多场景的辅助参考，增强一致性 |
| 标签 (tags) | 可选标签，用于检索和分类 |
| 项目归属 (projectId) | `null` = 全局资产；非 null = 项目专属模特 |

### 2.2 项目模特配置 (Project Model Configuration)

存储在 `projects.selected_models` 列中，描述项目中使用哪些模特：

```typescript
interface ProjectModelConfig {
  /** 人物 ID → 模特资产 ID 的映射 */
  personModelMap: Record<string, string>;
  /** 是否启用自动匹配 */
  autoMatch: boolean;
}
```

### 2.3 人物-模特映射 (Person-Model Mapping)

将 `projects.customer.people` 中的每个人物条目（`id: string`）与一个模特资产关联：

- 一个人物只能映射一个模特（1:1）
- 一个模特可以被多个项目/多个人物引用（多:1）
- 映射可以手动指定，也可以通过自动匹配建议

## 3. 用户故事

### 3.1 工作室主理人：维护全局模特库

> 作为工作室主理人，我想维护一个全局模特库，把常合作的模特/常见的角色形象保存下来，以便在不同项目中复用并保持人物一致性。

- 在"资产 > 模特"页面创建/编辑/删除模特资产
- 上传主参考照片和辅助参考照片
- 填写外观提示词（系统可基于参考照片 AI 生成初稿，用户确认后保存）
- 设置标签用于检索

### 3.2 策划：在项目中选择/匹配模特

> 作为策划，我想在创建项目后为客户信息中的每个人物指定一个模特资产，以便生成预览图时人物形象一致。

- 在项目模特配置页面，看到左侧人物列表（来自 `customer.people`）、右侧模特库
- 手动拖拽/选择为每个人物指定模特
- 或点击"自动匹配"，系统根据性别/年龄自动推荐

### 3.3 策划：项目中上传新模特

> 作为策划，如果模特库中没有匹配的模特，我想直接在项目中快速上传一个新模特，系统自动创建资产并绑定到当前项目。

- 在项目模特配置页面点击"新建模特"
- 上传照片 → 填写信息 → 保存
- 系统自动创建 `model_assets` 记录（`projectId = 当前项目 ID`），并自动映射到对应人物

### 3.4 自动匹配客户信息

> 作为策划，我想系统根据客户信息的性别和年龄自动推荐匹配的模特，减少手动操作。

- 匹配规则：
  1. 性别精确匹配（`male` ↔ `male`）
  2. 年龄在模特的 `ageRangeMin` ~ `ageRangeMax` 范围内
  3. 优先匹配全局模特，其次匹配项目专属模特
- 返回每个人物的 Top-N 推荐（默认 N=3），用户确认后写入映射

### 3.5 生成图片时自动注入模特信息

> 作为系统，在生成分镜预览图时，我需要自动将映射的模特信息（外观提示词 + 参考照片）注入到 prompt 和 referenceImages 中，以保持跨场景的人物一致性。

- `prompt-engine.ts` 新增 `modelInfo` block，将每个人物的 `appearancePrompt` 渲染为 prompt 段落
- `image-generation.ts` 在发送请求前，将模特的 `primaryImage` + `referenceImages` 合并到 `referenceImages` 数组
- 参考图优先级：模特主参考图 > 模特辅助参考图 > 场景资产图

## 4. 数据结构

### 4.1 新增 `model_assets` 表

参考 `scene_assets` 表模式设计：

```sql
CREATE TABLE IF NOT EXISTS model_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,                    -- 'male' | 'female' | 'other'
  age_range_min INTEGER,          -- 年龄下限
  age_range_max INTEGER,          -- 年龄上限
  description TEXT,               -- 自由描述
  appearance_prompt TEXT,         -- 中文外观提示词（注入到出图 prompt）
  primary_image TEXT,             -- 主参考照片路径
  reference_images TEXT,          -- JSON 数组：辅助参考照片路径
  tags TEXT,                      -- JSON 数组：标签
  project_id TEXT,                -- null=全局, 非null=项目专属
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
```

Drizzle schema 定义（新增到 `sidecar/src/db/schema.ts`）：

```typescript
export const modelAssets = sqliteTable('model_assets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  gender: text('gender'),
  ageRangeMin: integer('age_range_min'),
  ageRangeMax: integer('age_range_max'),
  description: text('description'),
  appearancePrompt: text('appearance_prompt'),
  primaryImage: text('primary_image'),
  referenceImages: text('reference_images'),     // JSON 数组
  tags: text('tags'),                            // JSON 数组
  projectId: text('project_id'),                 // null=全局, 非null=项目专属
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});
```

### 4.2 `projects` 表新增 `selected_models` 列

```sql
ALTER TABLE projects ADD COLUMN selected_models TEXT;
```

JSON 格式：

```json
{
  "personModelMap": {
    "person-uuid-1": "model-asset-uuid-a",
    "person-uuid-2": "model-asset-uuid-b"
  },
  "autoMatch": false
}
```

Drizzle schema 补充：

```typescript
// projects 表新增列
selectedModels: text('selected_models'), // JSON（ProjectModelConfig）
```

### 4.3 迁移策略

- 使用 `ensureTables()` 新增 `model_assets` 建表语句
- 使用 `ensureColumns()` 中 `addColumnIfMissing('projects', 'selected_models', 'TEXT')` 为旧数据库添加列
- 不破坏现有表结构，旧项目 `selected_models` 为 `null`，表示未配置模特

## 5. API 设计

### 5.1 模特资产 CRUD

路由前缀：`/api/assets/models`（新增 `sidecar/src/routes/model-assets.ts`，参考 `assets.ts` 风格）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/assets/models` | 获取模特列表 |
| GET | `/api/assets/models/:id` | 获取单个模特详情 |
| POST | `/api/assets/models` | 创建模特 |
| PUT | `/api/assets/models/:id` | 更新模特 |
| DELETE | `/api/assets/models/:id` | 删除模特 |

#### 列表查询参数

```
GET /api/assets/models?projectId=xxx
```

- 不传 `projectId`：返回全部全局模特
- 传 `projectId`：返回全局模特 + 该项目的专属模特（合并展示）

#### 请求/响应示例

**创建模特 (POST /api/assets/models)**

```json
// Request
{
  "name": "小明",
  "gender": "male",
  "ageRangeMin": 3,
  "ageRangeMax": 5,
  "description": "活泼好动的小男孩",
  "appearancePrompt": "圆脸，短发，大眼睛，皮肤白皙，微胖体型，常带笑容",
  "primaryImage": "uploads/abc123.jpg",
  "referenceImages": ["uploads/ref1.jpg", "uploads/ref2.jpg"],
  "tags": ["儿童", "男孩", "活泼"],
  "projectId": null
}

// Response (201)
{
  "id": "uuid-xxx",
  "name": "小明",
  "gender": "male",
  ...
}
```

### 5.2 自动匹配

```
POST /api/assets/models/auto-match
```

**请求体：**

```json
{
  "projectId": "project-uuid",
  "people": [
    { "id": "person-1", "role": "宝宝", "gender": "male", "age": 3 },
    { "id": "person-2", "role": "妈妈", "gender": "female", "age": 30 }
  ]
}
```

**响应：**

```json
{
  "matches": {
    "person-1": [
      { "modelId": "model-a", "name": "小明", "score": 0.95 },
      { "modelId": "model-b", "name": "小刚", "score": 0.80 }
    ],
    "person-2": [
      { "modelId": "model-c", "name": "妈妈A", "score": 0.90 }
    ]
  }
}
```

**匹配算法（V1 简单规则）：**

1. 性别完全匹配：+50 分
2. 年龄在范围内：+40 分
3. 同项目专属模特额外加分：+10 分
4. 按分数降序返回 Top-3

## 6. Prompt 编排变更

### 6.1 新增 `modelInfo` block kind

在 `sidecar/src/prompt-rules.ts` 中：

```typescript
export type PromptBlockKind =
  | 'studioPrompt'
  | 'projectPrompt'
  | 'customerInfo'
  | 'modelInfo'          // ← 新增
  | 'selectedSceneAsset'
  | 'planScene'
  | 'asset'
  | 'draftPrompt'
  | 'editInstruction'
  | 'freeText';
```

### 6.2 默认规则更新

在 `DEFAULT_PROMPT_RULES_V1` 的 `image-generation:planScene` 规则中，`customerInfo` block 之后插入 `modelInfo` block：

```typescript
'image-generation:planScene': {
  id: 'image-generation:planScene:v1',
  name: '场景预览图（项目分镜）',
  blocks: [
    { id: 'studio',      kind: 'studioPrompt',       label: '全局工作室提示词', enabled: true },
    { id: 'project',     kind: 'projectPrompt',      label: '项目提示词',       enabled: true },
    { id: 'customer',    kind: 'customerInfo',        label: '客户信息',         enabled: true },
    { id: 'model-info',  kind: 'modelInfo',           label: '模特外观信息',     enabled: true }, // ← 新增
    { id: 'scene-asset', kind: 'selectedSceneAsset',  label: '已选场景资产',     enabled: true },
    { id: 'plan-scene',  kind: 'planScene',           label: '具体分镜场景',     enabled: true },
    { id: 'draft',       kind: 'draftPrompt',         label: '用户/分镜提示词（draft）', enabled: true },
  ],
},
```

### 6.3 `prompt-engine.ts` 新增 `formatModelInfo` 渲染函数

```typescript
function formatModelInfo(
  models: Array<{ personRole: string; name: string; appearancePrompt: string }>,
): string | null {
  if (!models || models.length === 0) return null;

  const lines: string[] = ['## 人物外观描述（保持跨场景一致）'];
  for (const m of models) {
    lines.push(`### ${m.personRole}（模特：${m.name}）`);
    if (m.appearancePrompt) {
      lines.push(m.appearancePrompt);
    }
    lines.push('');
  }
  return compactLines(lines.join('\n'));
}
```

在 `buildImageEffectivePrompt` 的 block switch 中新增 `case 'modelInfo'`：

- 从 `projects.selected_models` 读取 `personModelMap`
- 从 `projects.customer` 读取 `people` 列表
- 联表查询 `model_assets` 获取每个映射模特的 `name` + `appearancePrompt`
- 将人物角色名与模特外观组合后，用 `formatModelInfo` 渲染

### 6.4 `promptContext` 新增 `modelReferenceImages`

`buildImageEffectivePrompt` 返回的 `promptContext` 中新增字段，供下游 `image-generation.ts` 使用：

```typescript
promptContext: {
  // ...existing fields...
  modelReferenceImages: string[],  // 模特参考图路径列表（已按优先级排序）
}
```

## 7. 全中文 Prompt 优化

### 7.1 `plan-generation.ts` 的 `visualPrompt` 改为中文

**现状**（`buildGeneratePlanPrompt` 中的 JSON schema 示例）：

```
"visualPrompt": "A highly detailed English stable diffusion prompt for this scene. The subject should be the main focus with '${scene.name}' as background. Style: photorealistic, professional photography."
```

**改为**：

```
"visualPrompt": "用中文描述这个分镜场景的画面，要具体到人物动作、表情、姿态与场景环境的关系。描述应直接服务于 AI 出图，风格为专业摄影、真实质感。"
```

同时移除以下旧指令：

```diff
- 3. 每个 visualPrompt 必须使用英文
+ 3. 所有内容统一使用中文（包括 visualPrompt）
```

### 7.2 prompt-engine 各 block 确认中文

当前 `prompt-engine.ts` 各 block 已全部使用中文，无需修改。仅需确保新增的 `modelInfo` block 也使用中文。

### 7.3 Gemini 中文 Prompt 优化建议

1. **避免混合语言**：同一个请求中的所有 text parts 统一使用中文，不在中文描述中插入英文关键词。
2. **具象化描述**：中文 prompt 优势在于可以用更自然的语言描述情感和氛围，如"温馨的母子互动"比"warm mother-son interaction"更能激发 Gemini 的中文语义空间。
3. **结构化层次**：使用 markdown 标题层级（`##`/`###`）组织 prompt，Gemini 能较好地理解层次关系。
4. **角色锚定**：在 prompt 开头明确"你是一位专业摄影师"，中文角色设定比英文对 Gemini 的引导效果更稳定。

## 8. 图片生成变更

### 8.1 合并模型参考图

在 `sidecar/src/worker/handlers/image-generation.ts` 的 `imageGenerationHandler` 中：

```typescript
// 在调用 generateImage 之前，合并模特参考图
const modelRefImages: string[] = promptContext.modelReferenceImages ?? [];
const allReferenceImages = [
  ...modelRefImages,              // 模特参考图（最高优先级）
  ...(input.referenceImages ?? []), // 原有参考图（场景资产图等）
];
```

### 8.2 参考图数量限制与优先级

Gemini API 对请求中的图片数量有限制，建议：

| 类型 | 最大数量 | 优先级 |
|---|---|---|
| 模特主参考图 | 每人 1 张 | 最高 |
| 模特辅助参考图 | 每人最多 2 张 | 高 |
| 场景资产主图 | 1 张 | 中 |
| 场景资产补充图 | 最多 1 张 | 低 |

总计建议上限：**8 张**参考图/请求。超出时按优先级截断。

说明：

- 模特主参考图是一致性的核心锚点，不可省略
- 当项目有多个人物时（如母子合影），每人的主参考图都需要包含
- 场景资产图在有模特参考图时优先级降低（场景信息已通过 prompt 文字描述）

## 9. 前端组件（概要设计）

### 9.1 资产管理页：模特 Tab

- **路由**：`src/routes/assets.models.tsx`
- **功能**：模特资产列表 / 新建 / 编辑 / 删除
- **组件**：
  - `ModelAssetCard`：卡片展示（主参考照、名称、性别、年龄范围、标签）
  - `ModelAssetForm`：创建/编辑表单（含图片上传、外观提示词编辑）
- **交互**：与现有 `assets.scenes.tsx` 保持一致的交互模式

### 9.2 项目模特配置页

- **路由**：`src/routes/project.$id.models.tsx`
- **功能**：为项目中的人物指定模特
- **组件**：
  - `PersonModelMapper`：左右两栏布局——左侧人物列表（来自 `customer.people`）、右侧模特库（支持搜索/筛选）
  - `AutoMatchButton`：一键自动匹配，展示推荐结果，用户确认后写入
  - `QuickCreateModel`：快速创建项目专属模特（自动设置 `projectId`）
- **前置条件**：需要先在项目配置中填写客户信息（`customer.people`），否则展示引导提示

### 9.3 ProjectWorkspace 集成

在现有项目工作区中新增"模特配置"步骤/区块：

- 位置：在"客户信息"步骤之后、"生成方案"之前
- 状态指示：已配置 N/M 个人物的模特映射
- 可选性：模特配置不阻塞方案生成（未配置时不注入模特信息，保持向后兼容）

### 9.4 前端类型定义

新增 `src/types/model-asset.ts`：

```typescript
export interface ModelAsset {
  id: string;
  name: string;
  gender?: 'male' | 'female' | 'other';
  ageRangeMin?: number;
  ageRangeMax?: number;
  description?: string;
  appearancePrompt?: string;
  primaryImage?: string;
  referenceImages?: string[];
  tags?: string[];
  projectId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateModelAssetInput {
  name: string;
  gender?: 'male' | 'female' | 'other';
  ageRangeMin?: number;
  ageRangeMax?: number;
  description?: string;
  appearancePrompt?: string;
  primaryImage?: string;
  referenceImages?: string[];
  tags?: string[];
  projectId?: string | null;
}

export interface UpdateModelAssetInput extends Partial<CreateModelAssetInput> {}

export interface ModelAssetListResponse {
  data: ModelAsset[];
  total: number;
}

export interface ProjectModelConfig {
  personModelMap: Record<string, string>;
  autoMatch: boolean;
}

export interface AutoMatchResult {
  matches: Record<string, Array<{
    modelId: string;
    name: string;
    score: number;
  }>>;
}
```

### 9.5 前端 API 客户端

新增 `src/lib/model-assets-api.ts`（参考 `scene-assets-api.ts` 风格）：

- `getModelAssets(projectId?: string)`
- `getModelAsset(id: string)`
- `createModelAsset(input: CreateModelAssetInput)`
- `updateModelAsset(id: string, input: UpdateModelAssetInput)`
- `deleteModelAsset(id: string)`
- `autoMatchModels(projectId: string, people: Person[])`

## 10. 验收标准

### Success Criteria

- [ ] **模特资产 CRUD**：用户可在"资产 > 模特"页面完成模特资产的创建、编辑、删除，含主参考照和辅助参考照的上传管理。
- [ ] **项目模特配置**：用户可在项目中为 `customer.people` 中的每个人物指定模特资产，映射关系持久化到 `projects.selected_models`。
- [ ] **自动匹配**：点击"自动匹配"后，系统根据性别/年龄规则返回推荐模特，用户确认后写入映射。
- [ ] **Prompt 注入**：生成分镜预览图时，`effectivePrompt` 中包含已映射模特的外观提示词（通过 `modelInfo` block），且在 Image Studio Lite 中可见可编辑。
- [ ] **参考图注入**：生成分镜预览图时，请求的 `referenceImages` 包含已映射模特的参考照片，且遵守数量限制（不超过 8 张）。
- [ ] **全中文 prompt**：`plan-generation.ts` 中 `visualPrompt` 示例改为中文描述，不再要求英文 SD 风格 prompt。
- [ ] **向后兼容**：未配置模特的项目正常工作，`modelInfo` block 在无数据时不渲染，`modelReferenceImages` 为空数组。
- [ ] **block 可开关**：`modelInfo` block 在设置页的 prompt 规则编辑器中可独立开关。

### Failure Scenarios

- [ ] **模特库为空时**：项目模特配置页展示"暂无模特"引导（引导去资产页创建或在当前页快速创建），不阻塞方案生成。
- [ ] **未填客户信息时**：项目模特配置页展示"请先填写客户信息"引导，不显示空的映射表。
- [ ] **参考图文件丢失时**：读取模特参考图路径时文件不存在，在 `buildGeminiReferenceParts` 中跳过（已有容错逻辑），不中断生成流程。
- [ ] **模特被删除但映射仍存在时**：生成时查询模特不存在，静默跳过该模特的信息注入，不中断生成流程，在 `promptContext` 中记录 warning。

## 11. 风险与约束

### 风险

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| Gemini 参考图多人一致性不稳定 | 多人合影时模型仍可能混淆人物 | 先验证单人场景一致性，多人场景在 prompt 中明确标注每人特征与参考图对应关系 |
| 参考图数量过多导致 API 延迟/失败 | 请求超时或被拒 | 严格限制总参考图 ≤ 8 张，超出时按优先级截断 |
| 全中文 prompt 对特定风格（如赛博朋克/欧美风）表达力不足 | 部分风格用中文描述不够精准 | 保留 `freeText` block 作为逃生舱，用户可在 draft prompt 中混入任意文本 |
| 数据膨胀（每个模特多张参考图） | 磁盘空间快速增长 | 与现有图片管理机制对齐（uploads 目录），后续统一清理策略 |

### 约束

- 本期不做 AI 自动生成外观提示词（基于参考图），预留 `asset-caption` 的 kind 扩展点
- 本期不做模特参考图的 AI 编辑（去背景、统一风格等），复用现有 Image Studio Lite
- 本期不做跨项目的模特使用统计/推荐

## 12. 关键文件索引

| 层级 | 文件 | 变更内容 |
|---|---|---|
| 数据库 | `sidecar/src/db/schema.ts` | 新增 `modelAssets` 表定义，`projects` 表新增 `selectedModels` |
| 迁移 | `sidecar/src/db/index.ts` | `ensureTables` 新增 `model_assets` 建表；`ensureColumns` 新增 `selected_models` |
| API | 新增 `sidecar/src/routes/model-assets.ts` | 模特资产 CRUD + 自动匹配（参考 `assets.ts`） |
| API 注册 | `sidecar/src/index.ts` | 挂载 `modelAssetsRoutes` 到 `/api/assets/models` |
| Prompt 规则 | `sidecar/src/prompt-rules.ts` | `PromptBlockKind` 新增 `modelInfo`；默认规则新增 block |
| Prompt 引擎 | `sidecar/src/worker/prompt-engine.ts` | 新增 `formatModelInfo`；`buildImageEffectivePrompt` 新增 `modelInfo` case 和 `modelReferenceImages` 输出 |
| 图片生成 | `sidecar/src/worker/handlers/image-generation.ts` | 合并模特参考图到 referenceImages |
| 预案生成 | `sidecar/src/worker/handlers/plan-generation.ts` | `visualPrompt` 示例改为中文 |
| 前端类型 | 新增 `src/types/model-asset.ts` | ModelAsset / ProjectModelConfig / AutoMatchResult |
| 前端 API | 新增 `src/lib/model-assets-api.ts` | 模特资产 API 客户端 |
| 前端路由 | 新增 `src/routes/assets.models.tsx` | 模特资产管理页 |
| 前端路由 | 新增 `src/routes/project.$id.models.tsx` | 项目模特配置页 |
