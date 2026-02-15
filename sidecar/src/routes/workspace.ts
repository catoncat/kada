import { Hono } from 'hono';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import {
  modelAssets,
  sceneAssets,
  workspaceMessages,
  workspaceNodes,
  workspaceSessions,
} from '../db/schema';
import {
  type WorkspaceActionCard,
  type WorkspaceCanvasOperation,
  type WorkspaceNodeInput,
  type WorkspaceNodeType,
  WorkspaceSuggestionError,
  generateWorkspaceSuggestion,
} from '../services/workspace-suggestion';

export const workspaceRoutes = new Hono();

const MESSAGE_LIMIT = 200;
const MAX_NODE_COUNT = 1000;

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toErrorResponse(options: {
  message: string;
  code: string;
  status: number;
  extra?: Record<string, unknown>;
}) {
  return {
    error: options.message,
    code: options.code,
    ...(options.extra || {}),
  };
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeViewport(value: unknown): { x: number; y: number; scale: number } {
  if (!isRecord(value)) {
    return { x: 0, y: 0, scale: 1 };
  }

  const x = typeof value.x === 'number' && Number.isFinite(value.x) ? value.x : 0;
  const y = typeof value.y === 'number' && Number.isFinite(value.y) ? value.y : 0;
  const scale =
    typeof value.scale === 'number' && Number.isFinite(value.scale) && value.scale > 0
      ? value.scale
      : 1;

  return { x, y, scale };
}

function normalizeNodeType(value: unknown): WorkspaceNodeType {
  if (value === 'sceneAssetCard') return 'sceneAssetCard';
  if (value === 'modelAssetCard') return 'modelAssetCard';
  if (value === 'note') return 'note';
  if (value === 'group') return 'group';
  return 'note';
}

function normalizeNode(input: unknown): WorkspaceNodeInput {
  const row = isRecord(input) ? input : {};

  return {
    id:
      typeof row.id === 'string' && row.id.trim() ? row.id.trim() : randomUUID(),
    type: normalizeNodeType(row.type),
    title: typeof row.title === 'string' ? row.title.trim() : '',
    x: typeof row.x === 'number' && Number.isFinite(row.x) ? row.x : 0,
    y: typeof row.y === 'number' && Number.isFinite(row.y) ? row.y : 0,
    width:
      typeof row.width === 'number' && Number.isFinite(row.width)
        ? Math.max(80, row.width)
        : 220,
    height:
      typeof row.height === 'number' && Number.isFinite(row.height)
        ? Math.max(60, row.height)
        : 160,
    zIndex:
      typeof row.zIndex === 'number' && Number.isFinite(row.zIndex)
        ? Math.max(0, row.zIndex)
        : 1,
    groupId: typeof row.groupId === 'string' ? row.groupId : null,
    meta: isRecord(row.meta) ? row.meta : {},
  };
}

function parseNodeRow(row: typeof workspaceNodes.$inferSelect): WorkspaceNodeInput {
  return {
    id: row.id,
    type: normalizeNodeType(row.type),
    title: row.title || '',
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    zIndex: row.zIndex,
    groupId: row.groupId,
    meta: parseJson<Record<string, unknown>>(row.meta, {}),
  };
}

function parseMessageRow(row: typeof workspaceMessages.$inferSelect) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    content: row.content,
    actionCards: parseJson<WorkspaceActionCard[]>(row.actionCards, []),
    meta: parseJson<Record<string, unknown>>(row.meta, {}),
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  };
}

function parseSessionSummary(
  row: typeof workspaceSessions.$inferSelect,
  nodeCount: number,
) {
  return {
    id: row.id,
    title: row.title,
    status: row.status === 'archived' ? 'archived' : 'active',
    revision: row.revision,
    nodeCount,
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    viewport: normalizeViewport(parseJson(row.canvasViewport, {})),
  };
}

