function takeNextSseBlock(
  source: string,
): {
  rawBlock: string;
  rest: string;
} | null {
  const match = /\r?\n\r?\n/.exec(source);
  if (!match || typeof match.index !== 'number') return null;
  return {
    rawBlock: source.slice(0, match.index),
    rest: source.slice(match.index + match[0].length),
  };
}

function parseSseDataPayload(rawBlock: string): string | null {
  const dataLines = rawBlock
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s*/, ''));

  if (dataLines.length === 0) return null;
  const payload = dataLines.join('\n').trim();
  return payload || null;
}

export async function readSseDataPayloads(response: Response): Promise<string[]> {
  const payloads: string[] = [];
  const body = response.body;
  if (!body) return payloads;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const next = takeNextSseBlock(buffer);
      if (!next) break;
      buffer = next.rest;

      const rawPayload = parseSseDataPayload(next.rawBlock);
      if (rawPayload) payloads.push(rawPayload);
    }
  }

  buffer += decoder.decode();

  while (true) {
    const next = takeNextSseBlock(buffer);
    if (!next) break;
    buffer = next.rest;

    const rawPayload = parseSseDataPayload(next.rawBlock);
    if (rawPayload) payloads.push(rawPayload);
  }

  const trailingPayload = parseSseDataPayload(buffer);
  if (trailingPayload) payloads.push(trailingPayload);

  return payloads;
}
