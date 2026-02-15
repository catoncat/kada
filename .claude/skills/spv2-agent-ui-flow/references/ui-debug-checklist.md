# UI Debug Checklist

## Event to UI Mapping

- `assistant.delta` -> streaming text buffer
- `assistant.completed` -> final assistant message snapshot
- `tool.call/tool.result` -> tool timeline rows
- `photo.ready/copy.ready` -> output rail entries
- `turn.completed/turn.failed` -> refetch session + outputs

## Quick Checks

1. Confirm active `sessionId` is stable during one turn.
2. Confirm SSE chunk parser keeps partial buffer correctly.
3. Confirm `disabled` and `streaming` conditions match UX policy.
4. Confirm output image URL normalization avoids duplicate `/uploads/` prefix.
5. Confirm reconnect path uses cursor incremental fetch, not full reset.

## Repro Prompt

Use a deterministic prompt for smoke test:

- `找 3 个轻法式外景风格并生成首图，再给一版小红书文案`

Expected signals:

- `tool.call(photo.compose_prompt)`
- `tool.call(photo.enqueue_generation)`
- `photo.task.created`
- `photo.task.updated` or `photo.ready`
- `copy.ready`
