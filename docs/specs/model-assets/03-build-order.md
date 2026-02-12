# 模特资产模块：Build Order（Model Assets）

> FEATURE_SLUG: `model-assets`
> 前置文档：`01-feature-spec.md` + `02-ux-spec.md`

## 全局约束

- 不要手改生成/产物：`dist/`、`src/routeTree.gen.ts`、`.tanstack/`、`src-tauri/target/`
- 任何契约/API 改动必须同步更新 `docs/engineering/contracts.md` / `docs/engineering/api.md`
- 本文档只产出 prompts，不直接实施编码

---

## Step 1：新增 `model_assets` 表 + `projects.selected_models` 列

### 目标

在数据库层完成模特资产的存储基础，不影响现有表结构。

### 需要读的文件

- `sidecar/src/db/schema.ts`
- `sidecar/src/db/index.ts`
- `docs/specs/model-assets/01-feature-spec.md` §4（数据结构）

### 需要改的文件

- `sidecar/src/db/schema.ts`
- `sidecar/src/db/index.ts`

### Prompt

```
在 sidecar/src/db/schema.ts 中新增 modelAssets 表定义：

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

同时在 projects 表定义中新增：
  selectedModels: text('selected_models'),

为 modelAssets 添加类型导出：
export type ModelAsset = typeof modelAssets.$inferSelect;
export type InsertModelAsset = typeof modelAssets.$inferInsert;

在 sidecar/src/db/index.ts 中：
1. ensureTables() 函数中新增 model_assets 建表 SQL（CREATE TABLE IF NOT EXISTS，参考 scene_assets 的结构）
2. ensureColumns() 函数中新增：
   addColumnIfMissing('projects', 'selected_models', 'TEXT');
```

### 自测命令

```bash
pnpm dev:sidecar
# 观察控制台输出：应该看到 "✅ Database initialized"，无报错
# 如果 selected_models 列不存在会看到 "🧩 Adding missing column: projects.selected_models"
```

### 完成定义

- Sidecar 启动正常，无报错
- `model_assets` 表已创建
- `projects.selected_models` 列存在
- 现有功能不受影响（现有 API 正常工作）

---

## Step 2：新增模特资产 CRUD API

### 目标

实现模特资产的完整 CRUD 端点，挂载到 `/api/assets/models`。

### 需要读的文件

- `sidecar/src/routes/assets.ts`（参考场景资产路由的风格）
- `sidecar/src/index.ts`（了解路由挂载方式）
- `sidecar/src/db/schema.ts`（modelAssets 定义）

### 需要改的文件

- 新增 `sidecar/src/routes/model-assets.ts`
- `sidecar/src/index.ts`（挂载路由）

### Prompt

```
参考 sidecar/src/routes/assets.ts（sceneAssets 的 CRUD 风格），新建 sidecar/src/routes/model-assets.ts，实现以下端点：

1. GET /（获取模特列表）
   - 支持 query param: ?projectId=xxx
   - 不传 projectId：返回所有 project_id IS NULL 的全局模特
   - 传 projectId：返回 project_id IS NULL OR project_id = xxx 的合并列表
   - JSON 字段（referenceImages, tags）需要解析后返回
   - 响应格式：{ data: ModelAsset[], total: number }

2. GET /:id（获取单个模特）
   - 404 时返回 { error: '模特不存在' }

3. POST /（创建模特）
   - id 用 randomUUID()
   - JSON 字段序列化存储
   - 响应 201

4. PUT /:id（更新模特）
   - 只更新提供的字段
   - 404 时返回 { error: '模特不存在' }

5. DELETE /:id（删除模特）
   - 404 时返回 { error: '模特不存在' }
   - 响应 { success: true }

然后在 sidecar/src/index.ts 中：
- import { modelAssetsRoutes } from './routes/model-assets';
- 挂载到 /api/assets/models：app.route('/api/assets/models', modelAssetsRoutes);
- 注意：必须在 app.route('/api/assets', assetsRoutes) 之前注册，
  或者把 modelAssetsRoutes 挂载到 assetsRoutes 内部（路径为 /models），
  这样实际访问路径是 /api/assets/models。
  推荐方案：在 sidecar/src/index.ts 中直接用独立行挂载：
  app.route('/api/assets/models', modelAssetsRoutes);
  放在 app.route('/api/assets', assetsRoutes) 之前，避免被 /api/assets 的通配捕获。
```

