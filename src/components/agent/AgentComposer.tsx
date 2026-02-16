import { CornerUpRight, Loader2, Send, StopCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface QueuedFollowUpItem {
  id: string;
  text: string;
}

export function AgentComposer({
  disabled,
  streaming,
  steerPending,
  followUpPending,
  abortPending,
  queuedFollowUps = [],
  focusKey,
  onSend,
  onSteer,
  onFollowUp,
  onSteerQueuedFollowUp,
  onAbort,
}: {
  disabled?: boolean;
  streaming: boolean;
  steerPending?: boolean;
  followUpPending?: boolean;
  abortPending?: boolean;
  queuedFollowUps?: QueuedFollowUpItem[];
  focusKey?: string | null;
  onSend: (text: string) => Promise<void>;
  onSteer: (text: string) => Promise<void>;
  onFollowUp: (text: string) => Promise<void>;
  onSteerQueuedFollowUp?: (itemId: string, text: string) => Promise<void>;
  onAbort: () => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [submittingAction, setSubmittingAction] = useState<
    'send' | 'steer' | 'follow-up' | 'abort' | null
  >(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const text = input.trim();
  // sending 阶段只在“尚未进入 streaming”时阻塞，进入 streaming 后应允许继续排队/steer
  const submitting =
    submittingAction !== null && !(submittingAction === 'send' && streaming);
  const anyPending =
    submitting ||
    disabled ||
    Boolean(steerPending) ||
    Boolean(followUpPending) ||
    Boolean(abortPending);
  const inputDisabled =
    Boolean(disabled) ||
    Boolean(abortPending) ||
    (submittingAction === 'send' && !streaming);

  useEffect(() => {
    if (!focusKey) return;
    if (inputDisabled) return;
    inputRef.current?.focus();
  }, [focusKey, inputDisabled]);

  const primaryAction = useMemo(() => {
    if (!streaming) {
      return {
        action: 'send' as const,
        handler: onSend,
        value: text,
        label: '发送任务',
      };
    }

    if (text.startsWith('/steer')) {
      const content = text.replace(/^\/steer\s*/i, '').trim();
      return {
        action: 'steer' as const,
        handler: onSteer,
        value: content,
        label: '立即 Steer',
      };
    }

    return {
      action: 'follow-up' as const,
      handler: onFollowUp,
      value: text,
      label: '继续（Follow-up）',
    };
  }, [onFollowUp, onSend, onSteer, streaming, text]);

  const run = async (
    action: 'send' | 'steer' | 'follow-up',
    fn: (value: string) => Promise<void>,
    value: string,
  ) => {
    const normalized = value.trim();
    if (!normalized || anyPending) return;

    setInput('');
    setSubmittingAction(action);
    try {
      await fn(normalized);
    } catch (error) {
      setInput(normalized);
      throw error;
    } finally {
      setSubmittingAction(null);
    }
  };

  const runAbort = async () => {
    if (
      !streaming ||
      Boolean(disabled) ||
      Boolean(abortPending) ||
      submittingAction === 'abort'
    ) {
      return;
    }
    setSubmittingAction('abort');
    try {
      await onAbort();
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <div className="border-t bg-background p-3">
      {streaming && queuedFollowUps.length > 0 ? (
        <section className="mb-3 flex flex-wrap gap-2">
          {queuedFollowUps.map((item) => (
            <article
              key={item.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/20 pl-2 pr-1 py-1"
            >
              <p className="max-w-[220px] truncate text-xs">{item.text}</p>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={Boolean(disabled) || Boolean(steerPending)}
                title="追加 Steer"
                onClick={() => void onSteerQueuedFollowUp?.(item.id, item.text)}
              >
                <CornerUpRight className="h-3.5 w-3.5" />
              </Button>
            </article>
          ))}
        </section>
      ) : null}

      <Textarea
        ref={inputRef}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        rows={4}
        placeholder="输入消息"
        disabled={inputDisabled}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            return;
          }

          if (event.key === 'Escape' && streaming) {
            event.preventDefault();
            void runAbort();
            return;
          }

          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void run(
              primaryAction.action,
              primaryAction.handler,
              primaryAction.value,
            );
          }
        }}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!text || anyPending}
          onClick={() => {
            void run(
              primaryAction.action,
              primaryAction.handler,
              primaryAction.value,
            );
          }}
        >
          {(streaming &&
            (submittingAction === 'follow-up' ||
              submittingAction === 'steer')) ||
          (!streaming && submittingAction === 'send') ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-1 h-3.5 w-3.5" />
          )}
          {primaryAction.label}
        </Button>

        {streaming ? (
          <Button
            size="sm"
            variant="destructive-outline"
            disabled={
              Boolean(disabled) ||
              Boolean(abortPending) ||
              submittingAction === 'abort'
            }
            onClick={() => void runAbort()}
          >
            {submittingAction === 'abort' ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <StopCircle className="mr-1 h-3.5 w-3.5" />
            )}
            打断执行
          </Button>
        ) : null}
      </div>
    </div>
  );
}
