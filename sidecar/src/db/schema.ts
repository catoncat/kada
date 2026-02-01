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

// Plans 表
export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('single'), // 'single' | 'project'
  data: text('data').notNull(), // JSON string
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Settings 表（键值存储）
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// 类型导出
export type Provider = typeof providers.$inferSelect;
export type InsertProvider = typeof providers.$inferInsert;

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;