### 自测命令

```bash
pnpm dev:sidecar
# 在另一个终端测试：
curl http://localhost:3001/api/assets/models
# 应返回 {"data":[],"total":0}

curl -X POST http://localhost:3001/api/assets/models \
  -H 'Content-Type: application/json' \
  -d '{"name":"小明","gender":"male","ageRangeMin":3,"ageRangeMax":5,"appearancePrompt":"圆脸，短发","tags":["儿童"]}'
# 应返回 201 + 创建的模特数据

curl http://localhost:3001/api/assets/models
# 应返回包含刚创建模特的列表
```

### 完成定义

- 5 个端点全部可用
- `?projectId=xxx` 筛选逻辑正确
- JSON 字段正确序列化/反序列化
- 错误响应格式与 `assets.ts` 一致

---

## Step 3：新增自动匹配 API

### 目标

实现 `POST /api/assets/models/auto-match` 端点，根据性别/年龄推荐模特。

### 需要读的文件

- `sidecar/src/routes/model-assets.ts`（Step 2 创建的文件）
- `docs/specs/model-assets/01-feature-spec.md` §5.2（匹配算法）

### 需要改的文件

- `sidecar/src/routes/model-assets.ts`

### Prompt

```
在 sidecar/src/routes/model-assets.ts 中新增端点：

POST /auto-match

注意：这个路由必须在 /:id 路由之前注册，否则 "auto-match" 会被当作 :id 参数。

请求体：
{
  projectId: string,
  people: Array<{ id: string, role: string, gender?: string, age?: number }>
}

逻辑：
1. 查询所有可用模特（全局 + 该项目专属）
2. 对每个 person，按以下规则给每个模特打分：
   - 性别匹配（person.gender === model.gender）：+50
   - 年龄在范围内（model.ageRangeMin <= person.age <= model.ageRangeMax）：+40
   - 同项目专属模特（model.projectId === projectId）：+10
   - 无性别信息的 person 跳过性别匹配项
   - 无年龄信息的 person 跳过年龄匹配项
3. 每个 person 返回 score > 0 的 Top-3，按分数降序

响应格式：
{
  matches: {
    [personId]: Array<{ modelId: string, name: string, score: number }>
  }
}

如果某 person 没有任何匹配（score > 0），matches 中该 key 返回空数组。
```

### 自测命令

```bash
# 先确保有至少一个模特（Step 2 创建的）
curl -X POST http://localhost:3001/api/assets/models/auto-match \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"test","people":[{"id":"p1","role":"宝宝","gender":"male","age":3}]}'
# 应返回 matches 结构
```

### 完成定义

- 匹配逻辑正确（性别+年龄+项目归属）
- 无匹配时返回空数组而非报错
- 路由不与 `/:id` 冲突

---

## Step 4：更新 API 文档

### 目标

将模特资产 API 同步到工程文档。

### 需要读的文件

- `docs/engineering/api.md`
- `docs/engineering/contracts.md`

### 需要改的文件

- `docs/engineering/api.md`
- `docs/engineering/contracts.md`

### Prompt

```
在 docs/engineering/api.md 的 Assets 部分之后，新增 "Model Assets（已实现）" 小节：

## Model Assets（已实现）

- `GET /api/assets/models?projectId=xxx` → `{ data: ModelAsset[], total }`
  - 不传 projectId：返回全局模特
  - 传 projectId：返回全局 + 项目专属模特
- `GET /api/assets/models/:id` → `ModelAsset`
- `POST /api/assets/models` → `ModelAsset`
- `PUT /api/assets/models/:id` → `ModelAsset`
- `DELETE /api/assets/models/:id` → `{ success: true }`
- `POST /api/assets/models/auto-match`
  - 请求：`{ projectId: string, people: Array<{ id, role, gender?, age? }> }`
  - 响应：`{ matches: Record<personId, Array<{ modelId, name, score }>> }`

在 docs/engineering/contracts.md 中适当位置补充 ModelAsset 和 ProjectModelConfig 的数据结构说明：

- ModelAsset：id, name, gender, ageRangeMin, ageRangeMax, description, appearancePrompt, primaryImage, referenceImages[], tags[], projectId(nullable)
- ProjectModelConfig（存在 projects.selected_models 列，JSON 格式）：
  { personModelMap: Record<personId, modelAssetId>, autoMatch: boolean }
```

