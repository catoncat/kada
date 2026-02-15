# SQL and Event Patterns

## Latest Session

```sql
SELECT id, title, engine, status, created_at, updated_at, last_turn_at
FROM agent_sessions
ORDER BY created_at DESC
LIMIT 1;
```

## Entries (full conversation)

```sql
SELECT id, entry_type, payload_json, created_at
FROM agent_entries
WHERE session_id = ?
ORDER BY created_at ASC, id ASC;
```

## Events (full timeline)

```sql
SELECT seq, turn_id, event_type, payload_json, created_at
FROM agent_events
WHERE session_id = ?
ORDER BY seq ASC;
```

## Outputs

```sql
SELECT id, kind, ref_id, content_json, created_at
FROM agent_outputs
WHERE session_id = ?
ORDER BY created_at ASC, id ASC;
```

## Failure Signatures

- No `tool.call`: model stayed in plain-text response mode.
- `tool.call` exists but no `tool.result`: tool execution interrupted/crashed.
- `photo.task.created` exists without `photo.ready`: worker or polling chain failed.
- `assistant.completed` empty text: provider/model output issue or parser mismatch.
