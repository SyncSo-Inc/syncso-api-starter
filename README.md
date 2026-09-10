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

**`/search`** — experiences and venues. 2-4s, 1 credit per 20 results.

| | | |
|---|---|---|
| 1 | Live jazz tonight | the plain case |
| 2 | Comedy within 3 miles of SoHo | a circle instead of a city; results carry `distance_km` |
| 3 | Free indoor things this weekend | **no query at all** — the filters are the intent |
| 4 | Cocktail bars in Williamsburg | venues, and the widened-area check |
| 5 | Live music after 9pm | ranking preferences, both result types, and page 2 by cursor |

**`/featured`** — a curated pool per city, no query. Under a second. Growth
plan and above.

| | | |
|---|---|---|
| 6 | New York | the whole request is a city |
| 7 | Tonight only | narrowed by a window |
| 8 | Soonest first | `sort: "time"` rather than by score |
| 9 | This weekend | a weekend module, two windows |
| 10 | Tomorrow, then page 2 | cursor paging, and the pool's real size |

**`/local-intelligence`** — the same catalogue ranked for one person, each
result carrying a reason you can show verbatim. 20-30s, 3-10 credits.

| | | |
|---|---|---|
| 11 | Three friends, first time in NYC | interests and things to avoid |
| 12 | Six friends, one wheelchair, two vegan | hard constraints, answered with venues |
| 13 | A first date | `include_summary` for a chat reply rather than a list |
| 14 | Rooftop with a view | `intelligence.intent: false` — the fast, cheap path |
| 15 | Rainy afternoon with kids | no `user_context` at all: ranked anyway |

Each prints its request body, then the results, then latency and credits.
Examples 6-10 need the Growth tier; 11-15 need the `intelligence` scope.

```
3. Roy Hargrove Big Band Monthly Residency
   2026-09-10 19:00 · The Jazz Gallery · $45
   https://...

— 1.2s · 1 credit(s) · req_3f9c2a7b1d4e6f80
```

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

`client.recommend()` ranks for one person and explains each result. Costs more
than `search` (20–30s and 3–10 credits, against 2–4s and 1), so it earns its
keep once you know something about them:

```ts
const results = await client.recommend({
  query: "somewhere to celebrate a birthday this weekend",
  location: { city: "New York" },
  user_context: {
    preferences_text:
      "Six friends. Two are vegan, one uses a wheelchair so step-free " +
      "access is required. They want to sit together and talk.",
    profile: { party: "friends", budget: "$$$" },
  },
});
```

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

It exposes four tools — `search_experiences`, `recommend_experiences`,
`get_details` and `list_supported_cities` — using the same key, limits and
billing as the REST API above.

## Documentation

| | |
|---|---|
| **API manual** | [syncso.com/partner-api](https://syncso.com/partner-api) |
| **Interactive explorer** | [rtdb.syncso.com/partner/docs](https://rtdb.syncso.com/partner/docs) |
| **Base URL** | `https://rtdb.syncso.com/partner/api/v1` |
| **MCP endpoint** | `https://rtdb.syncso.com/partner/mcp` |
