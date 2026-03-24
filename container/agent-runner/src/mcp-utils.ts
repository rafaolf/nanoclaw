/**
 * Shared utilities for NanoClaw stdio MCP servers.
 */

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

export function errorResult(err: unknown): ToolResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text' as const, text: msg }], isError: true };
}