async function getSessionOr404(sessionId: string) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(workspaceSessions)
    .where(eq(workspaceSessions.id, sessionId))
    .limit(1);

  if (!session) {
    return {
      ok: false as const,
      response: toErrorResponse({
        message: '会话不存在。',
        code: 'SESSION_NOT_FOUND',
        status: 404,
      }),
    };
  }

  return {
    ok: true as const,
    session,
  };
}

async function pruneMessages(sessionId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: workspaceMessages.id })
    .from(workspaceMessages)
    .where(eq(workspaceMessages.sessionId, sessionId))
    .orderBy(desc(workspaceMessages.createdAt), desc(workspaceMessages.id));

  if (rows.length <= MESSAGE_LIMIT) return;

  const overflowIds = rows.slice(MESSAGE_LIMIT).map((item) => item.id);
  if (overflowIds.length === 0) return;

  await db
    .delete(workspaceMessages)
    .where(
      and(
        eq(workspaceMessages.sessionId, sessionId),
        inArray(workspaceMessages.id, overflowIds),
      ),
    );
}

function applyOperation(
  nodesMap: Map<string, WorkspaceNodeInput>,
  op: WorkspaceCanvasOperation,
): void {
  if (op.type === 'addNode') {
    const normalized = normalizeNode({
      ...op.node,
      id: op.node.id || randomUUID(),
    });
    nodesMap.set(normalized.id, normalized);
    return;
  }

  if (op.type === 'moveNode') {
    const existing = nodesMap.get(op.nodeId);
    if (!existing) {
      throw new WorkspaceSuggestionError({
        message: `节点不存在：${op.nodeId}`,
        status: 422,
        code: 'INVALID_ACTION_CARD',
      });
    }
    existing.x = op.x;
    existing.y = op.y;
    nodesMap.set(existing.id, existing);
    return;
  }

  if (op.type === 'groupNodes') {
    if (!Array.isArray(op.nodeIds) || op.nodeIds.length < 2) {
      throw new WorkspaceSuggestionError({
        message: '分组操作至少需要两个节点。',
        status: 422,
        code: 'INVALID_ACTION_CARD',
      });
    }

    const members = op.nodeIds
      .map((nodeId) => nodesMap.get(nodeId))
      .filter((node): node is WorkspaceNodeInput => Boolean(node));

    if (members.length < 2) {
      throw new WorkspaceSuggestionError({
        message: '无法分组：节点不存在。',
        status: 422,
        code: 'INVALID_ACTION_CARD',
      });
    }

    const groupId = op.groupId?.trim() || randomUUID();

    for (const node of members) {
      node.groupId = groupId;
      nodesMap.set(node.id, node);
    }

    if (!nodesMap.has(groupId)) {
      const minX = Math.min(...members.map((node) => node.x));
      const minY = Math.min(...members.map((node) => node.y));
      const maxX = Math.max(...members.map((node) => node.x + node.width));
      const maxY = Math.max(...members.map((node) => node.y + node.height));

      nodesMap.set(groupId, {
        id: groupId,
        type: 'group',
        title: op.title?.trim() || '新分组',
        x: minX - 24,
        y: minY - 24,
        width: Math.max(180, maxX - minX + 48),
        height: Math.max(120, maxY - minY + 48),
        zIndex: 0,
        groupId: null,
        meta: {},
      });
    }
    return;
  }

  if (op.type === 'updateNote') {
    const existing = nodesMap.get(op.nodeId);
    if (!existing) {
      throw new WorkspaceSuggestionError({
        message: `便签节点不存在：${op.nodeId}`,
        status: 422,
        code: 'INVALID_ACTION_CARD',
      });
    }

    if (existing.type !== 'note') {
      throw new WorkspaceSuggestionError({
        message: `节点不是便签：${op.nodeId}`,
        status: 422,
        code: 'INVALID_ACTION_CARD',
      });
    }

    existing.title = op.title?.trim() || existing.title;
    existing.meta = {
      ...(isRecord(existing.meta) ? existing.meta : {}),
      content: op.content,
    };

    nodesMap.set(existing.id, existing);
  }
}

