import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentComposer } from '@/components/agent/AgentComposer';

describe('AgentComposer session scoping', () => {
  it('does not lock input for another session while previous session send is pending', () => {
    const pendingSend = vi.fn(
      () => new Promise<void>(() => {}),
    );

    const { rerender } = render(
      <AgentComposer
        sessionId="session-a"
        streaming={false}
        onSend={pendingSend}
        onSteer={async () => {}}
        onFollowUp={async () => {}}
        onAbort={async () => {}}
      />,
    );

    const input = screen.getByPlaceholderText('输入消息') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'hello from session A' } });
    fireEvent.click(screen.getByRole('button', { name: '发送任务' }));

    expect(pendingSend).toHaveBeenCalledTimes(1);
    expect(input.disabled).toBe(true);

    rerender(
      <AgentComposer
        sessionId="session-b"
        streaming={false}
        onSend={pendingSend}
        onSteer={async () => {}}
        onFollowUp={async () => {}}
        onAbort={async () => {}}
      />,
    );

    const sessionBInput = screen.getByPlaceholderText(
      '输入消息',
    ) as HTMLTextAreaElement;
    expect(sessionBInput.disabled).toBe(false);
  });
});
