import { useMemo } from 'react';
import { formatPayloadForDisplay } from '@/lib/agent-display';
import type { AgentTurnEvent } from '@/types/agent';

interface TimelineItem {
  id: string;
  title: string;
  subtitle: string;
  status: 'running' | 'completed' | 'error' | 'info';
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return 'unknown';
}

export function AgentToolTimeline({
  events,
}: {
  events: AgentTurnEvent[];
}) {
  const items = useMemo(() => {
    const rows: TimelineItem[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const id = `${event.timestamp}:${event.type}:${i}`;

      if (event.type === 'tool.call') {
        const payload = (event.payload || {}) as Record<string, unknown>;
        rows.push({
          id,
          title: `调用工具：${toText(payload.toolName || 'unknown')}`,
          subtitle: formatPayloadForDisplay(payload.args || {}),
          status: 'running',
        });
        continue;
      }

      if (event.type === 'tool.result') {
        const payload = (event.payload || {}) as Record<string, unknown>;
        rows.push({
          id,
          title: `工具结果：${toText(payload.toolName || 'unknown')}`,
          subtitle: formatPayloadForDisplay(payload.result || {}),
          status: payload.isError ? 'error' : 'completed',
        });
        continue;
      }

      if (
        event.type === 'photo.task.created' ||
        event.type === 'photo.task.updated' ||
        event.type === 'photo.ready'
      ) {
        rows.push({
          id,
          title: `照片流程：${event.type}`,
          subtitle: formatPayloadForDisplay(event.payload),
          status: event.type === 'photo.ready' ? 'completed' : 'info',
        });
        continue;
      }

      if (event.type === 'copy.ready') {
        rows.push({
          id,
          title: '文案已生成',
          subtitle: formatPayloadForDisplay(event.payload),
          status: 'completed',
        });
        continue;
      }

      if (event.type === 'queue.updated') {
        const payload = (event.payload || {}) as Record<string, unknown>;
        const mode = toText(payload.mode || 'unknown');
        rows.push({
          id,
          title: mode === 'steer' ? '队列更新：Steer' : '队列更新：Follow-up',
          subtitle: formatPayloadForDisplay(event.payload),
          status: 'info',
        });
        continue;
      }

      if (event.type === 'session.aborted') {
        rows.push({
          id,
          title: '会话已停止',
          subtitle: formatPayloadForDisplay(event.payload),
          status: 'info',
        });
        continue;
      }

      if (event.type === 'turn.failed') {
        rows.push({
          id,
          title: '回合失败',
          subtitle: formatPayloadForDisplay(event.payload),
          status: 'error',
        });
        continue;
      }

      if (event.type === 'turn.completed') {
        rows.push({
          id,
          title: '回合完成',
          subtitle: formatPayloadForDisplay(event.payload),
          status: 'completed',
        });
      }
    }

    return rows.slice(-30);
  }, [events]);

  return (
    <aside className="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-l bg-background">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">工具时间线</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          调试视图：展示工具调用、生图任务与文案产出过程。
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            暂无工具事件。
          </div>
        ) : null}

        {items.map((item) => (
          <article key={item.id} className="rounded-lg border p-3 text-xs">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">{item.title}</span>
              <span
                className={
                  item.status === 'completed'
                    ? 'text-emerald-600'
                    : item.status === 'error'
                      ? 'text-red-600'
                      : item.status === 'running'
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                }
              >
                {item.status}
              </span>
            </div>
            <pre className="whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
              {item.subtitle}
            </pre>
          </article>
        ))}
      </div>
    </aside>
  );
}