function remapActionCardsNodeIds(
  cards: WorkspaceActionCard[],
  nodeIdMap: Map<string, string>,
): WorkspaceActionCard[] {
  return cards.map((card) => ({
    ...card,
    id: randomUUID(),
    operations: card.operations.map((op) => {
      if (op.type === 'addNode') {
        const oldNodeId = typeof op.node.id === 'string' ? op.node.id : null;
        const remappedNodeId = oldNodeId ? nodeIdMap.get(oldNodeId) : undefined;
        const remappedGroupId =
          typeof op.node.groupId === 'string'
            ? (nodeIdMap.get(op.node.groupId) || op.node.groupId)
            : undefined;
        return {
          ...op,
          node: {
            ...op.node,
            id: remappedNodeId || oldNodeId || undefined,
            groupId: remappedGroupId,
          },
        } satisfies WorkspaceCanvasOperation;
      }

      if (op.type === 'moveNode') {
        return {
          ...op,
          nodeId: nodeIdMap.get(op.nodeId) || op.nodeId,
        } satisfies WorkspaceCanvasOperation;
      }

      if (op.type === 'groupNodes') {
        return {
          ...op,
          groupId: op.groupId ? nodeIdMap.get(op.groupId) || op.groupId : op.groupId,
          nodeIds: op.nodeIds.map((nodeId) => nodeIdMap.get(nodeId) || nodeId),
        } satisfies WorkspaceCanvasOperation;
      }

      return {
        ...op,
        nodeId: nodeIdMap.get(op.nodeId) || op.nodeId,
      } satisfies WorkspaceCanvasOperation;
    }),
  }));
}

async function loadSessionDetail(sessionId: string) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(workspaceSessions)
    .where(eq(workspaceSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  const rows = await db
    .select()
    .from(workspaceNodes)
    .where(eq(workspaceNodes.sessionId, sessionId))
    .orderBy(workspaceNodes.zIndex, workspaceNodes.createdAt);

  const nodes = rows.map(parseNodeRow);

  return {
    ...parseSessionSummary(session, nodes.length),
    nodes,
  };
}

// 会话列表
workspaceRoutes.get('/sessions', async (c) => {
  try {
    const db = getDb();
    const sessions = await db
      .select()
      .from(workspaceSessions)
      .orderBy(desc(workspaceSessions.updatedAt));

    const data = await Promise.all(
      sessions.map(async (session) => {
        const [counter] = await db
          .select({ value: count() })
          .from(workspaceNodes)
          .where(eq(workspaceNodes.sessionId, session.id));

        return parseSessionSummary(session, counter?.value ?? 0);
      }),
    );

    return c.json({ data, total: data.length });
  } catch (error) {
    console.error('[Workspace] list sessions error:', error);
    return c.json(
      toErrorResponse({
        message: '获取会话列表失败。',
        code: 'INTERNAL_ERROR',
        status: 500,
      }),
      500,
    );
  }
});

// 创建会话
workspaceRoutes.post('/sessions', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();
    const now = new Date();

    const title =
      isRecord(body) && typeof body.title === 'string' && body.title.trim()
        ? body.title.trim()
        : '未命名工作台会话';

    const id = randomUUID();
    await db.insert(workspaceSessions).values({
      id,
      title,
      status: 'active',
      revision: 1,
      canvasViewport: JSON.stringify({ x: 0, y: 0, scale: 1 }),
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
    });

    const detail = await loadSessionDetail(id);
    return c.json(detail, 201);
  } catch (error) {
    console.error('[Workspace] create session error:', error);
    return c.json(
      toErrorResponse({
        message: '创建会话失败。',
        code: 'INTERNAL_ERROR',
        status: 500,
      }),
      500,
    );
  }
});

