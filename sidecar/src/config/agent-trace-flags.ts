export type AgentTraceLevel = 'basic' | 'payload' | 'wire';

export interface AgentTraceFlags {
  enabled: boolean;
  level: AgentTraceLevel;
  sampleRate: number;
  maxEventBytes: number;
  wireEnabled: boolean;
  wireMaxFileBytes: number;
  retentionHours: number;
  redactKeys: string[];
  providerHosts: string[];
}

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim().toLowerCase();
  if (!value) return fallback;
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
    return true;
  }
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return false;
  }
  return fallback;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw !== 'string') return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function readLevelEnv(name: string, fallback: AgentTraceLevel): AgentTraceLevel {
  const raw = process.env[name];
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim().toLowerCase();
  if (value === 'basic' || value === 'payload' || value === 'wire') {
    return value;
  }
  return fallback;
}

function readListEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (typeof raw !== 'string' || !raw.trim()) {
    return [...fallback];
  }

  const values = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (values.length === 0) {
    return [...fallback];
  }

  return values;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

const DEFAULT_REDACT_KEYS = [
  'authorization',
  'apiKey',
  'apikey',
  'token',
  'password',
  'secret',
  'cookie',
  'set-cookie',
];

let cachedFlags: AgentTraceFlags | null = null;

export function getAgentTraceFlags(): AgentTraceFlags {
  if (cachedFlags) return cachedFlags;

  const isProduction = process.env.NODE_ENV === 'production';
  const enabled = readBoolEnv('AGENT_TRACE_ENABLED', !isProduction);
  const level = readLevelEnv('AGENT_TRACE_LEVEL', 'basic');
  const sampleRate = clamp(
    readNumberEnv('AGENT_TRACE_SAMPLE_RATE', 1),
    0,
    1,
  );
  const maxEventBytes = Math.max(
    512,
    Math.floor(readNumberEnv('AGENT_TRACE_MAX_EVENT_BYTES', 4096)),
  );
  const wireEnabled = readBoolEnv('AGENT_TRACE_WIRE_ENABLED', false);
  const wireMaxFileBytes = Math.max(
    16 * 1024,
    Math.floor(readNumberEnv('AGENT_TRACE_WIRE_MAX_FILE_BYTES', 262144)),
  );
  const retentionHours = Math.max(
    1,
    Math.floor(readNumberEnv('AGENT_TRACE_RETENTION_HOURS', 72)),
  );
  const redactKeys = readListEnv('AGENT_TRACE_REDACT_KEYS', DEFAULT_REDACT_KEYS);
  const providerHosts = readListEnv('AGENT_TRACE_PROVIDER_HOSTS', []);

  cachedFlags = {
    enabled,
    level,
    sampleRate,
    maxEventBytes,
    wireEnabled,
    wireMaxFileBytes,
    retentionHours,
    redactKeys,
    providerHosts,
  };

  return cachedFlags;
}

export function resetAgentTraceFlagsCache(): void {
  cachedFlags = null;
}

export function shouldSampleTrace(traceId: string | null | undefined): boolean {
  const flags = getAgentTraceFlags();
  if (!flags.enabled) return false;
  if (flags.sampleRate >= 1) return true;
  if (flags.sampleRate <= 0) return false;

  const source = (traceId || '').trim();
  if (!source) {
    return Math.random() < flags.sampleRate;
  }

  // 使用稳定哈希保证同一 trace 下采样结果一致。
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  const ratio = hash / 0xffffffff;
  return ratio <= flags.sampleRate;
}