### 自测命令

```bash
# 无代码变更，只检查文档格式
cat docs/engineering/api.md | head -200
```

### 完成定义

- `api.md` 中有 Model Assets 章节且端点描述准确
- `contracts.md` 中有 ModelAsset + ProjectModelConfig 结构说明

---

## Step 5：Prompt 规则新增 `modelInfo` block

### 目标

在 prompt 编排系统中新增 `modelInfo` block kind，并更新默认规则。

### 需要读的文件

- `sidecar/src/prompt-rules.ts`

### 需要改的文件

- `sidecar/src/prompt-rules.ts`

### Prompt

```
修改 sidecar/src/prompt-rules.ts：

1. PromptBlockKind 联合类型中新增 'modelInfo'（放在 'customerInfo' 之后）：

export type PromptBlockKind =
  | 'studioPrompt'
  | 'projectPrompt'
  | 'customerInfo'
  | 'modelInfo'
  | 'selectedSceneAsset'
  | 'planScene'
  | 'asset'
  | 'draftPrompt'
  | 'editInstruction'
  | 'freeText';

2. 在 DEFAULT_PROMPT_RULES_V1 的 'image-generation:planScene' 规则中，
   customer block 之后插入 modelInfo block：

{ id: 'model-info', kind: 'modelInfo', label: '模特外观信息', enabled: true },

完整 blocks 数组顺序：studio → project → customer → model-info → scene-asset → plan-scene → draft
```

### 自测命令

```bash
pnpm dev:sidecar
# 启动正常无报错即可（规则类型变更不影响运行时，因为 switch default 会跳过未知 kind）
```

### 完成定义

- `PromptBlockKind` 包含 `'modelInfo'`
- 默认规则 `image-generation:planScene` 的 blocks 中包含 `modelInfo` block
- 代码无类型错误

---

## Step 6：Prompt 引擎新增 `modelInfo` 渲染逻辑

### 目标

在 `prompt-engine.ts` 中实现 `modelInfo` block 的数据加载和渲染，以及 `modelReferenceImages` 输出。

### 需要读的文件

- `sidecar/src/worker/prompt-engine.ts`
- `sidecar/src/db/schema.ts`（modelAssets 表）

### 需要改的文件

- `sidecar/src/worker/prompt-engine.ts`

### Prompt

```
修改 sidecar/src/worker/prompt-engine.ts：

1. 在文件顶部 import 中增加 modelAssets：
   import { projects, sceneAssets, settings, modelAssets } from '../db/schema';
   import { eq, inArray, isNull, or } from 'drizzle-orm';

2. 新增 formatModelInfo 函数（在 formatPlanScene 之后）：

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

3. 在 buildImageEffectivePrompt 的"预取上下文"部分，当 owner?.type === 'planScene' 时，
   在获取 project 之后新增模特数据加载：

let modelInfoData: Array<{ personRole: string; name: string; appearancePrompt: string }> = [];
let modelReferenceImages: string[] = [];

if (project) {
  const selectedModels = safeJsonParse<{ personModelMap?: Record<string, string> }>(project.selectedModels);
  const customerData = safeJsonParse<{ people?: Array<{ id: string; role: string }> }>(project.customer);
  const personModelMap = selectedModels?.personModelMap || {};
  const people = customerData?.people || [];

  const modelIds = [...new Set(Object.values(personModelMap))].filter(Boolean);

  if (modelIds.length > 0) {
    const models = await db.select().from(modelAssets).where(inArray(modelAssets.id, modelIds));
    const modelMap = new Map(models.map(m => [m.id, m]));

    for (const person of people) {
      const modelId = personModelMap[person.id];
      if (!modelId) continue;
      const model = modelMap.get(modelId);
      if (!model) continue;

      if (model.appearancePrompt) {
        modelInfoData.push({
          personRole: person.role || '人物',
          name: model.name,
          appearancePrompt: model.appearancePrompt,
        });
      }

      // 收集参考图（优先级：主参考 > 辅助参考）
      if (model.primaryImage) {
        modelReferenceImages.push(model.primaryImage);
      }
      const refs = safeJsonParse<string[]>(model.referenceImages) ?? [];
      modelReferenceImages.push(...refs.slice(0, 2)); // 每个模特最多 2 张辅助
    }
  }
}

4. 在 block switch 中新增 case 'modelInfo'：

case 'modelInfo':
  text = formatModelInfo(modelInfoData) || '';
  break;

5. 在 promptContext 返回值中新增 modelReferenceImages：

const promptContext: Record<string, unknown> = {
  // ...existing fields...
  modelReferenceImages,
};
```

