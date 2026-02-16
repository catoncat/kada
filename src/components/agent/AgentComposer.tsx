import { ArrowUp, CornerUpRight, Loader2, StopCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MentionComposer, type MentionComposerValue } from '@/components/agent/mention';
import { Button } from '@/components/ui/button';
import type { AgentMention } from '@/types/agent';

interface QueuedFollowUpItem {
  id: string;
  text: string;
}

export interface AgentComposerSubmitPayload {
  text: string;
  mentions?: AgentMention[];
}

const EMPTY_DRAFT: MentionComposerValue = {
  markup: '',
  text: '',
  mentions: [],
};

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
  onSend: (payload: AgentComposerSubmitPayload) => Promise<void>;
  onSteer: (payload: AgentComposerSubmitPayload) => Promise<void>;
  onFollowUp: (payload: AgentComposerSubmitPayload) => Promise<void>;
  onSteerQueuedFollowUp?: (itemId: string, text: string) => Promise<void>;
  onAbort: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<MentionComposerValue>(EMPTY_DRAFT);
  const [submittingAction, setSubmittingAction] = useState<
    'send' | 'steer' | 'follow-up' | 'abort' | null
  >(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const text = draft.text.trim();
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
        payload: {
          text,
          mentions: draft.mentions,
        },
        label: '发送任务',
      };
    }

    if (!text) {
      return {
        action: 'abort' as const,
        label: '打断执行',
      };
    }

    if (text.startsWith('/steer')) {
      const content = text.replace(/^\/steer\s*/i, '').trim();
      return {
        action: 'steer' as const,
        handler: onSteer,
        payload: {
          text: content,
          mentions: draft.mentions,
        },
        label: '立即 Steer',
      };
    }

    return {
      action: 'follow-up' as const,
      handler: onFollowUp,
      payload: {
        text,
        mentions: draft.mentions,
      },
      label: '继续（Follow-up）',
    };
  }, [draft.mentions, onFollowUp, onSend, onSteer, streaming, text]);

  const primaryDisabled =
    primaryAction.action === 'abort'
      ? Boolean(disabled) ||
        Boolean(abortPending) ||
        submittingAction === 'abort'
      : !primaryAction.payload.text.trim() || anyPending;

  const run = async (
    action: 'send' | 'steer' | 'follow-up',
    fn: (payload: AgentComposerSubmitPayload) => Promise<void>,
    payload: AgentComposerSubmitPayload,
  ) => {
    const normalized = payload.text.trim();
    const mentions = Array.isArray(payload.mentions)
      ? payload.mentions
      : undefined;
    if (!normalized || anyPending) return;

    const prevDraft = draft;
    setDraft(EMPTY_DRAFT);
    setSubmittingAction(action);
    try {
      await fn({
        text: normalized,
        mentions: mentions?.length ? mentions : undefined,
      });
    } catch (error) {
      setDraft(prevDraft);
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

  const runPrimaryAction = (options?: { allowAbort?: boolean }) => {
    const allowAbort = options?.allowAbort ?? true;
    if (primaryAction.action === 'abort') {
      if (!allowAbort) return;
      void runAbort();
      return;
    }
    void run(primaryAction.action, primaryAction.handler, primaryAction.payload);
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

      <div className="relative">
        <MentionComposer
          ref={inputRef}
          value={draft}
          onChange={setDraft}
          placeholder="输入消息"
          disabled={inputDisabled}
          onKeyDown={(event) => {
            if (event.defaultPrevented) {
              return;
            }

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
              if (!text) return;
              runPrimaryAction({ allowAbort: false });
            }
          }}
        />

        <Button
          size="icon"
          className="absolute bottom-2 right-2 z-10 rounded-full"
          disabled={primaryDisabled}
          onClick={() => runPrimaryAction()}
          title={primaryAction.label}
          aria-label={primaryAction.label}
        >
          {(primaryAction.action === 'abort' &&
            (submittingAction === 'abort' || Boolean(abortPending))) ||
          (streaming &&
            (submittingAction === 'follow-up' ||
              submittingAction === 'steer')) ||
          (!streaming && submittingAction === 'send') ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : primaryAction.action === 'abort' ? (
            <StopCircle className="h-4 w-4" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
