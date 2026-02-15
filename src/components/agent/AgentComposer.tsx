import { useState } from 'react';
import { Loader2, Send, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function AgentComposer({
  disabled,
  streaming,
  onSend,
  onSteer,
  onFollowUp,
  onAbort,
}: {
  disabled?: boolean;
  streaming: boolean;
  onSend: (text: string) => Promise<void>;
  onSteer: (text: string) => Promise<void>;
  onFollowUp: (text: string) => Promise<void>;
  onAbort: () => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const text = input.trim();

  const run = async (fn: (value: string) => Promise<void>) => {
    if (!text || disabled || submitting) return;

    setSubmitting(true);
    try {
      await fn(text);
      setInput('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t bg-background p-3">
      <Textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        rows={4}
        placeholder={streaming ? '可发送 steer/follow-up 指令' : '输入你的任务目标，回车发送'}
        disabled={disabled || submitting}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void run(streaming ? onFollowUp : onSend);
          }
        }}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!text || disabled || submitting || streaming}
          onClick={() => void run(onSend)}
        >
          {submitting && !streaming ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-1 h-3.5 w-3.5" />
          )}
          发送
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={!text || disabled || submitting || !streaming}
          onClick={() => void run(onSteer)}
        >
          Steer
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={!text || disabled || submitting || !streaming}
          onClick={() => void run(onFollowUp)}
        >
          Follow-up
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={!streaming || disabled || submitting}
          onClick={() => void onAbort()}
        >
          <StopCircle className="mr-1 h-3.5 w-3.5" />
          Abort
        </Button>
      </div>
    </div>
  );
}
