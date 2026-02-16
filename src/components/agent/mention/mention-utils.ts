import type { MentionItem } from 'react-mentions';
import type {
  AgentMention,
  AgentMentionKind,
  AgentResourceSearchItem,
} from '@/types/agent';

const TOKEN_PREFIX = 'mention';
const TOKEN_SEP = '|';

export const MENTION_MARKUP = '@[__display__](__id__)';

export const AGENT_MENTION_KIND_LABEL: Record<AgentMentionKind, string> = {
  project: '项目',
  scene: '场景',
  model: '模特',
  image: '图片',
};

export interface MentionSuggestionData {
  id: string;
  display: string;
  kind: AgentMentionKind;
  title: string;
  subtitle: string;
  image: string | null;
}

interface ParsedMentionToken {
  mentionId: string;
  kind: AgentMentionKind;
  resourceId: string;
  resourceTitle: string;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function buildMentionTokenId(item: AgentResourceSearchItem): string {
  const mentionId = `mnt_${Date.now().toString(36)}_${randomSuffix()}`;
  return [
    TOKEN_PREFIX,
    mentionId,
    item.kind,
    encodeURIComponent(item.id),
    encodeURIComponent(item.title),
  ].join(TOKEN_SEP);
}

export function toMentionSuggestionData(
  item: AgentResourceSearchItem,
): MentionSuggestionData {
  return {
    id: buildMentionTokenId(item),
    display: item.title,
    kind: item.kind,
    title: item.title,
    subtitle: item.subtitle,
    image: item.image,
  };
}

function parseMentionTokenId(value: string): ParsedMentionToken | null {
  const parts = value.split(TOKEN_SEP);
  if (parts.length < 5) return null;
  const [prefix, mentionId, kind, encodedResourceId, encodedResourceTitle] =
    parts;
  if (prefix !== TOKEN_PREFIX) return null;
  if (!mentionId?.trim()) return null;
  if (
    kind !== 'project' &&
    kind !== 'scene' &&
    kind !== 'model' &&
    kind !== 'image'
  ) {
    return null;
  }

  const resourceId = safeDecodeURIComponent(encodedResourceId || '').trim();
  const resourceTitle = safeDecodeURIComponent(
    encodedResourceTitle || '',
  ).trim();

  if (!resourceId) return null;
  return {
    mentionId,
    kind,
    resourceId,
    resourceTitle: resourceTitle || resourceId,
  };
}

export function mergeMentionsFromOccurrences(
  occurrences: MentionItem[],
  previousMentions: AgentMention[],
): AgentMention[] {
  const previousImageMap = new Map(
    previousMentions.map((mention) => [mention.mentionId, mention.images || []]),
  );

  const next: AgentMention[] = [];
  const seen = new Set<string>();

  for (const item of occurrences) {
    const parsed = parseMentionTokenId(String(item.id));
    if (!parsed) continue;
    if (seen.has(parsed.mentionId)) continue;
    seen.add(parsed.mentionId);

    next.push({
      mentionId: parsed.mentionId,
      kind: parsed.kind,
      resourceId: parsed.resourceId,
      resourceTitle:
        parsed.resourceTitle ||
        (typeof item.display === 'string' && item.display.trim()
          ? item.display.trim()
          : parsed.resourceId),
      images: previousImageMap.get(parsed.mentionId) || [],
    });
  }

  return next;
}