### 自测命令

```bash
pnpm dev:sidecar
# 测试 prompt 预览（需要有项目 + 模特映射）：
curl -X POST http://localhost:3001/api/prompts/preview-image \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"test","owner":{"type":"planScene","id":"YOUR_PROJECT_ID","slot":"scene:0"}}'
# 查看返回的 renderedBlocks 中是否有 modelInfo block
# 查看 promptContext 中是否有 modelReferenceImages
```

### 完成定义

- 有模特映射的项目：effectivePrompt 中包含 `## 人物外观描述` 段落
- promptContext.modelReferenceImages 包含模特参考图路径
- 无模特映射时：modelInfo block 不渲染，modelReferenceImages 为空数组
- 代码无类型错误

---

## Step 7：图片生成合并模特参考图

### 目标

在 `image-generation.ts` 中将 prompt 引擎输出的模特参考图合并到请求的 referenceImages 中。

### 需要读的文件

- `sidecar/src/worker/handlers/image-generation.ts`

### 需要改的文件

- `sidecar/src/worker/handlers/image-generation.ts`

### Prompt

```
修改 sidecar/src/worker/handlers/image-generation.ts 的 imageGenerationHandler 函数：

在调用 generateImage 之前（约第 161 行 const result = ... 之前），合并模特参考图：

// 合并模特参考图到 referenceImages
const modelRefImages: string[] = Array.isArray((promptContext as any).modelReferenceImages)
  ? (promptContext as any).modelReferenceImages
  : [];
const allReferenceImages = [
  ...modelRefImages,                // 模特参考图（最高优先级）
  ...(input.referenceImages ?? []), // 原有参考图
].slice(0, 8); // 总数上限 8 张

然后将 generateImage 的调用从：
  const result = await generateImage(provider, effectivePrompt, input.referenceImages, input.options);
改为：
  const result = await generateImage(provider, effectivePrompt, allReferenceImages, input.options);

同时更新 promptContext 中的 referenceImagesCount：
  referenceImagesCount: allReferenceImages.length,
```

### 自测命令

```bash
pnpm dev:sidecar
# 创建一个包含模特参考图的模特，映射到项目，然后触发图片生成
# 观察日志中 [ImageGen] 的 referenceImages 数量
```

### 完成定义

- 有模特映射时，生成请求的 referenceImages 包含模特参考图
- 参考图总数不超过 8 张
- 无模特映射时行为与之前完全一致

---

## Step 8：全中文 visualPrompt

### 目标

将 `plan-generation.ts` 的 `visualPrompt` 从英文 SD 风格改为中文描述。

### 需要读的文件

- `sidecar/src/worker/handlers/plan-generation.ts`

### 需要改的文件

- `sidecar/src/worker/handlers/plan-generation.ts`

### Prompt

```
修改 sidecar/src/worker/handlers/plan-generation.ts 的 buildGeneratePlanPrompt 函数：

1. 将 JSON schema 示例中的 visualPrompt 描述从英文改为中文：

原来（约第 308 行）：
"visualPrompt": "A highly detailed English stable diffusion prompt for this scene. The subject should be the main focus with '${scene.name}' as background. Style: photorealistic, professional photography."

改为：
"visualPrompt": "用中文描述这个分镜场景的画面，包括人物的动作、表情、姿态以及与场景环境的空间关系。描述应具体、可视化，风格为专业摄影、真实质感。示例：一个3岁的小男孩站在花园小径上，好奇地弯腰观察一朵黄色野花，阳光从侧面洒落，背景是模糊的绿色植被。"

2. 将注意事项部分的第 3 条从：
"3. 每个 visualPrompt 必须使用英文"
改为：
"3. 所有内容统一使用中文（包括 visualPrompt）"

3. 保持其他注意事项不变。
```

