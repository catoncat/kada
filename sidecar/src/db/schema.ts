import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Providers 表
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  format: text('format').notNull(), // 'gemini' | 'openai' | 'local'
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key').notNull(),
  textModel: text('text_model').notNull(),
  imageModel: text('image_model').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Projects 表（替代原 plans 表）
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'), // 'draft' | 'configured' | 'generated'
  selectedScene: text('selected_scene'), // 场景资产 ID（单选）
  selectedOutfits: text('selected_outfits'), // JSON 数组
  selectedProps: text('selected_props'), // JSON 数组
  params: text('params'), // JSON（拍摄参数）
  customer: text('customer'), // JSON（客户信息：type, ageRange, count, relation, notes）
  generatedPlan: text('generated_plan'), // JSON（AI 生成的预案结果）
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Scene Assets 表（场景资产）
export const sceneAssets = sqliteTable('scene_assets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  primaryImage: text('primary_image'), // 主图路径
  supplementaryImages: text('supplementary_images'), // JSON 数组
  defaultLighting: text('default_lighting'),
  recommendedProps: text('recommended_props'), // JSON 数组（道具 ID）
  tags: text('tags'), // JSON 数组
  isOutdoor: integer('is_outdoor', { mode: 'boolean' }).default(false),
  style: text('style'), // JSON（风格属性：colorTone, lightingMood, era）
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Settings 表（键值存储）
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Tasks 表（通用异步任务队列）
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'image-generation' | 'text-generation' | ...
  status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'failed'
  input: text('input').notNull(), // JSON string - 任务输入参数
  output: text('output'), // JSON string - 任务输出结果
  error: text('error'), // 失败时的错误信息
  relatedId: text('related_id'), // 可选：关联的业务 ID（如 projectId）
  relatedMeta: text('related_meta'), // 可选：关联的元数据
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Generation Runs 表（一次生成动作的执行记录）
export const generationRuns = sqliteTable('generation_runs', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'plan-generation' | 'image-generation' | 'image-edit' | 'asset-caption'
  trigger: text('trigger').notNull().default('ui'), // 'ui' | 'worker' | 'agent'
  status: text('status').notNull().default('queued'), // 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  relatedType: text('related_type'), // 'project' | 'asset'
  relatedId: text('related_id'),
  effectivePrompt: text('effective_prompt'), // 最终用于出图的提示词
  promptContext: text('prompt_context'), // JSON - 结构化上下文
  parentRunId: text('parent_run_id'), // 可选：父 run（用于表达 run 的继承关系）
  taskId: text('task_id'), // 关联的 task ID（如果是通过 task 触发的）
  error: text('error'), // JSON - 失败时的错误信息
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Generation Artifacts 表（生成产物）
export const generationArtifacts = sqliteTable('generation_artifacts', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(), // 关联的 run ID
  type: text('type').notNull().default('image'), // 'image' | 'json' | 'text'
  mimeType: text('mime_type'), // 'image/png' | 'image/jpeg' | ...
  filePath: text('file_path'), // 相对路径，如 'uploads/xxx.png'
  width: integer('width'),
  height: integer('height'),
  sizeBytes: integer('size_bytes'),
  ownerType: text('owner_type'), // 'asset' | 'projectPlanVersion' | 'planScene'
  ownerId: text('owner_id'),
  ownerSlot: text('owner_slot'), // 'cover' | 'scene:0' | ...
  effectivePrompt: text('effective_prompt'), // 冗余存储，便于查询
  promptContext: text('prompt_context'), // JSON
  referenceImages: text('reference_images'), // JSON 数组 - 参考图片
  editInstruction: text('edit_instruction'), // 编辑指令（image-edit 时使用）
  parentArtifactId: text('parent_artifact_id'), // 基于上一张图编辑时使用
  createdAt: integer('created_at', { mode: 'timestamp' }),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }), // 软删除
});

// 类型导出
export type Provider = typeof providers.$inferSelect;
export type InsertProvider = typeof providers.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

export type SceneAsset = typeof sceneAssets.$inferSelect;
export type InsertSceneAsset = typeof sceneAssets.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

export type GenerationRun = typeof generationRuns.$inferSelect;
export type InsertGenerationRun = typeof generationRuns.$inferInsert;

export type GenerationArtifact = typeof generationArtifacts.$inferSelect;
export type InsertGenerationArtifact = typeof generationArtifacts.$inferInsert;
