/**
 * Run a SyncSo tool call from your own agent loop.
 *
 * Your model chose a tool from tools.json and produced arguments. This
 * function executes it and returns the compact text the model should read
 * (~120 tokens per result), by calling the SyncSo MCP endpoint over plain
 * HTTP — no MCP client library needed. Copy this file; it has no
 * dependencies.
 */

const MCP_URL = process.env.SYNCSO_MCP_URL ?? "https://rtdb.syncso.com/partner/mcp";

export async function executeSyncSoTool(
  name: "find_things_to_do" | "get_details",
  args: Record<string, unknown>,
  apiKey = process.env.SYNCSO_API_KEY,
): Promise<{ text: string; isError: boolean }> {
  if (!apiKey) throw new Error("SYNCSO_API_KEY is not set");

  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    // find_things_to_do reads every candidate before it answers: 11-16s is
    // typical, so leave room for the slow tail.
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    return { text: `SyncSo returned HTTP ${response.status}`, isError: true };
  }
  const body = (await response.json()) as {
    result?: { content: Array<{ type: string; text: string }>; isError?: boolean };
    error?: { message: string };
  };
  if (body.error) return { text: body.error.message, isError: true };
  const text = body.result?.content.map((c) => c.text).join("\n") ?? "";
  return { text, isError: Boolean(body.result?.isError) };
}

// Example: the whole ask as one call, the way AGENT_INSTRUCTIONS.md asks for.
// Do not split it into several searches; the order that comes back is the answer.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { text, isError } = await executeSyncSoTool("find_things_to_do", {
    request:
      "Live jazz or a comedy show tonight, then somewhere for a cocktail " +
      "nearby. Two of us, mid-30s, would rather sit than stand.",
    limit: 5,
  });
  console.log(isError ? `Error: ${text}` : text);
}
