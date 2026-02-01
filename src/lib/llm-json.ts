/**
 * Utilities for parsing (sometimes messy) LLM outputs into strict JSON.
 *
 * Why: models occasionally return extra text / code fences / unescaped newlines,
 * which will crash JSON.parse with errors like:
 *   "Unterminated string in JSON".
 */

function stripCodeFences(input: string): string {
  // Replace ```json ... ``` or ``` ... ``` with inner content.
  return input.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1');
}

function normalizeQuotes(input: string): string {
  // Smart quotes to normal quotes.
  return input
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

/**
 * Extract the first complete JSON value (object or array) from a text.
 * Uses a small state machine that ignores braces inside strings.
 */
export function extractFirstJson(text: string): string | null {
  const cleaned = normalizeQuotes(stripCodeFences(String(text ?? ''))).trim();

  const objStart = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  if (objStart === -1 && arrStart === -1) return null;

  const start =
    objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
  const openChar = cleaned[start];
  // const closeChar = openChar === '{' ? '}' : ']';

  const stack: string[] = [openChar];
  let inString = false;
  let escaped = false;

  for (let i = start + 1; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }

    if (ch === '}' || ch === ']') {
      const last = stack[stack.length - 1];
      const expected = last === '{' ? '}' : ']';
      if (ch === expected) stack.pop();

      if (stack.length === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }

  // No balanced end found.
  return null;
}

function escapeControlCharsInStrings(input: string): string {
  // Escape raw newlines / tabs / other control chars that may appear inside JSON strings.
  // This often happens with LLM outputs and triggers errors like "Unterminated string".
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }

    // inString === true
    if (escaped) {
      escaped = false;
      out += ch;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      out += ch;
      continue;
    }

    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }

    // Control chars are not allowed unescaped in JSON strings.
    if (ch === '\n') {
      out += '\\n';
      continue;
    }
    if (ch === '\r') {
      out += '\\r';
      continue;
    }
    if (ch === '\t') {
      out += '\\t';
      continue;
    }

    const code = ch.charCodeAt(0);
    if (code >= 0 && code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }

    out += ch;
  }

  return out;
}

export function parseLlmJson<T = any>(text: string): T {
  const jsonText = extractFirstJson(text) ?? String(text ?? '').trim();

  // 1) Try direct parse.
  try {
    return JSON.parse(jsonText) as T;
  } catch (err1: any) {
    // 2) Try repairing common control-char issues inside strings.
    const repaired = escapeControlCharsInStrings(jsonText);
    try {
      return JSON.parse(repaired) as T;
    } catch (err2: any) {
      const preview = jsonText.slice(0, 800);
      const message =
        `JSON.parse 失败：${err2?.message || err1?.message || String(err2 || err1)}
` +
        `--- 解析内容预览（前 800 字）---
${preview}`;
      const e = new Error(message);
      (e as any).cause = err2 ?? err1;
      throw e;
    }
  }
}