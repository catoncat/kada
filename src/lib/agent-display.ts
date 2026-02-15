const DATA_URI_RE =
  /data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]{64,})/gi;
const LONG_BASE64_RE = /\b[A-Za-z0-9+/]{512,}={0,2}\b/g;

const MAX_TEXT_LENGTH = 3000;
const MAX_JSON_LENGTH = 6000;
const MAX_ARRAY_ITEMS = 8;
const MAX_OBJECT_KEYS = 24;
const MAX_DEPTH = 5;

function trimOutput(text: string, maxLength = MAX_TEXT_LENGTH): string {
  if (text.length <= maxLength) return text;
  const rest = text.length - maxLength;
  return `${text.slice(0, maxLength)}\n...[已截断 ${rest} 字符]`;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, '');
}

function sanitizeInlineBase64(value: string): string {
  let result = value.replace(
    DATA_URI_RE,
    (_matched, mimeType: string, data: string) => {
      const length = compactWhitespace(data).length;
      return `[data-uri:${mimeType}，已省略 ${length} 字符]`;
    },
  );

  result = result.replace(LONG_BASE64_RE, (matched) => {
    return `[base64，已省略 ${matched.length} 字符]`;
  });

  return result;
}

function sanitizeStringValue(
  value: string,
  maxLength = MAX_TEXT_LENGTH,
): string {
  const sanitized = sanitizeInlineBase64(value);
  return trimOutput(sanitized, maxLength);
}

function isSensitiveBinaryKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('base64') ||
    normalized.includes('b64') ||
    normalized.includes('inline') ||
    normalized.includes('binary') ||
    normalized.includes('image')
  );
}

function sanitizeForJson(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return '[对象过深，已折叠]';

  if (typeof value === 'string') {
    return sanitizeStringValue(value, 400);
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const preview = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeForJson(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      preview.push(`[+${value.length - MAX_ARRAY_ITEMS} items]`);
    }
    return preview;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record);
    const previewEntries = entries.slice(0, MAX_OBJECT_KEYS);

    const output: Record<string, unknown> = {};
    for (const [key, entryValue] of previewEntries) {
      if (
        typeof entryValue === 'string' &&
        isSensitiveBinaryKey(key) &&
        entryValue.length > 120
      ) {
        output[key] = `[${key}，已省略 ${entryValue.length} 字符]`;
        continue;
      }
      output[key] = sanitizeForJson(entryValue, depth + 1);
    }

    if (entries.length > MAX_OBJECT_KEYS) {
      output.__truncated__ = `[+${entries.length - MAX_OBJECT_KEYS} keys]`;
    }

    return output;
  }

  return String(value);
}

export function sanitizeTextForDisplay(
  value: string,
  maxLength = MAX_TEXT_LENGTH,
): string {
  return sanitizeStringValue(value, maxLength);
}

export function formatPayloadForDisplay(value: unknown): string {
  if (typeof value === 'string') {
    return sanitizeTextForDisplay(value);
  }

  try {
    const json = JSON.stringify(sanitizeForJson(value), null, 2);
    return trimOutput(json, MAX_JSON_LENGTH);
  } catch {
    return trimOutput(sanitizeTextForDisplay(String(value)), MAX_JSON_LENGTH);
  }
}