### 自测命令

```bash
pnpm dev:all
# 在 UI 中创建项目 → 选择场景 → 生成方案
# 查看生成的预案中 visualPrompt 字段是否为中文
```

### 完成定义

- 新生成的预案中 `visualPrompt` 为中文描述
- prompt 中不再要求英文
- 已有预案不受影响（只影响新生成的）

---

## Step 9：前端类型定义 + API 客户端

### 目标

新增前端的 ModelAsset 类型和 API 客户端函数。

### 需要读的文件

- `src/types/scene-asset.ts`（参考类型定义风格）
- `src/lib/scene-assets-api.ts`（参考 API 客户端风格）
- `src/lib/api-config.ts`（apiUrl 函数）

### 需要改的文件

- 新增 `src/types/model-asset.ts`
- 新增 `src/lib/model-assets-api.ts`

### Prompt

```
1. 新建 src/types/model-asset.ts，参考 src/types/scene-asset.ts 的风格：

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

2. 新建 src/lib/model-assets-api.ts，参考 src/lib/scene-assets-api.ts 的风格：

实现以下函数（每个都用 apiUrl() 构建请求 URL，统一错误处理）：
- getModelAssets(projectId?: string): Promise<ModelAssetListResponse>
  GET /api/assets/models?projectId=xxx
- getModelAsset(id: string): Promise<ModelAsset>
  GET /api/assets/models/:id
- createModelAsset(input: CreateModelAssetInput): Promise<ModelAsset>
  POST /api/assets/models
- updateModelAsset(id: string, input: UpdateModelAssetInput): Promise<ModelAsset>
  PUT /api/assets/models/:id
- deleteModelAsset(id: string): Promise<void>
  DELETE /api/assets/models/:id
- autoMatchModels(projectId: string, people: Array<{ id: string; role: string; gender?: string; age?: number }>): Promise<AutoMatchResult>
  POST /api/assets/models/auto-match
```

### 自测命令

```bash
pnpm build
# TypeScript 编译通过即可（前端还没有使用这些函数）
```

### 完成定义

- 类型定义文件和 API 客户端文件存在
- `pnpm build` 通过，无类型错误
- API 客户端函数签名与后端端点对应

---

## Step 10：资产页模特 Tab（路由 + Tab 切换）

### 目标

在资产页新增"模特"Tab，实现模特列表 + 空状态。

### 需要读的文件

- `src/routes/assets.tsx`（Tab 布局）
- `src/routes/assets.scenes.tsx`（场景页完整实现，作为参考）
- `src/components/assets/SceneCard.tsx`（卡片组件参考）
- `src/components/assets/SceneForm.tsx`（表单组件参考）
- `docs/specs/model-assets/02-ux-spec.md` §5.1, §5.2（ModelAssetCard, ModelAssetForm）

### 需要改的文件

- `src/routes/assets.tsx`（新增 Tab）
- 新增 `src/routes/assets.models.tsx`（模特列表页）
- 新增 `src/components/assets/ModelCard.tsx`（模特卡片）
- 新增 `src/components/assets/ModelForm.tsx`（模特表单弹窗）

### Prompt

```
1. 修改 src/routes/assets.tsx：
   在 tabs 数组中新增模特 Tab（放在场景之后、道具之前）：
   { to: '/assets/models', label: '模特', icon: Users },
   （需要从 lucide-react import Users 图标）
   注意：不设 disabled: true，因为这个 Tab 是本次实现的。

2. 新建 src/routes/assets.models.tsx：
   参考 src/routes/assets.scenes.tsx 的完整结构：
   - 使用 createFileRoute('/assets/models')
   - 用 useQuery 调用 getModelAssets() 获取模特列表
   - 用 useMutation 实现创建/更新/删除
   - 空状态：使用 UX Spec 中定义的文案和布局
     标题："还没有模特资产"
     说明："创建模特资产并上传参考照片，用于生成预览图时保持人物一致性"
     CTA：[+ 新建模特]
   - 列表使用 ModelCard 组件展示
   - 新建/编辑使用 Dialog + ModelForm

3. 新建 src/components/assets/ModelCard.tsx：
   参考 SceneCard 的交互模式：
   - 展示：主参考照（或占位图）、名称、性别/年龄标签、外观提示词摘要（截断40字）、标签、参考图数量
   - hover 显示编辑/删除按钮
   - 项目专属模特左上角标签
   - 点击触发 onEdit 回调

4. 新建 src/components/assets/ModelForm.tsx：
   参考 SceneForm 的弹窗表单模式：
   - 字段：名称(必填)、性别(下拉)、年龄范围(两个数字输入)、描述、主参考照(图片上传)、辅助参考(多图上传, 最多5张)、外观提示词(多行文本)、标签
   - 外观提示词 placeholder："描述人物的外貌特征，如肤色、发型、体型、五官等"
   - 外观提示词 hint："此描述将注入到出图提示词中，帮助 AI 保持人物外观一致"
   - 图片上传复用现有的 uploadImage/deleteImage 函数（从 scene-assets-api 导入或独立的 upload API）
   - 提交时校验名称非空
```

