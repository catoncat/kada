import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  abortAgentSession,
  createAgentSession,
  deleteAgentSession,
  followUpAgentSession,
  getAgentSession,
  listAgentOutputs,
  listAgentSessions,
  steerAgentSession,
  updateAgentSession,
} from '@/lib/agent-api';

interface QueryOptions {
  enabled?: boolean;
}

export const agentKeys = {
  all: ['agent'] as const,
  sessions: () => [...agentKeys.all, 'sessions'] as const,
  session: (id: string) => [...agentKeys.sessions(), id] as const,
  outputs: (sessionId: string, kind?: 'photo' | 'copy') =>
    [...agentKeys.all, 'outputs', sessionId, kind || 'all'] as const,
};

export function useAgentSessions(options?: QueryOptions) {
  return useQuery({
    queryKey: agentKeys.sessions(),
    queryFn: listAgentSessions,
    enabled: options?.enabled ?? true,
  });
}

export function useAgentSession(
  sessionId: string | null,
  options?: QueryOptions,
) {
  return useQuery({
    queryKey: agentKeys.session(sessionId || ''),
    queryFn: () => getAgentSession(sessionId!),
    enabled: Boolean(sessionId) && (options?.enabled ?? true),
  });
}

export function useAgentOutputs(
  sessionId: string | null,
  kind?: 'photo' | 'copy',
  options?: QueryOptions,
) {
  return useQuery({
    queryKey: agentKeys.outputs(sessionId || '', kind),
    queryFn: () => listAgentOutputs({ sessionId: sessionId!, kind }),
    enabled: Boolean(sessionId) && (options?.enabled ?? true),
  });
}

export function useCreateAgentSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input?: {
      title?: string;
      providerId?: string;
      engine?: 'coding-agent' | 'agent-core';
    }) => createAgentSession(input),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.sessions() });
      queryClient.setQueryData(agentKeys.session(session.id), session);
    },
  });
}

export function useUpdateAgentSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      input,
    }: {
      sessionId: string;
      input: { title?: string; archived?: boolean };
    }) => updateAgentSession(sessionId, input),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.sessions() });
      queryClient.setQueryData(agentKeys.session(session.id), session);
    },
  });
}

export function useDeleteAgentSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => deleteAgentSession(sessionId),
    onSuccess: (_result, sessionId) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.sessions() });
      queryClient.removeQueries({
        queryKey: agentKeys.session(sessionId),
        exact: true,
      });
      queryClient.removeQueries({
        queryKey: agentKeys.outputs(sessionId),
        exact: false,
      });
    },
  });
}

export function useSteerAgentSession() {
  return useMutation({
    mutationFn: ({ sessionId, text }: { sessionId: string; text: string }) =>
      steerAgentSession(sessionId, text),
  });
}

export function useFollowUpAgentSession() {
  return useMutation({
    mutationFn: ({ sessionId, text }: { sessionId: string; text: string }) =>
      followUpAgentSession(sessionId, text),
  });
}

export function useAbortAgentSession() {
  return useMutation({
    mutationFn: (sessionId: string) => abortAgentSession(sessionId),
  });
}
