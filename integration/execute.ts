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
  name: "search_experiences" | "get_details" | "list_supported_cities",
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
    signal: AbortSignal.timeout(30_000),
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

// Example: several directions at once, the way AGENT_INSTRUCTIONS.md asks for.
if (import.meta.url === `file://${process.argv[1]}`) {
  const directions = ["live jazz", "rooftop cocktails", "comedy show"];
  const results = await Promise.all(
    directions.map((query) =>
      executeSyncSoTool("search_experiences", {
        query,
        location: { city: "New York" },
        result_types: ["experiences"],
        limit: 5,
      }),
    ),
  );
  results.forEach((r, i) => console.log(`\n### ${directions[i]}\n${r.text}`));
}
