/**
 * Four worked examples, run end to end against the live API.
 *
 *   npm run examples          # all four
 *   npm run examples -- 2     # just the second
 *
 * These are the same requests the public playground at syncso.com/demo
 * sends, so what prints here is what you can see running in a browser
 * before you write any code. Add your key to .env and run it — that is the
 * whole setup.
 *
 * Each example prints the request first, then what came back, so the shape
 * of the body you would send is never a mystery.
 */
import { MissingApiKeyError, SyncSoClient, SyncSoError } from "./client.ts";
import type { Experience, SearchResponse, Venue } from "./client.ts";

// ---------------------------------------------------------------------------
// Time windows are wall-clock IN THE TARGET CITY and carry no UTC offset.
//
// This is the single most common mistake: building a window from the local
// machine's clock sends a window that has already ended for anyone in a
// different zone, and the API rejects it with 422. Running this from
// California at 11pm would otherwise ask New York for a "tonight" that
// finished three hours ago. So read the clock in the city being searched.

const CITY_TZ = "America/New_York";

function cityNow(): { day: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CITY_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A day offset from today in the target city, as YYYY-MM-DD. */
function cityDay(offset = 0): string {
  const d = new Date(`${cityNow().day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Now until the end of the day. After 11pm there is no useful tonight left. */
function tonight(): { start: string; end: string } {
  const { day, hour, minute } = cityNow();
  if (hour >= 23) {
    const next = cityDay(1);
    return { start: `${next}T17:00`, end: `${next}T23:59` };
  }
  return { start: `${day}T${pad(hour)}:${pad(minute)}`, end: `${day}T23:59` };
}

/** Friday evening and all of Saturday, as two windows. */
function thisWeekend(): Array<{ start: string; end: string }> {
  const weekday = new Date(`${cityNow().day}T12:00:00Z`).getUTCDay();
  const toFri = (5 - weekday + 7) % 7;
  return [
    { start: `${cityDay(toFri)}T17:00`, end: `${cityDay(toFri)}T23:59` },
    { start: `${cityDay(toFri + 1)}T10:00`, end: `${cityDay(toFri + 1)}T23:59` },
  ];
}

// ---------------------------------------------------------------------------
// Printing

const RULE = "─".repeat(72);

function head(n: number, title: string, endpoint: string, body: unknown): void {
  console.log(`\n${RULE}\n${n}. ${title}\n   POST ${endpoint}\n${RULE}`);
  console.log(JSON.stringify(body, null, 2));
  console.log("");
}

/** Times are wall-clock at the venue — slice the string, never parse it. */
function when(exp: Experience): string {
  const slot = exp.time.matched_timeslots[0]?.start ?? exp.time.next_start;
  if (!slot?.local) return "Time TBA";
  const [date, clock] = slot.local.split("T");
  return exp.time.type === "exact_datetime" && clock
    ? `${date} ${clock.slice(0, 5)}`
    : (date ?? slot.local);
}

function price(exp: Experience): string {
  if (!exp.price) return "";
  if (exp.price.is_free) return "Free";
  const { min, max } = exp.price;
  if (min === null && max === null) return "";
  return min !== null && max !== null && min !== max ? `$${min}-${max}` : `$${min ?? max}`;
}

function printExperiences(rows: Experience[]): void {
  rows.forEach((exp, i) => {
    const where = exp.venue?.name ?? (exp.is_online ? "Online" : exp.neighborhood ?? "");
    console.log(`${i + 1}. ${exp.title}`);
    console.log(`   ${[when(exp), where, price(exp)].filter(Boolean).join(" · ")}`);
    // Local Intelligence explains itself; search has nothing to explain.
    if (exp.match?.reason) console.log(`   why: ${exp.match.reason}`);
    if (exp.booking.primary_link) console.log(`   ${exp.booking.primary_link}`);
    console.log("");
  });
}

function printVenues(rows: Venue[]): void {
  rows.forEach((venue, i) => {
    console.log(`${i + 1}. ${venue.name}`);
    console.log(`   ${[venue.venue_type?.replace(/_/g, " "), venue.neighborhood, venue.address]
      .filter(Boolean)
      .join(" · ")}`);
    if (venue.match?.reason) console.log(`   why: ${venue.match.reason}`);
    console.log("");
  });
}

function footer(res: SearchResponse, started: number): void {
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`— ${secs}s · ${res.meta.credits_charged ?? "?"} credit(s) · ${res.request_id}`);
}

// ---------------------------------------------------------------------------
// A few more helpers the later examples need.

/** Tomorrow, 8am to end of day, in the target city. */
function tomorrow(): { start: string; end: string } {
  const day = cityDay(1);
  return { start: `${day}T08:00`, end: `${day}T23:59` };
}

/** From 9pm tonight, or from now if it is already later than that. */
function lateTonight(): { start: string; end: string } {
  const { day, hour, minute } = cityNow();
  if (hour >= 23) {
    const next = cityDay(1);
    return { start: `${next}T21:00`, end: `${next}T23:59` };
  }
  const h = Math.max(21, hour);
  return { start: `${day}T${pad(h)}:${pad(hour >= 21 ? minute : 0)}`, end: `${day}T23:59` };
}

const SOHO = { lat: 40.7233, lng: -74.003 };
const MILES = 1.60934;

// ---------------------------------------------------------------------------
// The examples
//
// Five per endpoint, each showing something the previous one did not.
// Everything here is a real, valid request body — nothing is illustrative.

const client = new SyncSoClient();

// === /search =============================================================
// Fast and cheap: 2-4s, 1 credit per 20 results.
//
// Omitting `query` selects browse mode, where the filters are the intent
// (example 3). A blank string is rejected on purpose: an empty search box
// forwarded verbatim is a partner bug, and this API says so rather than
// quietly returning everything.

/** 1. The plain case: what is on, where, tonight. */
async function searchBasic(): Promise<void> {
  const body = {
    query: "live jazz",
    location: { city: "New York" },
    time_windows: [tonight()],
    result_types: ["experiences"] as const,
    limit: 5,
  };
  head(1, "Search — live jazz tonight", "/search", body);
  const started = Date.now();
  const res = await client.search(body);
  printExperiences(res.experiences);
  if (!res.experiences.length) console.log("No results.\n");
  footer(res, started);
}

/** 2. Search a circle rather than a city. Results carry `distance_km`. */
async function searchRadius(): Promise<void> {
  const body = {
    query: "stand-up comedy",
    // A radius is only valid on a `point`, never alongside a city name.
    location: { point: { ...SOHO, radius_km: Number((3 * MILES).toFixed(2)) } },
    result_types: ["experiences"] as const,
    limit: 5,
  };
  head(2, "Search — comedy within 3 miles of SoHo", "/search", body);
  const started = Date.now();
  const res = await client.search(body);
  printExperiences(res.experiences);
  if (!res.experiences.length) console.log("No results.\n");
  footer(res, started);
}

/**
 * 3. No query at all: browse mode, where the filters ARE the intent.
 *
 * Omit `query` and the constraints do the work — free, indoor, this weekend.
 * A blank string is still a 422 on purpose: an empty search box forwarded
 * verbatim is a bug on your side, so this API fails loudly rather than
 * quietly returning everything.
 *
 * A filter keeps only experiences whose attribute is recorded AND matches;
 * unknown is left out rather than guessed.
 */
async function searchBrowse(): Promise<void> {
  const body = {
    location: { city: "New York" },
    time_windows: thisWeekend(),
    result_types: ["experiences"] as const,
    filters: { experiences: { is_free: true, environment_types: ["indoor"] as const } },
    limit: 5,
  };
  head(3, "Search — no query: free indoor things this weekend", "/search", body);
  const started = Date.now();
  const res = await client.search(body);
  printExperiences(res.experiences);
  if (!res.experiences.length) console.log("No results.\n");
  footer(res, started);
}

/** 4. Venues: a place that exists whether or not anything is scheduled. */
async function searchVenues(): Promise<void> {
  const body = {
    query: "cocktail bar",
    location: { city: "New York", area_text: "Williamsburg" },
    result_types: ["venues"] as const,
    limit: 5,
  };
  head(4, "Search — cocktail bars in Williamsburg (venues)", "/search", body);
  const started = Date.now();
  const res = await client.search(body);
  printVenues(res.venues);
  if (!res.venues.length) console.log("No results.\n");

  // A neighborhood matching nothing widens to the whole city rather than
  // returning empty, so check before calling these "in Williamsburg".
  const scope = res.meta.normalized?.area_scope ?? {};
  if (Object.values(scope).includes("relaxed")) {
    console.log(`Note: "${res.meta.normalized?.area_text}" matched nothing; widened to the whole city.\n`);
  }
  footer(res, started);
}

/**
 * 5. Ranking preferences, both result types at once, and paging. The lift is
 * bounded: relevance still carries most of the order.
 */
async function searchRankedAndPaged(): Promise<void> {
  const body = {
    query: "live music",
    location: { city: "New York" },
    time_windows: [lateTonight()],
    result_types: ["experiences", "venues"] as const,
    ranking: { prefer_popularity: true, prefer_uniqueness: true },
    media: { images_per_result: 1, include_videos: false },
    limit: 3,
  };
  head(5, "Search — popular and unusual, after 9pm, both types + page 2", "/search", body);
  const started = Date.now();
  const res = await client.search(body);
  console.log("Experiences:");
  printExperiences(res.experiences);
  console.log("Venues:");
  printVenues(res.venues);
  footer(res, started);

  // Page 2: the same body plus the cursor. The result set was frozen server
  // side on page 1, so this is a slice of a snapshot — far faster, and no row
  // repeats across pages.
  const cursor = res.meta.next_cursor;
  if (cursor) {
    console.log("\n   … page 2, same body plus meta.next_cursor:\n");
    const t2 = Date.now();
    const page2 = await client.search({ ...body, cursor });
    printExperiences(page2.experiences);
    footer(page2, t2);
  }
}

// === /featured ===========================================================
// The no-query endpoint, for surfaces where nobody has typed anything.
// Under a second. Growth plan and above.

/** 6. The whole request: a city. Nothing else is required. */
async function featuredCity(): Promise<void> {
  const body = { location: { city: "New York" }, limit: 5 };
  head(6, "Featured — what is worth knowing in New York", "/featured", body);
  const started = Date.now();
  const res = await client.featured(body);
  printExperiences(res.experiences);
  if (!res.experiences.length) console.log("No results.\n");
  footer(res, started);
}

/** 7. Narrowed to tonight. */
async function featuredTonight(): Promise<void> {
  const body = { location: { city: "New York" }, time_windows: [tonight()], limit: 5 };
  head(7, "Featured — tonight only", "/featured", body);
  const started = Date.now();
  const res = await client.featured(body);
  printExperiences(res.experiences);
  if (!res.experiences.length) console.log("No results.\n");
  footer(res, started);
}

/** 8. Soonest first rather than strongest first. */
async function featuredSoonest(): Promise<void> {
  const body = {
    location: { city: "New York" },
    time_windows: [tonight()],
    sort: "time" as const,
    limit: 5,
  };
  head(8, "Featured — soonest first (sort: time)", "/featured", body);
  const started = Date.now();
  const res = await client.featured(body);
  printExperiences(res.experiences);
  if (!res.experiences.length) console.log("No results.\n");
  footer(res, started);
}

/** 9. A weekend module: two windows, strongest first. */
async function featuredWeekend(): Promise<void> {
  const body = {
    location: { city: "New York" },
    time_windows: thisWeekend(),
    sort: "score" as const,
    limit: 5,
  };
  head(9, "Featured — this weekend", "/featured", body);
  const started = Date.now();
  const res = await client.featured(body);
  printExperiences(res.experiences);
  if (!res.experiences.length) console.log("No results.\n");
  footer(res, started);
}

/**
 * 10. Tomorrow, and a second page by cursor. The pool is deliberately small —
 * ask for more than a city has and you get what it has, not a padded list.
 */
async function featuredPaged(): Promise<void> {
  const body = { location: { city: "New York" }, time_windows: [tomorrow()], limit: 5 };
  head(10, "Featured — tomorrow, then page 2 by cursor", "/featured", body);
  const started = Date.now();
  const res = await client.featured(body);
  printExperiences(res.experiences);
  footer(res, started);

  const cursor = res.meta.next_cursor;
  if (cursor) {
    console.log("\n   … page 2, same body plus meta.next_cursor:\n");
    const t2 = Date.now();
    const page2 = await client.featured({ ...body, cursor });
    printExperiences(page2.experiences);
    footer(page2, t2);
  } else {
    console.log(`\nNo second page: the curated pool for tomorrow held ${res.experiences.length}.`);
    console.log("A city with three worth showing returns three, not a padded list.\n");
  }
}

// === /local-intelligence =================================================
// The same catalogue ranked for one person, every result carrying a reason
// you can show verbatim. 20-30s and 3-10 credits, so it earns its keep only
// when you actually know something about the person.

/** 11. A group, with interests and things to avoid. */
async function liThreeFriends(): Promise<void> {
  const body = {
    query: "What should the three of us do tonight?",
    location: { city: "New York" },
    time_windows: [tonight()],
    result_types: ["experiences"] as const,
    limit: 5,
    user_context: {
      preferences_text:
        "Visiting NYC with two friends. We're all in our mid-20s and staying in "
        + "SoHo. We want something social but not too touristy.",
      interests: ["live music", "bars", "meeting people"],
      avoid: ["tourist traps", "anything formal"],
      profile: { party: "friends" as const, budget: "$$" as const, age_range: "25-34", home_area: "SoHo" },
    },
  };
  head(11, "Local Intelligence — three friends, first time in NYC", "/local-intelligence", body);
  console.log("(20-30s: ranking the catalogue for these three people)\n");
  const started = Date.now();
  const res = await client.recommend(body);
  printExperiences(res.experiences);
  if (!res.experiences.length) console.log("No results.\n");
  footer(res, started);
}

/**
 * 12. Hard constraints, answered with venues. "Where can we all go" is a
 * question about a room that seats six and has step-free access, not about
 * something scheduled.
 */
async function liConstraints(): Promise<void> {
  const body = {
    query: "Where can we all actually go for the birthday?",
    location: { city: "New York" },
    time_windows: thisWeekend(),
    result_types: ["venues"] as const,
    limit: 5,
    user_context: {
      preferences_text:
        "Six friends celebrating a birthday. Two are vegan, one does not drink, "
        + "and one uses a wheelchair so step-free access is required. They want "
        + "to sit together and talk, not stand in a crowd.",
      interests: ["group dining", "cocktails", "live music"],
      avoid: ["standing room only", "loud clubs"],
      profile: { party: "friends" as const, budget: "$$$" as const, home_area: "Lower East Side" },
    },
  };
  head(12, "Local Intelligence — six friends, one wheelchair, two vegan (venues)", "/local-intelligence", body);
  console.log("(20-30s)\n");
  const started = Date.now();
  const res = await client.recommend(body);
  printVenues(res.venues);
  if (!res.venues.length) console.log("No results.\n");
  footer(res, started);
}

/** 13. A summary over the whole set, for a chat reply rather than a list. */
async function liWithSummary(): Promise<void> {
  const body = {
    query: "Where should I take her tonight?",
    location: { city: "New York" },
    time_windows: [tonight()],
    result_types: ["experiences"] as const,
    limit: 5,
    include_summary: true,
    user_context: {
      preferences_text:
        "A first date. Somewhere quiet enough to talk but with something to look "
        + "at or do, so there is no pressure to fill silences. Under $150 for two.",
      interests: ["conversation", "art", "wine"],
      avoid: ["loud clubs", "standing room only"],
      profile: { party: "couple" as const, budget: "$$$" as const, home_area: "West Village" },
    },
  };
  head(13, "Local Intelligence — a first date, with a written summary", "/local-intelligence", body);
  console.log("(20-30s)\n");
  const started = Date.now();
  const res = await client.recommend(body);
  if (res.summary) console.log(`Summary: ${res.summary}\n`);
  printExperiences(res.experiences);
  footer(res, started);
}

/**
 * 14. `intelligence.intent: false` — retrieval uses the query verbatim
 * instead of interpreting it first. Several times faster and cheaper, and
 * results are still ranked and explained.
 */
async function liFastPath(): Promise<void> {
  const body = {
    query: "rooftop bar with a view",
    location: { city: "New York" },
    time_windows: [tonight()],
    result_types: ["experiences", "venues"] as const,
    limit: 5,
    intelligence: { intent: false },
    user_context: {
      preferences_text: "Out-of-town colleagues, want somewhere with a skyline view.",
      profile: { party: "team" as const, budget: "$$$" as const },
    },
  };
  head(14, "Local Intelligence — the fast path (intent: false)", "/local-intelligence", body);
  console.log("(faster and cheaper: the query is used verbatim for retrieval)\n");
  const started = Date.now();
  const res = await client.recommend(body);
  printExperiences(res.experiences);
  printVenues(res.venues);
  footer(res, started);
}

/**
 * 15. No `user_context` at all — an unpersonalized AI ranking. Useful when
 * you have a query but know nothing about who is asking.
 */
async function liNoContext(): Promise<void> {
  const body = {
    query: "something memorable to do with kids on a rainy afternoon",
    location: { city: "New York" },
    time_windows: [tomorrow()],
    result_types: ["experiences"] as const,
    limit: 5,
  };
  head(15, "Local Intelligence — no user context, ranked anyway", "/local-intelligence", body);
  console.log("(20-30s)\n");
  const started = Date.now();
  const res = await client.recommend(body);
  printExperiences(res.experiences);
  if (!res.experiences.length) {
    console.log(`No results. meta.empty_reason: ${res.meta.empty_reason ?? "none given"}\n`);
  }
  footer(res, started);
}

// ---------------------------------------------------------------------------

const EXAMPLES = [
  searchBasic, searchRadius, searchBrowse, searchVenues, searchRankedAndPaged,
  featuredCity, featuredTonight, featuredSoonest, featuredWeekend, featuredPaged,
  liThreeFriends, liConstraints, liWithSummary, liFastPath, liNoContext,
];

const GROUPS: Record<string, number[]> = {
  search: [1, 2, 3, 4, 5],
  featured: [6, 7, 8, 9, 10],
  intelligence: [11, 12, 13, 14, 15],
};

const arg = process.argv[2];
let picked: number[];

if (!arg) {
  picked = EXAMPLES.map((_, i) => i + 1);
} else if (GROUPS[arg]) {
  picked = GROUPS[arg]!;
} else if (/^\d+$/.test(arg) && Number(arg) >= 1 && Number(arg) <= EXAMPLES.length) {
  picked = [Number(arg)];
} else {
  console.error(`
Usage: npm run examples [-- <n> | search | featured | intelligence]

  npm run examples                  all 15
  npm run examples -- 3             just example 3
  npm run examples -- search        the five /search examples
  npm run examples -- featured      the five /featured examples
  npm run examples -- intelligence  the five /local-intelligence examples
`);
  process.exit(1);
}

try {
  for (const n of picked) await EXAMPLES[n - 1]!();
  console.log(`\n${RULE}\nSee these running in a browser: https://syncso.com/demo`);
  console.log(`The full manual: https://syncso.com/partner-api\n`);
} catch (error) {
  if (error instanceof MissingApiKeyError) {
    console.error(`\n${error.message}`);
  } else if (error instanceof SyncSoError) {
    console.error(`\nError [${error.code}]: ${error.message}`);
    console.error(`Request id: ${error.requestId}`);
    if (error.code === "forbidden_scope") {
      console.error("This key lacks the `intelligence` scope — examples 11-15 need it.");
    }
    if (error.code === "forbidden_tier") {
      console.error("/featured is Growth plan and above — examples 6-10 need it.");
    }
    if (error.code === "unauthorized") {
      console.error("Check SYNCSO_API_KEY in .env — it should start with rtdb_live_.");
    }
  } else {
    throw error;
  }
  process.exit(1);
}