// 获取会话详情
workspaceRoutes.get('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const detail = await loadSessionDetail(sessionId);
  if (!detail) {
    return c.json(
      toErrorResponse({
        message: '会话不存在。',
        code: 'SESSION_NOT_FOUND',
        status: 404,
      }),
      404,
    );
  }
  return c.json(detail);
});

// 更新会话
workspaceRoutes.patch('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const sessionResult = await getSessionOr404(sessionId);
  if (!sessionResult.ok) {
    return c.json(sessionResult.response, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  if (!isRecord(body)) {
    return c.json(
      toErrorResponse({
        message: '请求体格式不正确。',
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return c.json(
        toErrorResponse({
          message: 'title 不能为空。',
          code: 'INVALID_PAYLOAD',
          status: 400,
        }),
        400,
      );
    }
    updates.title = body.title.trim();
  }

  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'archived') {
      return c.json(
        toErrorResponse({
          message: 'status 只能是 active 或 archived。',
          code: 'INVALID_PAYLOAD',
          status: 400,
        }),
        400,
      );
    }
    updates.status = body.status;
  }

  const db = getDb();
  await db.update(workspaceSessions).set(updates).where(eq(workspaceSessions.id, sessionId));

  const detail = await loadSessionDetail(sessionId);
  return c.json(detail);
});

// 删除会话
workspaceRoutes.delete('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const sessionResult = await getSessionOr404(sessionId);
  if (!sessionResult.ok) {
    return c.json(sessionResult.response, 404);
  }

  const db = getDb();
  await db.delete(workspaceMessages).where(eq(workspaceMessages.sessionId, sessionId));
  await db.delete(workspaceNodes).where(eq(workspaceNodes.sessionId, sessionId));
  await db.delete(workspaceSessions).where(eq(workspaceSessions.id, sessionId));

  return c.json({ success: true });
});

// 消息列表
workspaceRoutes.get('/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id');
  const sessionResult = await getSessionOr404(sessionId);
  if (!sessionResult.ok) {
    return c.json(sessionResult.response, 404);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(workspaceMessages)
    .where(eq(workspaceMessages.sessionId, sessionId))
    .orderBy(workspaceMessages.createdAt, workspaceMessages.id);

  return c.json({ data: rows.map(parseMessageRow), total: rows.length });
});

