import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Download,
  FolderUp,
  Layers3,
  Loader2,
  Redo2,
  SquarePen,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasBoard } from '@/components/workspace/CanvasBoard';
import { ChatPanel } from '@/components/workspace/ChatPanel';
import { ProviderGate } from '@/components/workspace/ProviderGate';
import { SessionList } from '@/components/workspace/SessionList';
import {
  applyCanvasOperations,
  cloneCanvasSnapshot,
  commitCanvasSnapshot,
  commitExternalCanvasSnapshot,
  createCanvasHistoryState,
  removeNodes,
  redoCanvasState,
  undoCanvasState,
  updateViewport,
  type CanvasHistoryState,
} from '@/components/workspace/canvas-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useDefaultProvider } from '@/hooks/useProviders';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import {
  useApplyWorkspaceActions,
  useCreateWorkspaceSession,
  useDeleteWorkspaceSession,
  useExportWorkspaceSession,
  useImportWorkspaceSession,
  usePostWorkspaceMessage,
  useSaveWorkspaceCanvas,
  useWorkspaceMessages,
  useWorkspaceSession,
  useWorkspaceSessions,
} from '@/hooks/useWorkspace';
import { isWorkspaceApiError } from '@/lib/workspace-api';
import { getModelAssets } from '@/lib/model-assets-api';
import { getSceneAssets } from '@/lib/scene-assets-api';
import type {
  WorkspaceActionCard,
  WorkspaceCanvasOperation,
  WorkspaceExportPayload,
  WorkspaceNode,
  WorkspaceViewport,
} from '@/types/workspace';

const DEFAULT_VIEWPORT = { x: 0, y: 0, scale: 1 };

function extractMentions(text: string): string[] {
  const tokens: string[] = [];
  const regex = /@([^\s@]+)/g;
  let match = regex.exec(text);
  while (match) {
    const token = match[1]?.trim();
    if (token) tokens.push(token);
    match = regex.exec(text);
  }
  return Array.from(new Set(tokens));
}

function saveJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function WorkspaceShell({
  action,
}: {
  action?: 'create-session';
}) {
  const navigate = useNavigate();
  const defaultProviderQuery = useDefaultProvider();
  const hasProvider = Boolean(defaultProviderQuery.data?.id);

  const sessionsQuery = useWorkspaceSessions({ enabled: hasProvider });
  const createSessionMutation = useCreateWorkspaceSession();
  const deleteSessionMutation = useDeleteWorkspaceSession();
  const sessionExportMutation = useExportWorkspaceSession();
  const sessionImportMutation = useImportWorkspaceSession();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [applyingCardId, setApplyingCardId] = useState<string | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasHistoryState>(() =>
    createCanvasHistoryState({ nodes: [], viewport: DEFAULT_VIEWPORT }),
  );
  const [sessionRevision, setSessionRevision] = useState<number>(1);
  const [dirty, setDirty] = useState(false);
  const [pendingReplaySnapshot, setPendingReplaySnapshot] = useState<{
    nodes: WorkspaceNode[];
    viewport: WorkspaceViewport;
  } | null>(null);

  const lastHydratedKeyRef = useRef<string>('');
  const routeActionHandledRef = useRef<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const sessionDetailQuery = useWorkspaceSession(activeSessionId, {
    enabled: hasProvider,
  });
  const messagesQuery = useWorkspaceMessages(activeSessionId, {
    enabled: hasProvider,
  });
  const saveCanvasMutation = useSaveWorkspaceCanvas();
  const postMessageMutation = usePostWorkspaceMessage();
  const applyActionsMutation = useApplyWorkspaceActions();

  const scenesQuery = useQuery({
    queryKey: ['sceneAssets'],
    queryFn: getSceneAssets,
    enabled: hasProvider,
  });

  const modelsQuery = useQuery({
    queryKey: ['modelAssets'],
    queryFn: getModelAssets,
    enabled: hasProvider,
  });

  const sessions = sessionsQuery.data?.data || [];
  const currentSession = sessionDetailQuery.data;
  const messages = messagesQuery.data?.data || [];

  useEffect(() => {
    if (!hasProvider) {
      setActiveSessionId(null);
      return;
    }

    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
      return;
    }

    if (activeSessionId && !sessions.some((item) => item.id === activeSessionId)) {
      setActiveSessionId(sessions[0]?.id || null);
    }
  }, [activeSessionId, hasProvider, sessions]);

  useEffect(() => {
    if (!currentSession) return;

    const hydrateKey = `${currentSession.id}:${currentSession.revision}`;
    if (hydrateKey === lastHydratedKeyRef.current) return;
    lastHydratedKeyRef.current = hydrateKey;

    setCanvasState(
      createCanvasHistoryState({
        nodes: currentSession.nodes,
        viewport: currentSession.viewport,
      }),
    );
    setSessionRevision(currentSession.revision);
    setSelectedNodeIds([]);
    setDirty(false);
    setPendingReplaySnapshot(null);
  }, [currentSession]);

  const saveCanvasDebounced = useDebouncedCallback(
    async (
      payload: {
        sessionId: string;
        revision: number;
        nodes: typeof canvasState.present.nodes;
        viewport: typeof canvasState.present.viewport;
      },
      skipWhenPending = true,
    ) => {
      if (skipWhenPending && saveCanvasMutation.isPending) return;

      try {
        const saved = await saveCanvasMutation.mutateAsync({
          sessionId: payload.sessionId,
          revision: payload.revision,
          nodes: payload.nodes,
          viewport: payload.viewport,
        });

        setSessionRevision(saved.revision);
        setDirty(false);
        setPendingReplaySnapshot(null);
      } catch (error) {
        if (isWorkspaceApiError(error) && error.code === 'REVISION_CONFLICT') {
          const pending = cloneCanvasSnapshot({
            nodes: payload.nodes,
            viewport: payload.viewport,
          });
          setPendingReplaySnapshot(pending);
          setErrorText('画布版本冲突，已刷新最新会话，可重放本地未提交变更。');
          void sessionDetailQuery.refetch();
          return;
        }

        setErrorText(error instanceof Error ? error.message : '画布保存失败');
      }
    },
    800,
  );

  useEffect(() => {
    if (!hasProvider) return;
    if (!activeSessionId) return;
    if (!dirty) return;

    saveCanvasDebounced({
      sessionId: activeSessionId,
      revision: sessionRevision,
      nodes: canvasState.present.nodes,
      viewport: canvasState.present.viewport,
    });
  }, [
    activeSessionId,
    canvasState.present.nodes,
    canvasState.present.viewport,
    dirty,
    hasProvider,
    saveCanvasDebounced,
    sessionRevision,
  ]);

  const canUndo = canvasState.past.length > 0;
  const canRedo = canvasState.future.length > 0;

  const selectedNodeCount = selectedNodeIds.length;

  const handleCreateSession = useCallback(async () => {
    if (!hasProvider) return null;
    try {
      const created = await createSessionMutation.mutateAsync({});
      setActiveSessionId(created.id);
      setErrorText(null);
      return created;
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '创建会话失败');
      return null;
    }
  }, [createSessionMutation, hasProvider]);

  useEffect(() => {
    if (!action) {
      routeActionHandledRef.current = null;
      return;
    }

    if (defaultProviderQuery.isLoading) return;

    if (routeActionHandledRef.current === action) return;
    routeActionHandledRef.current = action;

    if (action === 'create-session') {
      if (!hasProvider) {
        setErrorText('未配置默认 Provider，暂时无法新建工作台会话。');
        navigate({ to: '/workspace', search: {}, replace: true });
        return;
      }

      void handleCreateSession().finally(() => {
        navigate({ to: '/workspace', search: {}, replace: true });
      });
    }
  }, [action, defaultProviderQuery.isLoading, handleCreateSession, hasProvider, navigate]);

  const handleReplayPendingChanges = () => {
    if (!pendingReplaySnapshot) return;

    setCanvasState((prev) => commitExternalCanvasSnapshot(prev, pendingReplaySnapshot));
    setDirty(true);
    setPendingReplaySnapshot(null);
    setErrorText('已重放本地未提交变更，正在重新保存。');
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!hasProvider) return;
    const confirmed = window.confirm('确定删除该会话吗？删除后不可恢复。');
    if (!confirmed) return;

    try {
      await deleteSessionMutation.mutateAsync(sessionId);
      setErrorText(null);
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '删除会话失败');
    }
  };

  const handleMoveNodes = (nodeIds: string[], deltaX: number, deltaY: number) => {
    if (!hasProvider) return;
    if (nodeIds.length === 0) return;

    setCanvasState((prev) =>
      commitCanvasSnapshot(prev, (snapshot) => ({
        ...snapshot,
        nodes: snapshot.nodes.map((node) =>
          nodeIds.includes(node.id)
            ? {
                ...node,
                x: node.x + deltaX,
                y: node.y + deltaY,
              }
            : node,
        ),
      })),
    );
    setDirty(true);
  };

  const handleAddNote = () => {
    if (!hasProvider) return;

    const worldX = (320 - canvasState.present.viewport.x) / canvasState.present.viewport.scale;
    const worldY = (220 - canvasState.present.viewport.y) / canvasState.present.viewport.scale;

    const operations: WorkspaceCanvasOperation[] = [
      {
        type: 'addNode',
        node: {
          type: 'note',
          title: '新便签',
          x: worldX,
          y: worldY,
          width: 260,
          height: 180,
          zIndex: canvasState.present.nodes.length + 1,
          meta: { content: '输入你的创意备注...' },
        },
      },
    ];

    setCanvasState((prev) =>
      commitCanvasSnapshot(prev, (snapshot) => applyCanvasOperations(snapshot, operations)),
    );
    setDirty(true);
  };

  const handleGroupSelected = () => {
    if (!hasProvider) return;
    if (selectedNodeIds.length < 2) return;

    const operations: WorkspaceCanvasOperation[] = [
      {
        type: 'groupNodes',
        nodeIds: selectedNodeIds,
        title: '分组',
      },
    ];

    setCanvasState((prev) =>
      commitCanvasSnapshot(prev, (snapshot) => applyCanvasOperations(snapshot, operations)),
    );
    setDirty(true);
  };

  const handleDeleteSelected = () => {
    if (!hasProvider) return;
    if (selectedNodeIds.length === 0) return;

    setCanvasState((prev) =>
      commitCanvasSnapshot(prev, (snapshot) => removeNodes(snapshot, selectedNodeIds)),
    );
    setSelectedNodeIds([]);
    setDirty(true);
  };

  const handleSendMessage = async (text: string) => {
    if (!hasProvider || !activeSessionId) return;

    const mentionTokens = extractMentions(text);
    const sceneIds: string[] = [];
    const modelIds: string[] = [];

    const scenes = scenesQuery.data?.data || [];
    const models = modelsQuery.data?.data || [];

    for (const token of mentionTokens) {
      const scene = scenes.find((item) => item.name.includes(token));
      if (scene) sceneIds.push(scene.id);

      const model = models.find((item) => item.name.includes(token));
      if (model) modelIds.push(model.id);
    }

    try {
      await postMessageMutation.mutateAsync({
        sessionId: activeSessionId,
        content: text,
        selectedNodeIds,
        mentions: {
          scenes: Array.from(new Set(sceneIds)),
          models: Array.from(new Set(modelIds)),
        },
      });
      setErrorText(null);
      await Promise.all([messagesQuery.refetch(), sessionsQuery.refetch()]);
    } catch (error) {
      if (isWorkspaceApiError(error) && error.code === 'INVALID_ACTION_CARD') {
        setErrorText('建议解析失败，已保留你的输入，可直接重试。');
        void messagesQuery.refetch();
        return;
      }

      if (isWorkspaceApiError(error) && error.code === 'ASSET_NOT_FOUND') {
        setErrorText('引用资产不存在或已失效，请更换 @引用后重试。');
        return;
      }

      if (isWorkspaceApiError(error) && error.code === 'PROVIDER_REQUIRED') {
        setErrorText('默认 Provider 不可用，请前往设置修复后重试。');
        return;
      }

      setErrorText(error instanceof Error ? error.message : '发送消息失败');
    }
  };

  const handleApplyCard = async (card: WorkspaceActionCard) => {
    if (!hasProvider || !activeSessionId) return;
    setApplyingCardId(card.id);

    try {
      const result = await applyActionsMutation.mutateAsync({
        sessionId: activeSessionId,
        revision: sessionRevision,
        operations: card.operations,
      });

      setCanvasState((prev) =>
        commitExternalCanvasSnapshot(prev, {
          ...prev.present,
          nodes: result.nodes,
        }),
      );

      setSessionRevision(result.revision);
      setSelectedNodeIds((prev) =>
        prev.filter((nodeId) => result.nodes.some((node) => node.id === nodeId)),
      );
      setDirty(false);
      setErrorText(null);
      await sessionsQuery.refetch();
    } catch (error) {
      if (isWorkspaceApiError(error) && error.code === 'REVISION_CONFLICT') {
        setErrorText('应用失败：画布版本已变更，请刷新后重试。');
        await sessionDetailQuery.refetch();
      } else {
        setErrorText(error instanceof Error ? error.message : '应用动作卡失败');
      }
    } finally {
      setApplyingCardId(null);
    }
  };

  const handleExport = async () => {
    if (!activeSessionId) return;
    try {
      const payload = await sessionExportMutation.mutateAsync(activeSessionId);
      const filename = `workspace-${activeSessionId.slice(0, 8)}.json`;
      saveJsonFile(filename, payload);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '导出失败');
    }
  };

  const handleImportFromFile = async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as WorkspaceExportPayload;
      const imported = await sessionImportMutation.mutateAsync(payload);
      setActiveSessionId(imported.id);
      setErrorText(null);
    } catch (error) {
      if (isWorkspaceApiError(error) && error.code === 'INVALID_PAYLOAD') {
        setErrorText('导入失败：JSON 结构不合法，请检查 session/nodes/messages 字段。');
        return;
      }

      setErrorText(error instanceof Error ? error.message : '导入失败，请检查 JSON 格式');
    }
  };

  const centerPanel = (() => {
    if (!activeSessionId) {
      return (
        <div className="flex h-full min-h-0 flex-1 items-center justify-center">
          <div className="rounded-xl border border-dashed bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">请选择或创建一个会话</p>
            <Button className="mt-3" size="sm" onClick={() => void handleCreateSession()}>
              创建会话
            </Button>
          </div>
        </div>
      );
    }

    if (sessionDetailQuery.isLoading || !currentSession) {
      return (
        <div className="flex h-full min-h-0 flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-b bg-background px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCanvasState((prev) => undoCanvasState(prev));
                setDirty(true);
              }}
              disabled={!canUndo}
            >
              <Undo2 className="mr-1 h-3.5 w-3.5" />
              Undo
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCanvasState((prev) => redoCanvasState(prev));
                setDirty(true);
              }}
              disabled={!canRedo}
            >
              <Redo2 className="mr-1 h-3.5 w-3.5" />
              Redo
            </Button>
            <Button size="sm" variant="outline" onClick={handleAddNote}>
              <SquarePen className="mr-1 h-3.5 w-3.5" />
              新建便签
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGroupSelected}
              disabled={selectedNodeCount < 2}
            >
              <Layers3 className="mr-1 h-3.5 w-3.5" />
              分组
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeleteSelected}
              disabled={selectedNodeCount === 0}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              删除选中
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleExport} disabled={sessionExportMutation.isPending}>
                <Download className="mr-1 h-3.5 w-3.5" />
                导出 JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => importInputRef.current?.click()}
                disabled={sessionImportMutation.isPending}
              >
                <FolderUp className="mr-1 h-3.5 w-3.5" />
                导入 JSON
              </Button>
            </div>
          </div>
        </div>

        <CanvasBoard
          nodes={canvasState.present.nodes}
          viewport={canvasState.present.viewport}
          selectedNodeIds={selectedNodeIds}
          onSelectionChange={setSelectedNodeIds}
          onViewportChange={(nextViewport) => {
            setCanvasState((prev) => updateViewport(prev, nextViewport));
            setDirty(true);
          }}
          onMoveNodes={handleMoveNodes}
        />
      </div>
    );
  })();

  if (defaultProviderQuery.isLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ProviderGate enabled={hasProvider}>
      <div className="flex h-full min-h-0 overflow-hidden">
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onCreate={() => void handleCreateSession()}
          onDelete={(id) => void handleDeleteSession(id)}
          creating={createSessionMutation.isPending}
          loading={sessionsQuery.isLoading}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {errorText ? (
            <div className="p-3">
              <Alert variant="warning">
                <AlertTitle>提示</AlertTitle>
                <AlertDescription>
                  <p>{errorText}</p>
                  {pendingReplaySnapshot ? (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      onClick={handleReplayPendingChanges}
                    >
                      重放本地未提交变更
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            </div>
          ) : null}

          {centerPanel}
        </div>

        <ChatPanel
          messages={messages}
          onSend={handleSendMessage}
          sending={postMessageMutation.isPending}
          onApplyCard={(card) => void handleApplyCard(card)}
          applyingCardId={applyingCardId}
        />

        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void handleImportFromFile(file);
            event.currentTarget.value = '';
          }}
        />
      </div>
    </ProviderGate>
  );
}
