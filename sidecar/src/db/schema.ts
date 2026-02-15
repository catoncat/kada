import { sqliteTable, text, integer, blob, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Providers 表
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  format: text('format').notNull(), // 'gemini' | 'openai' | 'local'
  routingProfile: text('routing_profile').default('native'), // 'native' | 'openai_compat_chat_only' | 'openai_compat_full'
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key').notNull(),
  textModel: text('text_model').notNull(),
  imageModel: text('image_model').notNull(),
  capabilities: text('capabilities'), // JSON - provider capability probes and routing hints
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Projects 表（替代原 plans 表）
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  // 项目级提示词：参与所有 AI 能力的上下文拼接（可为空）
  projectPrompt: text('project_prompt'),
  status: text('status').notNull().default('draft'), // 'draft' | 'configured' | 'generated'
  selectedScene: text('selected_scene'), // 场景资产 ID（单选）
  customer: text('customer'), // JSON（客户信息：type, ageRange, count, relation, notes）
  selectedModels: text('selected_models'), // JSON（模特配置：{ personModelMap, autoMatch }）
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
  defaultLighting: text('default_lighting'),
  tags: text('tags'), // JSON 数组
  isOutdoor: integer('is_outdoor', { mode: 'boolean' }).default(false),
  style: text('style'), // JSON（风格属性：colorTone, lightingMood, era）
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Model Assets 表（模特资产）
export const modelAssets = sqliteTable('model_assets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  gender: text('gender'), // 'male' | 'female' | 'other'
  ageRangeMin: integer('age_range_min'),
  ageRangeMax: integer('age_range_max'),
  appearancePrompt: text('appearance_prompt'),
  primaryImage: text('primary_image'), // 主参考照片路径
  referenceImages: text('reference_images'), // JSON 数组（辅助参考照片）
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Embedding Profiles 表（全局激活 embedding 配置）
export const embeddingProfiles = sqliteTable('embedding_profiles', {
  id: text('id').primaryKey(),
  providerId: text('provider_id'),
  endpoint: text('endpoint').notNull(),
  apiKeyRef: text('api_key_ref'),
  model: text('model').notNull(),
  vectorDim: integer('vector_dim').notNull(),
  normalize: integer('normalize', { mode: 'boolean' }).notNull().default(true),
  status: text('status').notNull().default('active'), // 'active' | 'reindexing' | 'disabled'
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Asset Embeddings 表（向量主表，支持 fallback 扫描）
export const assetEmbeddings = sqliteTable(
  'asset_embeddings',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id').notNull(),
    profileId: text('profile_id').notNull(),
    vector: blob('vector', { mode: 'buffer' }).notNull(), // float32 bytes
    vectorNorm: real('vector_norm').notNull().default(0),
    indexedAt: integer('indexed_at', { mode: 'timestamp' }),
    sourceHash: text('source_hash').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (table) => ({
    assetProfileUnique: uniqueIndex('asset_embeddings_asset_profile_unique').on(
      table.assetId,
      table.profileId,
    ),
  }),
);

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
  diagnostics: text('diagnostics'), // JSON - 执行观测信息（路由、参考图数量、画幅等）
  validation: text('validation'), // JSON - 产物硬验收结果
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

// Task Replay Idempotency（任务重放幂等请求记录）
export const taskReplayRequests = sqliteTable('task_replay_requests', {
  id: text('id').primaryKey(), // `${sourceTaskId}:${requestId}`
  sourceTaskId: text('source_task_id').notNull(),
  newTaskId: text('new_task_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// Workspace Sessions 表（独立会话中心）
export const workspaceSessions = sqliteTable('workspace_sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'archived'
  revision: integer('revision').notNull().default(1), // 乐观锁版本号
  canvasViewport: text('canvas_viewport'), // JSON - { x, y, scale }
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp' }),
});

// Workspace Messages 表（会话消息）
export const workspaceMessages = sqliteTable('workspace_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  actionCards: text('action_cards'), // JSON - WorkspaceActionCard[]
  meta: text('meta'), // JSON - 扩展字段（注入上下文、告警等）
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// Workspace Nodes 表（画布节点）
export const workspaceNodes = sqliteTable('workspace_nodes', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  type: text('type').notNull(), // 'sceneAssetCard' | 'modelAssetCard' | 'note' | 'group'
  title: text('title'),
  x: integer('x').notNull().default(0),
  y: integer('y').notNull().default(0),
  width: integer('width').notNull().default(220),
  height: integer('height').notNull().default(160),
  zIndex: integer('z_index').notNull().default(1),
  groupId: text('group_id'),
  meta: text('meta'), // JSON - assetId、描述、注释内容等
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Agent Sessions 表（Agent 会话）
export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  engine: text('engine').notNull().default('coding-agent'), // 'coding-agent' | 'agent-core'
  status: text('status').notNull().default('idle'), // 'idle' | 'running' | 'failed' | 'aborted'
  providerId: text('provider_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  lastTurnAt: integer('last_turn_at', { mode: 'timestamp' }),
});

// Agent Entries 表（消息与可回放记录）
export const agentEntries = sqliteTable('agent_entries', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  entryType: text('entry_type').notNull(), // 'user' | 'assistant' | 'toolResult' | 'custom'
  parentEntryId: text('parent_entry_id'),
  payloadJson: text('payload_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// Agent Events 表（流式事件）
export const agentEvents = sqliteTable('agent_events', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  turnId: text('turn_id'),
  seq: integer('seq').notNull(),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// Agent Outputs 表（照片/文案产物）
export const agentOutputs = sqliteTable('agent_outputs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  turnId: text('turn_id'),
  kind: text('kind').notNull(), // 'photo' | 'copy'
  refId: text('ref_id'),
  contentJson: text('content_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// 类型导出
export type Provider = typeof providers.$inferSelect;
export type InsertProvider = typeof providers.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

export type SceneAsset = typeof sceneAssets.$inferSelect;
export type InsertSceneAsset = typeof sceneAssets.$inferInsert;

export type ModelAsset = typeof modelAssets.$inferSelect;
export type InsertModelAsset = typeof modelAssets.$inferInsert;

export type EmbeddingProfile = typeof embeddingProfiles.$inferSelect;
export type InsertEmbeddingProfile = typeof embeddingProfiles.$inferInsert;

export type AssetEmbedding = typeof assetEmbeddings.$inferSelect;
export type InsertAssetEmbedding = typeof assetEmbeddings.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

export type GenerationRun = typeof generationRuns.$inferSelect;
export type InsertGenerationRun = typeof generationRuns.$inferInsert;

export type GenerationArtifact = typeof generationArtifacts.$inferSelect;
export type InsertGenerationArtifact = typeof generationArtifacts.$inferInsert;

export type TaskReplayRequest = typeof taskReplayRequests.$inferSelect;
export type InsertTaskReplayRequest = typeof taskReplayRequests.$inferInsert;

export type WorkspaceSession = typeof workspaceSessions.$inferSelect;
export type InsertWorkspaceSession = typeof workspaceSessions.$inferInsert;

export type WorkspaceMessage = typeof workspaceMessages.$inferSelect;
export type InsertWorkspaceMessage = typeof workspaceMessages.$inferInsert;

export type WorkspaceNode = typeof workspaceNodes.$inferSelect;
export type InsertWorkspaceNode = typeof workspaceNodes.$inferInsert;

export type AgentSession = typeof agentSessions.$inferSelect;
export type InsertAgentSession = typeof agentSessions.$inferInsert;

export type AgentEntry = typeof agentEntries.$inferSelect;
export type InsertAgentEntry = typeof agentEntries.$inferInsert;

export type AgentEvent = typeof agentEvents.$inferSelect;
export type InsertAgentEvent = typeof agentEvents.$inferInsert;

export type AgentOutput = typeof agentOutputs.$inferSelect;
export type InsertAgentOutput = typeof agentOutputs.$inferInsert;
