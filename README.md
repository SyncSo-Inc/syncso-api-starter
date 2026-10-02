# SyncSo API Starter

Search live events, shows, classes and venues across major US cities with the
SyncSo Partner API.

**[API documentation](https://syncso.com/partner-api)** ·
**[Interactive explorer](https://rtdb.syncso.com/partner/docs)**

```bash
git clone https://github.com/SyncSo-Inc/syncso-api-starter.git
cd syncso-api-starter
cp .env.example .env          # add your key
npm run examples
```

No dependencies and no build step — Node runs the TypeScript directly.
Needs Node 23.6 or newer.

Fifteen worked examples against the live API, five per endpoint. Run a set or
a single one:

```bash
npm run examples                  # all fifteen
npm run examples -- search        # the five /search examples
npm run examples -- featured      # the five /featured examples
npm run examples -- intelligence  # the five /local-intelligence examples
npm run examples -- 12            # just number 12
```

**`/search`** — experiences and venues. Usually under 2s, 1 credit per 20 results.

| | | |
|---|---|---|
| 1 | Live jazz tonight | the plain case |
| 2 | Comedy within 3 miles of SoHo | a circle instead of a city; results carry `distance_km` |
| 3 | Free indoor things this weekend | **no query at all** — the filters are the intent |
| 4 | Cocktail bars in Williamsburg | venues, and the widened-area check |
| 5 | Live music after 9pm | ranking preferences, both result types, and page 2 by cursor |

**`/featured`** — a curated pool per city, no query. About 1s. Growth
plan and above.

| | | |
|---|---|---|
| 6 | New York | the whole request is a city |
| 7 | Tonight only | narrowed by a window |
| 8 | Soonest first | `sort: "time"` rather than by score |
| 9 | This weekend | a weekend module, two windows |
| 10 | Tomorrow, then page 2 | cursor paging, and the pool's real size |

**`/local-intelligence`** — ask what someone should do, in the words they
would use. Everything on in that window and area is read against the request
and comes back ranked, each result carrying a sentence you can show verbatim.
About 13s and 6-9 credits at the default effort.

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
Examples 6-10 need the Growth tier; 11-15 need the `intelligence` scope.

```
3. Roy Hargrove Big Band Monthly Residency
   2026-09-10 19:00 · The Jazz Gallery · $45
   image: https://...
   https://...

— 1.2s · 1 credit(s) · req_3f9c2a7b1d4e6f80
```

Every request asks for images by default (`media.images_per_result: 3`), and
`coverImage(row)` picks the one to lead with. Pass your own `media` to change
it. About 9 in 10 experiences carry at least one image; venue image URLs are
presigned and expire, so fetch them rather than storing the URL.

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

Need a key? Request one at [syncso.com/partner-api](https://syncso.com/partner-api).

## The code

**[`src/client.ts`](src/client.ts)** is the part to copy — one file, no
dependencies. [`src/examples.ts`](src/examples.ts) is the fifteen examples,
[`src/search.ts`](src/search.ts) the CLI.

```ts
const client = new SyncSoClient();

const results = await client.search({
  query: "rooftop cocktails with a view",
  location: { city: "New York" },
  time_windows: [{ start: "2026-09-05T18:00", end: "2026-09-05T23:59" }],
  result_types: ["experiences", "venues"],
  ranking: { prefer_popularity: true },
});

for (const exp of results.experiences) {
  console.log(exp.title, exp.venue?.name, exp.booking.primary_link);
}
```

`client.featured()` takes no query — a location is the whole request:

```ts
const results = await client.featured({
  location: { city: "New York" },
  time_windows: [{ start: "2026-09-05T18:00", end: "2026-09-05T23:59" }],
  sort: "time",          // or "score", the default
});
```

`client.ask()` takes the request as a sentence and answers it ranked, each
result carrying its own `reason`. Costs more than `search` (about 13s and 6–9
credits at the default effort, against under 2s and 1), so it earns its keep
once you have something to say about the person:

```ts
const answer = await client.ask({
  message:
    "Six friends want somewhere to celebrate a birthday this weekend. Two " +
    "are vegan, one uses a wheelchair so step-free access is required. They " +
    "want to sit together and talk, not stand in a crowd. Under $60 a head.",
  place: "Lower East Side",
  effort: "high",
});

console.log(answer.understood);            // show this first
for (const row of answer.results) {        // in this order
  console.log(row.title, "—", row.reason); // the sentence is already written
}
```

Put everything you know in `message`, including what no search could express
— a wheelchair, an allergy, a dislike. Those are read and reasoned about, and
they are the most useful thing you can send.

## Four things that trip people up

**Omit `query` to browse; a blank one is a `422`.** With no `query` the filters
are the intent (example 3). An empty string is rejected on purpose — an empty
search box forwarded verbatim is a bug on your side.

**Time windows are local to the target city, with no offset.** Send
`"2026-09-05T19:00"`, never `toISOString()` — a trailing `Z` is rejected.

**Response times are wall-clock at the venue**, as `{ local, timezone }`. Put
`local` into a `Date` and an 8pm New York show reads as 5pm in California.

**A neighborhood that matches nothing widens to the whole city.** Check
`meta.normalized.area_scope` before telling anyone results are "in Williamsburg".

## Errors

```ts
catch (err) {
  if (err instanceof SyncSoError) {
    err.code;       // "unsupported_city"
    err.requestId;  // quote this to support
  }
}
```

Common codes: `unauthorized`, `forbidden_scope` (this key cannot use Local
Intelligence), `forbidden_tier` (`/featured` needs Growth or above),
`unsupported_city`, `invalid_request`, `rate_limited`, `insufficient_credits`.

Credits are metered per delivered result, never per requested — a `limit` of 60
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
the model reads anyway. [`integration/`](integration/) holds the four tool
definitions in OpenAI and Anthropic shapes and a 40-line executor for
frameworks that do not speak MCP. See
[`integration/README.md`](integration/README.md).

## Documentation

| | |
|---|---|
| **API manual** | [syncso.com/partner-api](https://syncso.com/partner-api) |
| **Interactive explorer** | [rtdb.syncso.com/partner/docs](https://rtdb.syncso.com/partner/docs) |
| **Base URL** | `https://rtdb.syncso.com/partner/api/v1` |
| **MCP endpoint** | `https://rtdb.syncso.com/partner/mcp` |
