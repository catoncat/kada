export interface AgentFlags {
  externalEventBridge: boolean;
  queueAppliedEvent: boolean;
  autoFollowUpOnSessionRunning: boolean;
  toolResultEnhancement: boolean;
}

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (typeof raw !== 'string') {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (!value) {
    return fallback;
  }
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
    return true;
  }
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return false;
  }
  return fallback;
}

export function getAgentFlags(): AgentFlags {
  return {
    externalEventBridge: readBoolEnv('AGENT_EXTERNAL_EVENT_BRIDGE', true),
    queueAppliedEvent: readBoolEnv('AGENT_QUEUE_APPLIED_EVENT', true),
    autoFollowUpOnSessionRunning: readBoolEnv(
      'AGENT_AUTO_FOLLOWUP_ON_SESSION_RUNNING',
      true,
    ),
    toolResultEnhancement: readBoolEnv('AGENT_TOOLRESULT_ENHANCEMENT', true),
  };
}
