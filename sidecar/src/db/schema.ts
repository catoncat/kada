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
