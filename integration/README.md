# Add SyncSo to your agent

Three files, one workflow. They let a personal assistant, a travel bot or
any agent that talks to people find things to do in New York and choose
well for its user.

| File | Where it goes |
|---|---|
| [`AGENT_INSTRUCTIONS.md`](AGENT_INSTRUCTIONS.md) | Your agent's system prompt. About 750 tokens. |
| [`tools.json`](tools.json) | Your model's tool list (OpenAI function format). [`tools.anthropic.json`](tools.anthropic.json) is the same four tools in Anthropic's shape. |
| [`execute.ts`](execute.ts) | Runs a tool call and returns text for the model. No dependencies. |

The instructions tell the model how to work: split a request into
directions, search them all at once, pick a `limit` per direction, choose
two to four results per direction for the user instead of relaying rows,
page with the cursor for "more like these" and search anew for "something
different". The tool definitions tell it how to fill each field: the shape
of a location, how a time window is written, what belongs in the query.

One thing your agent must supply: **a Partner API key**, server-side,
never in a client app. Request one at
[syncso.com/partner-api](https://syncso.com/partner-api).

The model needs the current New York time to turn "tonight" into a time
window. If your system prompt already carries a clock, it will use that;
otherwise it calls the free `current_time` tool first.

## If your framework speaks MCP

You need none of these files. Point it at the endpoint; the same
instructions arrive on `initialize` and the same tool definitions on
`tools/list`.

```json
{
  "mcpServers": {
    "syncso": {
      "url": "https://rtdb.syncso.com/partner/mcp",
      "headers": { "Authorization": "Bearer rtdb_live_..." }
    }
  }
}
```

## If it doesn't

Paste `AGENT_INSTRUCTIONS.md` into the system prompt, add `tools.json` to
the model's tools, and route the model's tool calls through
`executeSyncSoTool`:

```ts
import { executeSyncSoTool } from "./execute.ts";

// inside your tool-call loop
const { text, isError } = await executeSyncSoTool(call.name, call.arguments);
// hand `text` back to the model as the tool result
```

It posts to the same MCP endpoint over plain HTTP and returns compact text
(about 120 tokens per result), so a page of 20 costs the model ~2,500 tokens
rather than the ~18,000 the raw REST JSON would. Run the file directly to
see three directions searched in parallel:

```bash
node --env-file=.env integration/execute.ts
```

## What it costs

A search is 1 credit for up to 20 results and takes 2–4 seconds. A plan
built from five directions is 5 credits and about five seconds, because the
searches run together. `get_details` is 1 credit; `list_supported_cities` and
`current_time` are free.

## Keeping it current

`AGENT_INSTRUCTIONS.md` and `tools.json` are copies of what the MCP server
sends. When they change here, the server has changed too, so update your
copy when you update your key or on a release note.
