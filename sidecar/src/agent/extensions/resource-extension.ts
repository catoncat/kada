import type { ExtensionFactory } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { and, eq, like, or, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { modelAssets, projects, sceneAssets } from '../../db/schema';
import type { RuntimeToolDefinition } from './tool-definitions';

export interface ResourceExtensionDeps {
  sessionId: string;
}

function toJsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createResourceExtension(deps: ResourceExtensionDeps): ExtensionFactory {
  const toolDefinitions = createResourceToolDefinitions(deps);

  return (pi) => {
    for (const tool of toolDefinitions) {
      pi.registerTool(tool);
    }
  };
}

export function createResourceToolDefinitions(
  deps: ResourceExtensionDeps,
): RuntimeToolDefinition[] {
  return [
    {
      name: 'resource_search_scenes',
      label: 'Search Scenes',
      description: '按关键词检索场景资源，返回结构化结果列表。',
      parameters: Type.Object({
        query: Type.String({ description: '检索关键词（名称/描述）' }),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
      }),
      async execute(_toolCallId, params) {
        const db = getDb();
        const limitValue = typeof params.limit === 'number' ? params.limit : null;
        const limit = limitValue === null ? 12 : Math.max(1, Math.min(50, limitValue));
        const q = params.query.trim();

        const rows = await db
          .select({
            id: sceneAssets.id,
            name: sceneAssets.name,
            description: sceneAssets.description,
            tags: sceneAssets.tags,
            score: sql<number>`CASE
              WHEN ${sceneAssets.name} LIKE ${`%${q}%`} THEN 2
              WHEN ${sceneAssets.description} LIKE ${`%${q}%`} THEN 1
              ELSE 0
            END`,
          })
          .from(sceneAssets)
          .where(
            or(
              like(sceneAssets.name, `%${q}%`),
              like(sceneAssets.description, `%${q}%`),
              like(sceneAssets.tags, `%${q}%`),
            ),
          )
          .limit(limit);

        const data = rows
          .map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description || '',
            tags: row.tags || '[]',
            score: row.score || 0,
          }))
          .sort((a, b) => b.score - a.score);

        return {
          content: [{ type: 'text', text: toJsonText({ query: q, data }) }],
          details: { count: data.length },
        };
      },
    },
    {
      name: 'resource_search_models',
      label: 'Search Models',
      description: '按关键词检索模特资源，返回结构化结果列表。',
      parameters: Type.Object({
        query: Type.String({ description: '检索关键词（名称/外观提示）' }),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
      }),
      async execute(_toolCallId, params) {
        const db = getDb();
        const limitValue = typeof params.limit === 'number' ? params.limit : null;
        const limit = limitValue === null ? 12 : Math.max(1, Math.min(50, limitValue));
        const q = params.query.trim();

        const rows = await db
          .select({
            id: modelAssets.id,
            name: modelAssets.name,
            gender: modelAssets.gender,
            appearancePrompt: modelAssets.appearancePrompt,
            score: sql<number>`CASE
              WHEN ${modelAssets.name} LIKE ${`%${q}%`} THEN 2
              WHEN ${modelAssets.appearancePrompt} LIKE ${`%${q}%`} THEN 1
              ELSE 0
            END`,
          })
          .from(modelAssets)
          .where(
            or(
              like(modelAssets.name, `%${q}%`),
              like(modelAssets.appearancePrompt, `%${q}%`),
            ),
          )
          .limit(limit);

        const data = rows
          .map((row) => ({
            id: row.id,
            name: row.name,
            gender: row.gender || '',
            appearancePrompt: row.appearancePrompt || '',
            score: row.score || 0,
          }))
          .sort((a, b) => b.score - a.score);

        return {
          content: [{ type: 'text', text: toJsonText({ query: q, data }) }],
          details: { count: data.length },
        };
      },
    },
    {
      name: 'resource_get_project_context',
      label: 'Get Project Context',
      description: '读取项目上下文（标题、客户、场景/模特选择、已生成计划）。',
      parameters: Type.Object({
        projectId: Type.String({ description: '项目 ID' }),
      }),
      async execute(_toolCallId, params) {
        const db = getDb();
        const [project] = await db
          .select()
          .from(projects)
          .where(and(eq(projects.id, params.projectId)))
          .limit(1);

        if (!project) {
          throw new Error(`项目不存在: ${params.projectId}`);
        }

        const payload = {
          id: project.id,
          title: project.title,
          projectPrompt: project.projectPrompt || '',
          customer: project.customer || null,
          selectedScene: project.selectedScene || null,
          selectedModels: project.selectedModels || null,
          generatedPlan: project.generatedPlan || null,
          updatedAt: project.updatedAt ? project.updatedAt.toISOString() : null,
        };

        return {
          content: [{ type: 'text', text: toJsonText(payload) }],
          details: { projectId: project.id },
        };
      },
    },
  ];
}
