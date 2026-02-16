import {
  formatPayloadForDisplay,
  sanitizeTextForDisplay,
} from '@/lib/agent-display';
import type { AgentEntry } from '@/types/agent';

export interface OptimisticUserMessage {
  id: string;
  text: string;
  createdAt: string;
}

export interface StreamingInsertion {
  id: string;
  text: string;
  position: number;
  seq: number;
  createdAt?: string;
}

interface ParsedAssistantPayload {
  text: string;
  turnId: string | null;
  stopReason: string | null;
  errorMessage: string | null;
}

export interface AgentMessageRow {
  kind: 'message';
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string | null;
  optimistic?: boolean;
}

export interface AgentSummaryRow {
  kind: 'summary';
  id: string;
  title: string;
  detail: string;
  createdAt: string | null;
  level: 'info' | 'error';
}

export type AgentMessageListRow = AgentMessageRow | AgentSummaryRow;

function toPayloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  return payload as Record<string, unknown>;
}

function extractText(payload: unknown): string {
  const row = toPayloadRecord(payload);

  if (typeof row.text === 'string' && row.text.trim()) {
    return sanitizeTextForDisplay(row.text.trim());
  }

  if (typeof row.delta === 'string' && row.delta.trim()) {
    return sanitizeTextForDisplay(row.delta.trim());
  }

  if (typeof row.message === 'string' && row.message.trim()) {
    return sanitizeTextForDisplay(row.message.trim());
  }

  return '';
}

function extractAssistantText(payload: unknown): string {
  const row = toPayloadRecord(payload);

  if (typeof row.text === 'string' && row.text.trim()) {
    return sanitizeTextForDisplay(row.text.trim());
  }

  if (typeof row.delta === 'string' && row.delta.trim()) {
    return sanitizeTextForDisplay(row.delta.trim());
  }

  return '';
}

function parseAssistantPayload(payload: unknown): ParsedAssistantPayload {
  const row = toPayloadRecord(payload);
  const text = extractAssistantText(payload);

  const turnId =
    typeof row.turnId === 'string' && row.turnId.trim()
      ? row.turnId.trim()
      : null;

  const stopReason =
    typeof row.stopReason === 'string' && row.stopReason.trim()
      ? row.stopReason.trim()
      : null;

  const errorMessage =
    typeof row.errorMessage === 'string' && row.errorMessage.trim()
      ? row.errorMessage.trim()
      : typeof row.message === 'string' && row.message.trim()
        ? row.message.trim()
        : null;

  return {
    text,
    turnId,
    stopReason,
    errorMessage,
  };
}

function summaryTitleForAssistant(payload: ParsedAssistantPayload): {
  title: string;
  level: 'info' | 'error';
} {
  if (payload.stopReason === 'toolUse') {
    return {
      title: '工具调用中',
      level: 'info',
    };
  }

  if (payload.stopReason === 'aborted') {
    return {
      title: '回合已停止',
      level: 'info',
    };
  }

  if (payload.stopReason === 'error') {
    return {
      title: payload.errorMessage
        ? `回合失败：${sanitizeTextForDisplay(payload.errorMessage, 80)}`
        : '回合失败',
      level: 'error',
    };
  }

  return {
    title: '系统消息',
    level: 'info',
  };
}

function fallbackMessageText(payload: unknown): string {
  return formatPayloadForDisplay(payload);
}

export function buildAgentMessageRows(input: {
  entries: AgentEntry[];
  optimisticUserMessages?: OptimisticUserMessage[];
}): AgentMessageListRow[] {
  const { entries, optimisticUserMessages = [] } = input;
  const rows: AgentMessageListRow[] = [];

  const assistantTurnWithFinalText = new Set<string>();

  for (const entry of entries) {
    if (entry.entryType !== 'assistant') continue;
    const parsed = parseAssistantPayload(entry.payload);
    if (parsed.turnId && parsed.text) {
      assistantTurnWithFinalText.add(parsed.turnId);
    }
  }

  for (const entry of entries) {
    if (entry.entryType !== 'user' && entry.entryType !== 'assistant') continue;

    if (entry.entryType === 'user') {
      const text = extractText(entry.payload) || fallbackMessageText(entry.payload);
      rows.push({
        kind: 'message',
        id: entry.id,
        role: 'user',
        text,
        createdAt: entry.createdAt,
      });
      continue;
    }

    const parsed = parseAssistantPayload(entry.payload);
    if (parsed.text) {
      rows.push({
        kind: 'message',
        id: entry.id,
        role: 'assistant',
        text: parsed.text,
        createdAt: entry.createdAt,
      });
      continue;
    }

    // 有最终正文时，隐藏同 turn 的 toolUse 中转消息，避免聊天正文被 JSON 噪音干扰。
    if (
      parsed.stopReason === 'toolUse' &&
      parsed.turnId &&
      assistantTurnWithFinalText.has(parsed.turnId)
    ) {
      continue;
    }

    if (
      parsed.stopReason !== 'toolUse' &&
      parsed.stopReason !== 'error' &&
      parsed.stopReason !== 'aborted'
    ) {
      continue;
    }

    const summary = summaryTitleForAssistant(parsed);
    rows.push({
      kind: 'summary',
      id: `${entry.id}:summary`,
      title: summary.title,
      detail: formatPayloadForDisplay(entry.payload),
      createdAt: entry.createdAt,
      level: summary.level,
    });
  }

  for (const optimistic of optimisticUserMessages) {
    rows.push({
      kind: 'message',
      id: optimistic.id,
      role: 'user',
      text: sanitizeTextForDisplay(optimistic.text),
      createdAt: optimistic.createdAt,
      optimistic: true,
    });
  }

  return rows;
}