### 自测命令

```bash
pnpm dev:all
# 浏览器打开 http://localhost:1420/assets/models
# 验证：
# 1. Tab 切换正常（场景/模特/道具/服装）
# 2. 空状态正确展示
# 3. 点击"新建模特"打开表单弹窗
# 4. 填写信息并保存，列表出现新卡片
# 5. 点击卡片可编辑，hover 可删除
```

### 完成定义

- 资产页有"模特"Tab 且可正常切换
- 模特列表 CRUD 完整可用
- 空状态/加载/错误状态正确展示
- 卡片展示所有关键信息
- 表单验证正常

---

## Step 11：项目模特配置区块（ProjectWorkspace 集成）

### 目标

在 ProjectWorkspace 中新增模特配置区块，支持手动选择和自动匹配。

### 需要读的文件

- `src/components/ProjectWorkspace.tsx`（了解工作区结构和区块样式）
- `src/components/CustomerInfoForm.tsx`（了解客户信息组件）
- `src/lib/projects-api.ts`（updateProject）
- `src/types/project.ts`（项目类型）
- `docs/specs/model-assets/02-ux-spec.md` §5.3, §5.4（PersonModelMapper, ProjectWorkspace 集成）

### 需要改的文件

- 新增 `src/components/ModelConfigSection.tsx`（模特配置区块）
- `src/components/ProjectWorkspace.tsx`（引入模特配置区块）
- `src/types/project.ts`（如需新增 selectedModels 字段）
- `src/lib/projects-api.ts`（如需更新 updateProject 的参数类型）

### Prompt

```
1. 检查 src/types/project.ts，确保 Project 类型中包含 selectedModels 字段（string 类型，JSON）。
   如果缺少，添加 selectedModels?: string;

2. 新建 src/components/ModelConfigSection.tsx：
   这是嵌入 ProjectWorkspace 的模特配置区块组件。

   Props：
   - projectId: string
   - customer: CustomerInfo | undefined（从 project.customer 解析）
   - selectedModels: string | undefined（project.selectedModels，JSON 字符串）
   - onUpdate: (selectedModels: ProjectModelConfig) => void

   行为：
   - 如果 customer.people 为空或 customer 不存在：
     显示引导提示 "请先填写客户信息，添加拍摄人物后即可配置模特"

   - 如果有 people：
     展示人物列表，每行显示：
     - 人物角色名（role）+ 性别/年龄标签
     - 已映射模特：显示模特缩略图+名称 + [更换][×] 按钮
     - 未映射：显示 [选择模特 ▾] 下拉按钮（使用 Popover/Select）

   - 顶部操作栏：
     - [自动匹配] 按钮（调用 autoMatchModels API）
     - [+ 新建模特] 按钮（打开 ModelForm 弹窗，projectId 预填当前项目）

   - 自动匹配结果用 Dialog 展示推荐列表，用户可逐个选择或全部应用

   - 区块标题旁显示状态 badge：已配置 N/M
   - 底部灰色说明：模特配置为可选步骤，跳过后生成的预览图不含人物参考

   - 模特选择用 useQuery 加载模特列表（getModelAssets(projectId)）
   - 映射变更时调用 onUpdate 回调

   样式：使用与其他区块一致的 rounded-xl border border-border bg-card p-5

3. 修改 src/components/ProjectWorkspace.tsx：
   在客户信息区块（<CustomerInfoForm>）之后、服装配置区块之前，
   新增 ModelConfigSection 组件：

   <ModelConfigSection
     projectId={projectId}
     customer={project.customer ? JSON.parse(project.customer) : undefined}
     selectedModels={project.selectedModels ?? undefined}
     onUpdate={(config) => {
       updateProjectMutation.mutate({
         selectedModels: JSON.stringify(config),
       } as any);
     }}
   />

   注意需要更新 updateProjectMutation 的类型以支持 selectedModels 字段。
```

