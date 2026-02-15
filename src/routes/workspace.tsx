import { createFileRoute } from '@tanstack/react-router';
import { AgentShell } from '@/components/agent/AgentShell';

interface WorkspaceSearchParams {
  action?: 'create-session';
}

export const Route = createFileRoute('/workspace')({
  validateSearch: (search: Record<string, unknown>): WorkspaceSearchParams => ({
    action: search.action === 'create-session' ? 'create-session' : undefined,
  }),
  component: WorkspacePage,
});

function WorkspacePage() {
  const { action } = Route.useSearch();
  return <AgentShell key={action || 'agent-workspace'} />;
}
