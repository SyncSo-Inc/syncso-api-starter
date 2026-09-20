# Add SyncSo to your agent

For a personal assistant, a chat bot, anything that talks to people and
gets asked "what should we do tonight?".

## Your system prompt needs one line

```
When the user asks what to do, where to go, or wants plans in New York,
use the SyncSo tools to search real events and places.
```

Everything else — how to phrase a search, how to build a time window, how
many results to fetch, what to do with "more like these", what never to
tell the user — lives in the tool descriptions, which your model reads when
it is choosing and filling a tool. It does not sit in your prompt.

## Then wire up the tools

**If your framework speaks MCP**, point it at the endpoint and you are
done. The tool definitions and the full guidance arrive on connect.

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

**If it doesn't**, add [`tools.json`](tools.json) to your model's tool list
(OpenAI function format; [`tools.anthropic.json`](tools.anthropic.json) is
the same two tools in Anthropic's shape) and route the calls through
[`execute.ts`](execute.ts):

```ts
import { executeSyncSoTool } from "./execute.ts";

// inside your tool-call loop
const { text, isError } = await executeSyncSoTool(call.name, call.arguments);
// hand `text` back to the model as the tool result
```

It posts to the MCP endpoint over plain HTTP and returns compact text,
about 120 tokens per result, so a page of 20 costs your model ~2,500 tokens
rather than the ~18,000 raw JSON would. Run it directly to watch three
searches go out in parallel:

```bash
node --env-file=.env integration/execute.ts
```

## The two tools

| Tool | What | Cost |
|---|---|---|
| `search_experiences` | Events, shows, classes, restaurants, bars, museums | 1 credit per 20 results |
| `get_details` | Everything about results the user picked, up to 20 ids in one call | 1 credit |

Two, deliberately. Every tool definition is re-sent on every model request
for the life of your integration, alongside whatever else you have mounted,
so a tool has to earn that standing cost. The New York clock arrives with
the connection and on every result rather than as a tool; the city list is
one city.

A search takes 2–4 seconds. A plan built from five directions is 5 credits
and about five seconds, because the searches run together.

## What you must supply

A Partner API key, server-side, never in a client app. Request one at
[syncso.com/partner-api](https://syncso.com/partner-api).

## The long version

[`AGENT_INSTRUCTIONS.md`](AGENT_INSTRUCTIONS.md) is the same guidance
written out in full, ~800 tokens. You do not need it — it is what MCP
clients receive automatically, kept here so you can read what your model is
being told, and paste it if you would rather have it in the prompt than
rely on the tool descriptions.

## Keeping it current

These files are copies of what the MCP server sends. When they change here,
the server has changed too; update your copy when you update your key or on
a release note.
