import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyWorkspaceActions,
  createWorkspaceSession,
  deleteWorkspaceSession,
  exportWorkspaceSession,
  getWorkspaceSession,
  importWorkspaceSession,
  listWorkspaceMessages,
  listWorkspaceSessions,
  postWorkspaceMessage,
  saveWorkspaceCanvas,
  updateWorkspaceSession,
} from '@/lib/workspace-api';
import type {
  WorkspaceCanvasOperation,
  WorkspaceExportPayload,
  WorkspaceNode,
  WorkspaceSessionStatus,
  WorkspaceViewport,
} from '@/types/workspace';

interface WorkspaceQueryOptions {
  enabled?: boolean;
}

export const workspaceKeys = {
  all: ['workspace'] as const,
  sessions: () => [...workspaceKeys.all, 'sessions'] as const,
  session: (id: string) => [...workspaceKeys.sessions(), id] as const,
  messages: (sessionId: string) =>
    [...workspaceKeys.all, 'messages', sessionId] as const,
};

export function useWorkspaceSessions(options?: WorkspaceQueryOptions) {
  return useQuery({
    queryKey: workspaceKeys.sessions(),
    queryFn: listWorkspaceSessions,
    enabled: options?.enabled ?? true,
  });
}

export function useWorkspaceSession(
  sessionId: string | null,
  options?: WorkspaceQueryOptions,
) {
  return useQuery({
    queryKey: workspaceKeys.session(sessionId || ''),
    queryFn: () => getWorkspaceSession(sessionId!),
    enabled: Boolean(sessionId) && (options?.enabled ?? true),
  });
}

export function useWorkspaceMessages(
  sessionId: string | null,
  options?: WorkspaceQueryOptions,
) {
  return useQuery({
    queryKey: workspaceKeys.messages(sessionId || ''),
    queryFn: () => listWorkspaceMessages(sessionId!),
    enabled: Boolean(sessionId) && (options?.enabled ?? true),
  });
}

export function useCreateWorkspaceSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input?: { title?: string }) => createWorkspaceSession(input),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.sessions() });
      queryClient.setQueryData(workspaceKeys.session(session.id), session);
    },
  });
}

export function useUpdateWorkspaceSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { title?: string; status?: WorkspaceSessionStatus };
    }) => updateWorkspaceSession(id, input),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.sessions() });
      queryClient.setQueryData(workspaceKeys.session(session.id), session);
    },
  });
}

export function useDeleteWorkspaceSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteWorkspaceSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.sessions() });
    },
  });
}

export function useSaveWorkspaceCanvas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      sessionId: string;
      revision: number;
      viewport: WorkspaceViewport;
      nodes: WorkspaceNode[];
    }) => saveWorkspaceCanvas(input),
    onSuccess: (session) => {
      queryClient.setQueryData(workspaceKeys.session(session.id), session);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.sessions() });
    },
  });
}

export function usePostWorkspaceMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      sessionId: string;
      content: string;
      selectedNodeIds?: string[];
      mentions?: { scenes?: string[]; models?: string[] };
    }) => postWorkspaceMessage(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.messages(variables.sessionId),
      });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.sessions() });
    },
  });
}

export function useApplyWorkspaceActions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      sessionId: string;
      revision: number;
      operations: WorkspaceCanvasOperation[];
    }) => applyWorkspaceActions(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.session(variables.sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.sessions(),
      });
    },
  });
}

export function useExportWorkspaceSession() {
  return useMutation({
    mutationFn: (sessionId: string) => exportWorkspaceSession(sessionId),
  });
}

export function useImportWorkspaceSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WorkspaceExportPayload) => importWorkspaceSession(payload),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.sessions() });
      queryClient.setQueryData(workspaceKeys.session(session.id), session);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.messages(session.id) });
    },
  });
}