// 发送消息并生成建议
workspaceRoutes.post('/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id');
  const sessionResult = await getSessionOr404(sessionId);
  if (!sessionResult.ok) {
    return c.json(sessionResult.response, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  if (!isRecord(body)) {
    return c.json(
      toErrorResponse({
        message: '请求体格式不正确。',
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return c.json(
      toErrorResponse({
        message: '消息内容不能为空。',
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  const selectedNodeIds = Array.isArray(body.selectedNodeIds)
    ? body.selectedNodeIds
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const mentions = isRecord(body.mentions) ? body.mentions : {};
  const mentionSceneIds = Array.isArray(mentions.scenes)
    ? mentions.scenes
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const mentionModelIds = Array.isArray(mentions.models)
    ? mentions.models
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const db = getDb();
  const now = new Date();

  const userMessageId = randomUUID();
  await db.insert(workspaceMessages).values({
    id: userMessageId,
    sessionId,
    role: 'user',
    content,
    actionCards: null,
    meta: JSON.stringify({
      selectedNodeIds,
      mentions: {
        scenes: mentionSceneIds,
        models: mentionModelIds,
      },
    }),
    createdAt: now,
  });

  await db
    .update(workspaceSessions)
    .set({
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(eq(workspaceSessions.id, sessionId));

  try {
    const selectedRows = selectedNodeIds.length
      ? await db
          .select()
          .from(workspaceNodes)
          .where(
            and(
              eq(workspaceNodes.sessionId, sessionId),
              inArray(workspaceNodes.id, selectedNodeIds),
            ),
          )
      : [];

    const selectedNodes = selectedRows.map(parseNodeRow);

    const sceneMentions = mentionSceneIds.length
      ? await db
          .select({
            id: sceneAssets.id,
            name: sceneAssets.name,
            description: sceneAssets.description,
          })
          .from(sceneAssets)
          .where(inArray(sceneAssets.id, mentionSceneIds))
      : [];

    const modelMentions = mentionModelIds.length
      ? await db
          .select({
            id: modelAssets.id,
            name: modelAssets.name,
            appearancePrompt: modelAssets.appearancePrompt,
          })
          .from(modelAssets)
          .where(inArray(modelAssets.id, mentionModelIds))
      : [];

    if (sceneMentions.length !== mentionSceneIds.length) {
      return c.json(
        toErrorResponse({
          message: '部分 @场景 资源不存在。',
          code: 'ASSET_NOT_FOUND',
          status: 404,
        }),
        404,
      );
    }

    if (modelMentions.length !== mentionModelIds.length) {
      return c.json(
        toErrorResponse({
          message: '部分 @模特 资源不存在。',
          code: 'ASSET_NOT_FOUND',
          status: 404,
        }),
        404,
      );
    }

    const suggestion = await generateWorkspaceSuggestion({
      userInput: content,
      selectedNodes,
      mentionScenes: sceneMentions,
      mentionModels: modelMentions,
    });

    const assistantMessageId = randomUUID();
    const assistantNow = new Date();

    await db.insert(workspaceMessages).values({
      id: assistantMessageId,
      sessionId,
      role: 'assistant',
      content: suggestion.assistantMessage,
      actionCards: JSON.stringify(suggestion.actionCards),
      meta: JSON.stringify({ rawText: suggestion.rawText }),
      createdAt: assistantNow,
    });

    await db
      .update(workspaceSessions)
      .set({
        lastMessageAt: assistantNow,
        updatedAt: assistantNow,
      })
      .where(eq(workspaceSessions.id, sessionId));

    await pruneMessages(sessionId);

    const [userMessageRow] = await db
      .select()
      .from(workspaceMessages)
      .where(eq(workspaceMessages.id, userMessageId))
      .limit(1);
    const [assistantMessageRow] = await db
      .select()
      .from(workspaceMessages)
      .where(eq(workspaceMessages.id, assistantMessageId))
      .limit(1);

    return c.json({
      userMessage: userMessageRow ? parseMessageRow(userMessageRow) : null,
      assistantMessage: assistantMessageRow
        ? parseMessageRow(assistantMessageRow)
        : null,
    });
  } catch (error) {
    if (error instanceof WorkspaceSuggestionError) {
      return c.json(
        toErrorResponse({
          message: error.message,
          code: error.code,
          status: error.status,
        }),
        error.status as 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502,
      );
    }

    console.error('[Workspace] post message error:', error);
    return c.json(
      toErrorResponse({
        message: '发送消息失败。',
        code: 'INTERNAL_ERROR',
        status: 500,
      }),
      500,
    );
  }
});

// 保存画布（整体快照）
workspaceRoutes.put('/sessions/:id/canvas', async (c) => {
  const sessionId = c.req.param('id');
  const sessionResult = await getSessionOr404(sessionId);
  if (!sessionResult.ok) {
    return c.json(sessionResult.response, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  if (!isRecord(body)) {
    return c.json(
      toErrorResponse({
        message: '请求体格式不正确。',
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  const revision =
    typeof body.revision === 'number' && Number.isFinite(body.revision)
      ? body.revision
      : null;

  if (revision === null) {
    return c.json(
      toErrorResponse({
        message: 'revision 为必填数字。',
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  if (revision !== sessionResult.session.revision) {
    return c.json(
      toErrorResponse({
        message: '会话版本冲突，请刷新后重试。',
        code: 'REVISION_CONFLICT',
        status: 409,
        extra: {
          currentRevision: sessionResult.session.revision,
        },
      }),
      409,
    );
  }

  if (!Array.isArray(body.nodes)) {
    return c.json(
      toErrorResponse({
        message: 'nodes 必须是数组。',
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  const normalizedNodes = body.nodes.map(normalizeNode);
  if (normalizedNodes.length > MAX_NODE_COUNT) {
    return c.json(
      toErrorResponse({
        message: `节点数量不能超过 ${MAX_NODE_COUNT}。`,
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  const viewport = normalizeViewport(body.viewport);

  const db = getDb();
  const now = new Date();

  db.transaction((tx) => {
    tx.delete(workspaceNodes).where(eq(workspaceNodes.sessionId, sessionId)).run();

    if (normalizedNodes.length > 0) {
      tx.insert(workspaceNodes)
        .values(
          normalizedNodes.map((node) => ({
            id: node.id,
            sessionId,
            type: node.type,
            title: node.title,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            zIndex: node.zIndex,
            groupId: node.groupId || null,
            meta: JSON.stringify(node.meta || {}),
            createdAt: now,
            updatedAt: now,
          })),
        )
        .run();
    }

    tx.update(workspaceSessions)
      .set({
        revision: sessionResult.session.revision + 1,
        canvasViewport: JSON.stringify(viewport),
        updatedAt: now,
      })
      .where(eq(workspaceSessions.id, sessionId))
      .run();
  });

  const detail = await loadSessionDetail(sessionId);
  return c.json(detail);
});

// 应用动作卡
workspaceRoutes.post('/sessions/:id/actions/apply', async (c) => {
  const sessionId = c.req.param('id');
  const sessionResult = await getSessionOr404(sessionId);
  if (!sessionResult.ok) {
    return c.json(sessionResult.response, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  if (!isRecord(body)) {
    return c.json(
      toErrorResponse({
        message: '请求体格式不正确。',
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  const revision =
    typeof body.revision === 'number' && Number.isFinite(body.revision)
      ? body.revision
      : null;

  if (revision === null) {
    return c.json(
      toErrorResponse({
        message: 'revision 为必填数字。',
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  if (revision !== sessionResult.session.revision) {
    return c.json(
      toErrorResponse({
        message: '会话版本冲突，请刷新后重试。',
        code: 'REVISION_CONFLICT',
        status: 409,
        extra: {
          currentRevision: sessionResult.session.revision,
        },
      }),
      409,
    );
  }

  if (!Array.isArray(body.operations) || body.operations.length === 0) {
    return c.json(
      toErrorResponse({
        message: 'operations 不能为空。',
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(workspaceNodes)
    .where(eq(workspaceNodes.sessionId, sessionId));
  const nodesMap = new Map<string, WorkspaceNodeInput>();
  for (const row of rows) {
    const node = parseNodeRow(row);
    nodesMap.set(node.id, node);
  }

  try {
    for (const rawOp of body.operations) {
      if (!isRecord(rawOp) || typeof rawOp.type !== 'string') {
        throw new WorkspaceSuggestionError({
          message: 'operation 结构不正确。',
          status: 422,
          code: 'INVALID_ACTION_CARD',
        });
      }

      const opType = rawOp.type;
      if (opType === 'addNode') {
        if (!isRecord(rawOp.node)) {
          throw new WorkspaceSuggestionError({
            message: 'addNode 缺少 node。',
            status: 422,
            code: 'INVALID_ACTION_CARD',
          });
        }
        applyOperation(nodesMap, {
          type: 'addNode',
          node: rawOp.node as Partial<WorkspaceNodeInput> & {
            type: WorkspaceNodeType;
            title?: string;
          },
        });
        continue;
      }

      if (opType === 'moveNode') {
        if (
          typeof rawOp.nodeId !== 'string' ||
          typeof rawOp.x !== 'number' ||
          typeof rawOp.y !== 'number'
        ) {
          throw new WorkspaceSuggestionError({
            message: 'moveNode 参数不完整。',
            status: 422,
            code: 'INVALID_ACTION_CARD',
          });
        }
        applyOperation(nodesMap, {
          type: 'moveNode',
          nodeId: rawOp.nodeId,
          x: rawOp.x,
          y: rawOp.y,
        });
        continue;
      }

      if (opType === 'groupNodes') {
        if (!Array.isArray(rawOp.nodeIds)) {
          throw new WorkspaceSuggestionError({
            message: 'groupNodes 缺少 nodeIds。',
            status: 422,
            code: 'INVALID_ACTION_CARD',
          });
        }

        const nodeIds = rawOp.nodeIds
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean);

        applyOperation(nodesMap, {
          type: 'groupNodes',
          nodeIds,
          groupId: typeof rawOp.groupId === 'string' ? rawOp.groupId : undefined,
          title: typeof rawOp.title === 'string' ? rawOp.title : undefined,
        });
        continue;
      }

      if (opType === 'updateNote') {
        if (typeof rawOp.nodeId !== 'string' || typeof rawOp.content !== 'string') {
          throw new WorkspaceSuggestionError({
            message: 'updateNote 参数不完整。',
            status: 422,
            code: 'INVALID_ACTION_CARD',
          });
        }

        applyOperation(nodesMap, {
          type: 'updateNote',
          nodeId: rawOp.nodeId,
          content: rawOp.content,
          title: typeof rawOp.title === 'string' ? rawOp.title : undefined,
        });
        continue;
      }

      throw new WorkspaceSuggestionError({
        message: `不支持的 operation 类型：${opType}`,
        status: 422,
        code: 'INVALID_ACTION_CARD',
      });
    }
  } catch (error) {
    if (error instanceof WorkspaceSuggestionError) {
      return c.json(
        toErrorResponse({
          message: error.message,
          code: error.code,
          status: error.status,
        }),
        error.status as 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502,
      );
    }

    return c.json(
      toErrorResponse({
        message: '应用动作失败。',
        code: 'INVALID_ACTION_CARD',
        status: 422,
      }),
      422,
    );
  }

  const nextNodes = Array.from(nodesMap.values());
  if (nextNodes.length > MAX_NODE_COUNT) {
    return c.json(
      toErrorResponse({
        message: `节点数量不能超过 ${MAX_NODE_COUNT}。`,
        code: 'INVALID_ACTION_CARD',
        status: 422,
      }),
      422,
    );
  }

  const now = new Date();

  db.transaction((tx) => {
    tx.delete(workspaceNodes).where(eq(workspaceNodes.sessionId, sessionId)).run();

    if (nextNodes.length > 0) {
      tx.insert(workspaceNodes)
        .values(
          nextNodes.map((node) => ({
            id: node.id,
            sessionId,
            type: node.type,
            title: node.title,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            zIndex: node.zIndex,
            groupId: node.groupId || null,
            meta: JSON.stringify(node.meta || {}),
            createdAt: now,
            updatedAt: now,
          })),
        )
        .run();
    }

    tx.update(workspaceSessions)
      .set({
        revision: sessionResult.session.revision + 1,
        updatedAt: now,
      })
      .where(eq(workspaceSessions.id, sessionId))
      .run();
  });

  const detail = await loadSessionDetail(sessionId);
  return c.json({
    revision: detail?.revision ?? sessionResult.session.revision + 1,
    nodes: detail?.nodes || [],
    appliedOperationCount: body.operations.length,
  });
});

// 导出会话
workspaceRoutes.get('/sessions/:id/export', async (c) => {
  const sessionId = c.req.param('id');
  const detail = await loadSessionDetail(sessionId);
  if (!detail) {
    return c.json(
      toErrorResponse({
        message: '会话不存在。',
        code: 'SESSION_NOT_FOUND',
        status: 404,
      }),
      404,
    );
  }

  const db = getDb();
  const messageRows = await db
    .select()
    .from(workspaceMessages)
    .where(eq(workspaceMessages.sessionId, sessionId))
    .orderBy(workspaceMessages.createdAt, workspaceMessages.id);

  return c.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    session: {
      id: detail.id,
      title: detail.title,
      status: detail.status,
      revision: detail.revision,
      viewport: detail.viewport,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
    },
    nodes: detail.nodes,
    messages: messageRows.map(parseMessageRow),
  });
});

// 导入会话
workspaceRoutes.post('/import', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!isRecord(body) || !isRecord(body.payload)) {
    return c.json(
      toErrorResponse({
        message: '导入数据格式错误。',
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  const payload = body.payload as Record<string, unknown>;
  if (
    !isRecord(payload.session) ||
    !Array.isArray(payload.nodes) ||
    !Array.isArray(payload.messages)
  ) {
    return c.json(
      toErrorResponse({
        message: '导入数据缺少必要字段。',
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  const sessionPayload = payload.session as Record<string, unknown>;

  const sessionTitle =
    typeof sessionPayload.title === 'string' && sessionPayload.title.trim()
      ? sessionPayload.title.trim()
      : '导入会话';

  const normalizedNodes = (payload.nodes as unknown[]).map(normalizeNode);
  if (normalizedNodes.length > MAX_NODE_COUNT) {
    return c.json(
      toErrorResponse({
        message: `导入节点数量不能超过 ${MAX_NODE_COUNT}。`,
        code: 'INVALID_PAYLOAD',
        status: 400,
      }),
      400,
    );
  }

  const nodeIdMap = new Map<string, string>();
  for (const node of normalizedNodes) {
    nodeIdMap.set(node.id, randomUUID());
  }

  const importedNodes = normalizedNodes.map((node) => ({
    ...node,
    id: nodeIdMap.get(node.id) || node.id,
    groupId: node.groupId ? nodeIdMap.get(node.groupId) || node.groupId : null,
  }));

  const parsedMessages = (payload.messages as unknown[])
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => {
      const actionCards = remapActionCardsNodeIds(
        Array.isArray(item.actionCards)
          ? (item.actionCards as WorkspaceActionCard[])
          : [],
        nodeIdMap,
      );

      return {
        id: randomUUID(),
        role:
          item.role === 'assistant' || item.role === 'system' ? item.role : 'user',
        content: typeof item.content === 'string' ? item.content : '',
        actionCards,
        meta: isRecord(item.meta) ? item.meta : {},
      };
    })
    .filter((message) => message.content.trim().length > 0)
    .slice(-MESSAGE_LIMIT);

  const sessionId = randomUUID();
  const now = new Date();

  const db = getDb();
  db.transaction((tx) => {
    tx.insert(workspaceSessions)
      .values({
        id: sessionId,
        title: `${sessionTitle}（导入）`,
        status: sessionPayload.status === 'archived' ? 'archived' : 'active',
        revision: 1,
        canvasViewport: JSON.stringify(normalizeViewport(sessionPayload.viewport)),
        createdAt: now,
        updatedAt: now,
        lastMessageAt: parsedMessages.length > 0 ? now : null,
      })
      .run();

    if (importedNodes.length > 0) {
      tx.insert(workspaceNodes)
        .values(
          importedNodes.map((node) => ({
            id: node.id,
            sessionId,
            type: node.type,
            title: node.title,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            zIndex: node.zIndex,
            groupId: node.groupId || null,
            meta: JSON.stringify(node.meta || {}),
            createdAt: now,
            updatedAt: now,
          })),
        )
        .run();
    }

    if (parsedMessages.length > 0) {
      tx.insert(workspaceMessages)
        .values(
          parsedMessages.map((message) => ({
            id: message.id,
            sessionId,
            role: message.role,
            content: message.content,
            actionCards: JSON.stringify(message.actionCards || []),
            meta: JSON.stringify(message.meta || {}),
            createdAt: now,
          })),
        )
        .run();
    }
  });

  const detail = await loadSessionDetail(sessionId);
  return c.json(detail, 201);
});
