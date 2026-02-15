import type { AgentOutput } from '@/types/agent';

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function resolvePhotoUrl(output: AgentOutput): string | null {
  const payload = toRecord(output.content);
  if (!payload) return null;

  const artifact = toRecord(payload.artifact);
  if (artifact && typeof artifact.filePath === 'string') {
    return artifact.filePath;
  }

  if (typeof payload.filePath === 'string') {
    return payload.filePath;
  }

  const nestedOutput = toRecord(payload.output);
  if (nestedOutput && typeof nestedOutput.filePath === 'string') {
    return nestedOutput.filePath;
  }

  return null;
}

function normalizePhotoSrc(url: string): string {
  const value = url.trim();
  if (!value) return value;

  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('uploads/')) return `/${value}`;
  if (value.startsWith('/')) return value;
  return `/uploads/${value}`;
}

function resolveCopyText(output: AgentOutput): string {
  const payload = toRecord(output.content);
  if (!payload) return JSON.stringify(output.content);

  if (typeof payload.content === 'string') {
    return payload.content;
  }

  if (typeof payload.rewritten === 'string') {
    return payload.rewritten;
  }

  return JSON.stringify(payload);
}

export function AgentOutputRail({ outputs }: { outputs: AgentOutput[] }) {
  const photos = outputs.filter((item) => item.kind === 'photo');
  const copies = outputs.filter((item) => item.kind === 'copy');

  return (
    <aside className="flex h-full min-h-0 w-[360px] shrink-0 flex-col border-l bg-background">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">产物栏</h3>
        <p className="mt-1 text-xs text-muted-foreground">照片与文案结果会汇总在这里。</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <section>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">照片 ({photos.length})</h4>
          <div className="space-y-2">
            {photos.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                暂无照片产物
              </div>
            ) : null}

            {photos.map((output) => {
              const url = resolvePhotoUrl(output);
              return (
                <article key={output.id} className="rounded-lg border p-2">
                  <div className="mb-1 text-[11px] text-muted-foreground">{output.createdAt || ''}</div>
                  {url ? (
                    <img
                      src={normalizePhotoSrc(url)}
                      alt="photo"
                      className="h-40 w-full rounded object-cover"
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                      {JSON.stringify(output.content, null, 2)}
                    </pre>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-4">
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">文案 ({copies.length})</h4>
          <div className="space-y-2">
            {copies.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                暂无文案产物
              </div>
            ) : null}

            {copies.map((output) => (
              <article key={output.id} className="rounded-lg border p-3">
                <div className="mb-1 text-[11px] text-muted-foreground">{output.createdAt || ''}</div>
                <p className="whitespace-pre-wrap break-words text-sm">{resolveCopyText(output)}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
