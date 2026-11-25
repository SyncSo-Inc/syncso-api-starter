# SyncSo API Starter

An example app for the [SyncSo API](https://syncso.com/partner-api): live
events, shows and classes across New York and the San Francisco Bay Area,
built on the official SDK, [`@syncso/sdk`](https://www.npmjs.com/package/@syncso/sdk).

Only want the client? `npm install @syncso/sdk` (or `pip install syncso`) —
see [syncso-sdk](https://github.com/SyncSo-Inc/syncso-sdk).

**[API documentation](https://syncso.com/partner-api)** ·
**[Interactive explorer](https://rtdb.syncso.com/partner/docs)**

```bash
git clone https://github.com/SyncSo-Inc/syncso-api-starter.git
cd syncso-api-starter
npm install
cp .env.example .env          # add your key
npm run examples
```

No build step — Node runs the TypeScript directly. Needs Node 23.6 or newer.

Fifteen worked examples against the live API, five per endpoint. Run a set or
a single one:

```bash
npm run examples                  # all fifteen
npm run examples -- search        # the five /search examples
npm run examples -- featured      # the five /featured examples
npm run examples -- intelligence  # the five /intelligence examples
npm run examples -- 12            # just number 12
```

**`/search`** — events and things to do. Under a second with a query, about 3s to browse; 1 credit per 50 results.

| | | |
|---|---|---|
| 1 | Live jazz tonight | the plain case |
| 2 | Comedy within 3 miles of SoHo | a circle instead of a city; results carry `distance_mi` |
| 3 | Free indoor things this weekend | **no query at all** — the filters are the intent |
| 4 | Cocktails and trivia in Williamsburg | one neighbourhood, and the widened-area check |
| 5 | Live music after 9pm | ranking preferences, and page 2 by cursor |

**`/featured`** — a curated pool per city, no query. A second or two. Starter
plan and above.

| | | |
|---|---|---|
| 6 | New York | the whole request is a city |
| 7 | Tonight only | narrowed by a window |
| 8 | Soonest first | `sort: "time"` rather than by score |
| 9 | This weekend | a weekend module, two windows |
| 10 | Tomorrow, then page 2 | cursor paging, and the pool's real size |

**`/intelligence`** — ask what someone should do, in the words they
would use. Everything on in that window and area is read against the request
and comes back ranked, each result carrying a sentence you can show verbatim.
About 8-12s and 2-5 credits for the first 50 results with reasons; with
`reasons: false`, about 3-6s and 2-3 credits.

One request is one call, however many interests it names, and the order it
comes back in is the reading — do not split it, and do not re-rank it.

| | | |
|---|---|---|
| 11 | Three friends, first time in NYC | the whole ask as one sentence |
| 12 | Six friends, one wheelchair, two vegan | constraints a search cannot express |
| 13 | Parents visiting, two windows | the hours between them are not searched |
| 14 | Near the Guggenheim | a landmark rather than a neighbourhood |
| 15 | What is on tonight, then page 2 | the same body plus the cursor |

Each prints its request body, then the results, then latency and credits.
Examples 6-10 need the Starter plan or above; 11-15 need the `intelligence` scope.

```
3. Roy Hargrove Big Band Monthly Residency
   2026-09-10 19:00 · The Jazz Gallery · $45
   image: https://...
   https://...

— 1.2s · 1 credit(s) · req_3f9c2a7b1d4e6f80
```

Every result carries up to three images by default (`media.images_per_result`),
and `coverImage(exp)` in [`src/print.ts`](src/print.ts) picks the one to lead
with. Some image URLs are presigned and expire, so fetch them rather than
storing the URL.

Local Intelligence adds a reason to every result:

```
3. Ahimsa
   indian restaurant · Manhattan · 15 W 27th St, New York, NY
   why: You need group dining with strong vegan choices and step-free entry —
        Ahimsa is a plant-forward Indian kitchen with vegan options and
        wheelchair_accessible access.
```

There is also a CLI for your own queries:

```bash
npm run search -- "live jazz" "New York"
npm run search -- "free museum exhibitions" "New York" --free
```

Need a key? Create one in the [API console](https://syncso.com/console).

## The code

The client is the SDK — `import SyncSo from "@syncso/sdk"`. What this repo
adds is [`src/examples.ts`](src/examples.ts), the fifteen examples,
[`src/search.ts`](src/search.ts), the CLI, and [`src/print.ts`](src/print.ts),
the few lines that turn a result into something to show.

```ts
import SyncSo from "@syncso/sdk";

const syncso = new SyncSo(); // reads SYNCSO_API_KEY

const results = await syncso.search({
  query: "rooftop cocktails with a view",
  location: { city: "New York" },
  time_windows: [{ start: "2026-09-05T18:00", end: "2026-09-05T23:59" }],
  ranking: { prefer_popularity: true },
});

for (const exp of results.experiences) {
  console.log(exp.title, exp.location?.name, exp.booking.primary_link);
}
```

`syncso.featured()` takes no query — a location is the whole request:

```ts
const results = await syncso.featured({
  location: { city: "New York" },
  time_windows: [{ start: "2026-09-05T18:00", end: "2026-09-05T23:59" }],
  sort: "time",          // or "score", the default
});
```

`syncso.intelligence()` takes the request as a sentence and answers it ranked,
each result carrying its own `reason`. Costs more than `search` (about 8–12s
and 2–5 credits for the first 50 results, against about a second and 1), so it
earns its keep once you have something to say about the person:

```ts
const answer = await syncso.intelligence({
  message:
    "Six friends want somewhere to celebrate a birthday this weekend. Two " +
    "are vegan, one uses a wheelchair so step-free access is required. They " +
    "want to sit together and talk, not stand in a crowd. Under $60 a head.",
  place: "Lower East Side",
});

console.log(answer.understood);            // show this first
for (const row of answer.results) {        // in this order
  console.log(row.title, "—", row.reason); // the sentence is already written
}
```

Put everything you know in `message`, including what no search could express
— a wheelchair, an allergy, a dislike. Those are read and reasoned about, and
they are the most useful thing you can send. `syncso.intelligenceStream()`
gives the same answer one result at a time, as it is decided.

## Four things that trip people up

**Omit `query` to browse; a blank one is a `422`.** With no `query` the
requirements are the intent (example 3). An empty string is rejected on
purpose — an empty search box forwarded verbatim is a bug on your side.

**Time windows are local to the target city, with no offset.** Send
`"2026-09-05T19:00"`, never `toISOString()` — a trailing `Z` is rejected.

**Response times are wall-clock at the venue**, as a string with no offset,
and the zone is in `time.timezone`. Put one into a `Date` and an 8pm New York
show reads as 5pm in California.

**A neighbourhood that matches nothing widens to the whole city.** Check
`meta.normalized.area_scope` before telling anyone results are "in Williamsburg".

## Errors

```ts
catch (err) {
  if (err instanceof SyncSoError) {
    err.code;       // "forbidden_tier"
    err.requestId;  // quote this to support
  }
}
```

Common codes: `unauthorized`, `forbidden_scope` (this key cannot use Local
Intelligence), `forbidden_tier` (`/featured` needs Starter or above),
`invalid_request`, `rate_limited`, `quota_exceeded`, `insufficient_credits`.
The SDK retries rate limits and server errors on its own; the rest are yours.

Credits are metered per delivered result, never per requested — a `limit` of 50
that returns 4 rows costs 1 credit. Every response reports its own cost in
`meta.credits_charged`.

## MCP server

To let Claude, Cursor or an agent search the catalogue during a conversation,
you don't need this repo at all — point the client at our MCP endpoint:

```
https://rtdb.syncso.com/partner/mcp
```

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

It exposes two tools — `find_things_to_do` and `get_details` — using the
same key, limits and billing as the REST API above, and sends the agent
workflow below as `instructions` on connect.

End users who connect with their own account (rather than your key) are
additionally offered payment tools, so they can subscribe without leaving
their assistant. Those never appear for a partner key: your users are
billed by you, not by us.

## Add SyncSo to your own agent

For a personal assistant, a chat bot, anything that gets asked "what should
we do tonight?". Your system prompt needs one line:

```
When the user asks what to do, where to go, or wants plans in New York,
use the SyncSo tools to search real events and places.
```

Everything else — how to phrase a search, build a time window, handle a
follow-up, what never to tell the user — is in the tool descriptions, which
the model reads anyway. [`integration/`](integration/) holds the two tool
definitions in OpenAI and Anthropic shapes and a short executor for
frameworks that do not speak MCP. See
[`integration/README.md`](integration/README.md).

## Documentation

| | |
|---|---|
| **API manual** | [syncso.com/partner-api](https://syncso.com/partner-api) |
| **Interactive explorer** | [rtdb.syncso.com/partner/docs](https://rtdb.syncso.com/partner/docs) |
| **Base URL** | `https://api.syncso.com/v1` |
| **MCP endpoint** | `https://rtdb.syncso.com/partner/mcp` |
