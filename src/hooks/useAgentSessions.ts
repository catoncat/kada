import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  abortAgentSession,
  createAgentSession,
  deleteAgentSession,
  followUpAgentSession,
  getAgentCapabilities,
  getAgentSession,
  listAgentOutputs,
  listAgentSessions,
  promoteFollowUpToSteerAgentSession,
  steerAgentSession,
  updateAgentSession,
} from '@/lib/agent-api';
import type { AgentMention, AgentSessionSummary } from '@/types/agent';

interface QueryOptions {
  enabled?: boolean;
}

export const agentKeys = {
  all: ['agent'] as const,
  sessions: () => [...agentKeys.all, 'sessions'] as const,
  capabilities: () => [...agentKeys.all, 'capabilities'] as const,
  session: (id: string) => [...agentKeys.sessions(), id] as const,
  outputs: (sessionId: string, kind?: 'photo' | 'copy') =>
    [...agentKeys.all, 'outputs', sessionId, kind || 'all'] as const,
};

interface AgentSessionsResponse {
  data: AgentSessionSummary[];
  total: number;
}

export function useAgentSessions(options?: QueryOptions) {
  return useQuery({
    queryKey: agentKeys.sessions(),
    queryFn: listAgentSessions,
    enabled: options?.enabled ?? true,
  });
}

export function useAgentCapabilities(options?: QueryOptions) {
  return useQuery({
    queryKey: agentKeys.capabilities(),
    queryFn: getAgentCapabilities,
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
      queryClient.setQueryData<AgentSessionsResponse>(
        agentKeys.sessions(),
        (prev) => {
          const prevData = prev?.data || [];
          const existed = prevData.some((item) => item.id === session.id);
          const nextData = [
            session,
            ...prevData.filter((item) => item.id !== session.id),
          ];
          return {
            data: nextData,
            total: existed
              ? prev?.total ?? nextData.length
              : (prev?.total ?? prevData.length) + 1,
          };
        },
      );
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
    mutationFn: ({
      sessionId,
      text,
      clientMessageId,
      mentions,
    }: {
      sessionId: string;
      text: string;
      clientMessageId: string;
      mentions?: AgentMention[];
    }) => steerAgentSession(sessionId, text, clientMessageId, mentions),
  });
}

export function useFollowUpAgentSession() {
  return useMutation({
    mutationFn: ({
      sessionId,
      text,
      clientMessageId,
      mentions,
    }: {
      sessionId: string;
      text: string;
      clientMessageId: string;
      mentions?: AgentMention[];
    }) => followUpAgentSession(sessionId, text, clientMessageId, mentions),
  });
}

export function usePromoteFollowUpToSteerAgentSession() {
  return useMutation({
    mutationFn: ({
      sessionId,
      clientMessageId,
      text,
    }: {
      sessionId: string;
      clientMessageId: string;
      text?: string;
    }) =>
      promoteFollowUpToSteerAgentSession(sessionId, {
        clientMessageId,
        text,
      }),
  });
}

export function useAbortAgentSession() {
  return useMutation({
    mutationFn: (sessionId: string) => abortAgentSession(sessionId),
  });
}
