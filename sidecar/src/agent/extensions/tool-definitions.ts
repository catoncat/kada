import type { AgentTool, AgentToolResult, AgentToolUpdateCallback } from '@mariozechner/pi-agent-core';
import type { TSchema } from '@sinclair/typebox';

export interface RuntimeToolDefinition<
  TParams extends TSchema = TSchema,
  TDetails = unknown,
> {
  name: string;
  label: string;
  description: string;
  parameters: TParams;
  execute: (
    toolCallId: string,
    params: any,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;
}

export function toAgentCoreTools(
  definitions: RuntimeToolDefinition[],
): AgentTool<TSchema>[] {
  return definitions.map((definition) => ({
    name: definition.name,
    label: definition.label,
    description: definition.description,
    parameters: definition.parameters,
    execute: (toolCallId, params, signal, onUpdate) =>
      definition.execute(
        toolCallId,
        params,
        signal,
        onUpdate as AgentToolUpdateCallback<unknown> | undefined,
      ),
  }));
}
