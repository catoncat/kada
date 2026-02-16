import { useState } from 'react';
import { Loader2, Send, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function AgentComposer({
  disabled,
  streaming,
  steerPending,
  followUpPending,
  abortPending,
  onSend,
  onSteer,
  onFollowUp,
  onAbort,
}: {
  disabled?: boolean;
  streaming: boolean;
  steerPending?: boolean;
  followUpPending?: boolean;
  abortPending?: boolean;
  onSend: (text: string) => Promise<void>;
  onSteer: (text: string) => Promise<void>;
  onFollowUp: (text: string) => Promise<void>;
  onAbort: () => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [submittingAction, setSubmittingAction] = useState<
    'send' | 'steer' | 'follow-up' | 'abort' | null
  >(null);

  const text = input.trim();
  // sending 阶段只在“尚未进入 streaming”时阻塞，进入 streaming 后应允许继续排队/steer
  const submitting =
    submittingAction !== null &&
    !(submittingAction === 'send' && streaming);
  const anyPending =
    submitting ||
    disabled ||
    Boolean(steerPending) ||
    Boolean(followUpPending) ||
    Boolean(abortPending);

  const run = async (
    action: 'send' | 'steer' | 'follow-up',
    fn: (value: string) => Promise<void>,
    value: string,
  ) => {
    const normalized = value.trim();
    if (!normalized || anyPending) return;

    setSubmittingAction(action);
    try {
      await fn(normalized);
      setInput('');
    } finally {
      setSubmittingAction(null);
    }
  };

  const resolvePrimaryAction = () => {
    if (!streaming) {
      return {
        action: 'send' as const,
        handler: onSend,
        value: text,
      };
    }

    if (text.startsWith('/steer')) {
      const content = text.replace(/^\/steer\s*/i, '').trim();
      return {
        action: 'steer' as const,
        handler: onSteer,
        value: content,
      };
    }

    return {
      action: 'follow-up' as const,
      handler: onFollowUp,
      value: text,
    };
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
      <Textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        rows={4}
        placeholder={
          streaming
            ? '运行中：默认继续消息（follow-up）；输入 /steer 可立即纠偏'
            : '输入你的任务目标（Enter 发送）'
        }
        disabled={anyPending}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && streaming) {
            event.preventDefault();
            void runAbort();
            return;
          }

          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const target = resolvePrimaryAction();
            void run(target.action, target.handler, target.value);
          }
        }}
      />

      <p className="mt-2 text-[11px] text-muted-foreground">
        {streaming
          ? '默认发送=Follow-up；输入 /steer 开头可立即纠偏；Esc 或“打断执行”可中断。'
          : '发送会启动一个新回合。'}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!text || anyPending}
          onClick={() => {
            const target = resolvePrimaryAction();
            void run(target.action, target.handler, target.value);
          }}
        >
          {(streaming &&
            (submittingAction === 'follow-up' || submittingAction === 'steer')) ||
          (!streaming && submittingAction === 'send') ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-1 h-3.5 w-3.5" />
          )}
          {streaming ? '继续（Follow-up）' : '发送任务'}
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
