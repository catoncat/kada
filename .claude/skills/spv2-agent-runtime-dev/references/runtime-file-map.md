# Runtime File Map

## Runtime Core

- `sidecar/src/agent/runtime/agent-runtime.ts`
- `sidecar/src/agent/runtime/coding-agent-runtime.ts`
- `sidecar/src/agent/runtime/agent-core-runtime.ts`
- `sidecar/src/agent/runtime/runtime-router.ts`

## Tools / Extensions

- `sidecar/src/agent/extensions/resource-extension.ts`
- `sidecar/src/agent/extensions/photo-copy-extension.ts`
- `sidecar/src/agent/extensions/tool-definitions.ts`

## API / Persistence

- `sidecar/src/routes/agent.ts`
- `sidecar/src/services/agent-session-store.ts`
- `sidecar/src/services/agent-event-store.ts`
- `sidecar/src/db/schema.ts`
- `sidecar/src/db/index.ts`

## Guardrails

- Never edit package code under `sidecar/node_modules/@mariozechner/*`.
- Keep tools behavior equivalent across coding-agent and agent-core runtimes.
- Persist all runtime-critical events before SSE emit.