### 自测命令

```bash
pnpm dev:all
# 浏览器操作：
# 1. 创建一个项目 → 填写客户信息（添加 2 个人物）
# 2. 在工作区看到模特配置区块
# 3. 未填客户信息时显示引导
# 4. 点击"选择模特"可以看到模特列表
# 5. 点击"自动匹配"触发匹配
# 6. 选择模特后 badge 更新
# 7. 刷新页面后映射仍存在
```

### 完成定义

- 模特配置区块在客户信息之后、服装之前正确显示
- 人物-模特映射 CRUD 正常
- 自动匹配可用
- 快速创建可用
- 映射持久化到 `projects.selected_models`
- 不阻塞方案生成（生成按钮始终不因模特而 disabled）

---

## Step 12：端到端验证

### 目标

验证完整流程：创建模特 → 项目映射 → 生成方案 → 生成预览图 → effectivePrompt 包含模特信息 + 参考图注入。

### 需要读的文件

- 无额外文件需要读，这是集成测试步骤

### 需要改的文件

- 无（除非发现 bug 需要修复）

### Prompt

```
这是一个端到端验证步骤，不涉及代码变更。请按以下流程手动测试：

1. 前置准备：
   - 确保有至少一个场景资产（含主图）
   - 在模特页创建一个模特：
     名称：小明
     性别：男
     年龄范围：3-5
     外观提示词：圆脸，短发齐刘海，大眼睛，皮肤白皙，微胖体型，穿着蓝色条纹T恤
     上传一张主参考照片
     添加 1-2 张辅助参考照片

2. 创建项目并配置：
   - 新建项目 "模特测试"
   - 选择场景
   - 填写客户信息：添加人物"宝宝"（男，3岁）
   - 在模特配置区块为"宝宝"选择模特"小明"

3. 生成方案：
   - 点击"生成方案"
   - 等待完成后查看预案
   - 确认 visualPrompt 为中文

4. 生成预览图：
   - 对第一个场景点击"生成参考图"
   - 在 Image Studio Lite 中查看 effectivePrompt
   - 确认包含 "## 人物外观描述" 段落
   - 确认段落中包含模特的 appearancePrompt 内容

5. 验证向后兼容：
   - 创建一个不配置模特的项目
   - 生成方案和预览图
   - 确认流程正常，effectivePrompt 中不包含 modelInfo 段落

如果发现问题，根据错误信息定位并修复。
```

### 自测命令

```bash
pnpm dev:all
# 在浏览器中执行上述手动测试步骤
```

### 完成定义

- 完整流程跑通：模特创建 → 映射 → 生成方案（中文 visualPrompt）→ 生成预览图（含模特 prompt + 参考图）
- 向后兼容：不配置模特的项目正常工作
- Image Studio Lite 中 effectivePrompt 可见模特外观信息
- 无控制台报错

---

## 步骤依赖关系

```
Step 1 (DB)
  ↓
Step 2 (CRUD API) → Step 3 (Auto-match API) → Step 4 (Docs)
  ↓
Step 5 (Prompt Rules) → Step 6 (Prompt Engine) → Step 7 (Image Gen)
  ↓
Step 8 (Chinese Prompt)     Step 9 (FE Types/API)
                                  ↓
                            Step 10 (模特 Tab)
                                  ↓
                            Step 11 (项目配置)
                                  ↓
                            Step 12 (E2E 验证)
```

可并行的步骤：
- Step 5-8（后端 Prompt 链路）可与 Step 9-10（前端基础）并行
- Step 4（文档）可与其他步骤并行
- Step 8（中文 Prompt）独立于模特相关步骤，可随时执行
