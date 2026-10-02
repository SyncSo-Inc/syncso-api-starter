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
import { coverImage, MissingApiKeyError, SyncSoClient, SyncSoError } from "./client.ts";
import type { AskResponse, Experience, SearchResponse, Venue } from "./client.ts";

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
    const image = coverImage(exp);
    if (image) console.log(`   image: ${image.url}`);
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
    const image = coverImage(venue);
    if (image) console.log(`   image: ${image.url}`);
    console.log("");
  });
}

function footer(res: SearchResponse | AskResponse, started: number): void {
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const credits = res.meta?.credits_charged ?? "?";
  console.log(`— ${secs}s · ${credits} credit(s) · ${res.request_id ?? "—"}`);
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
// Fast and cheap: usually under 2s, 1 credit per 20 results.
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
    limit: 20,
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
    limit: 20,
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
    limit: 20,
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
    limit: 20,
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
// About 1s. Growth plan and above.

/** 6. The whole request: a city. Nothing else is required. */
async function featuredCity(): Promise<void> {
  const body = { location: { city: "New York" }, limit: 20 };
  head(6, "Featured — what is worth knowing in New York", "/featured", body);
  const started = Date.now();
  const res = await client.featured(body);
  printExperiences(res.experiences);
  if (!res.experiences.length) console.log("No results.\n");
  footer(res, started);
}

/** 7. Narrowed to tonight. */
async function featuredTonight(): Promise<void> {
  const body = { location: { city: "New York" }, time_windows: [tonight()], limit: 20 };
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
    limit: 20,
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
    limit: 20,
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
  const body = { location: { city: "New York" }, time_windows: [tomorrow()], limit: 20 };
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
// Ask what someone should do, in the words they would use. Everything on in
// that window and area is read against the request -- a thousand rows and
// more -- and comes back ranked, each result carrying a sentence you can
// show verbatim. About 13s and 6-9 credits at the default effort, against
// under 2s and 1 for search, so it earns its keep when you have something to
// say about the person.
//
// Two rules the shape turns on: send the whole request as ONE `message`
// however many interests it names, and show the results in the order given.
// The order is the reading; picking your own favourites out of the middle
// discards the only part of the work you cannot repeat from a list.

/** Results print themselves: the sentence is already written for the ask. */
function printAnswer(res: AskResponse): void {
  if (res.understood) console.log(`${res.understood}\n`);
  res.results.forEach((row, i) => {
    const where = row.venue ?? row.neighborhood ?? "";
    const whenText = row.ongoing && row.end
      ? `on now, through ${row.end.slice(0, 10)}`
      : row.start?.slice(0, 16).replace("T", " ") ?? "";
    const cost = row.is_free ? "Free"
      : row.price_min != null ? `$${row.price_min}` : "";
    console.log(`${i + 1}. ${row.title}`);
    console.log(`   ${[whenText, where, cost].filter(Boolean).join(" · ")}`);
    // The reason, not a placeholder -- rewriting it costs the reader the
    // reasoning, and writing your own from the title loses what the row says.
    if (row.reason) console.log(`   why: ${row.reason}`);
    if (row.image) console.log(`   image: ${row.image}`);
    if (row.link) console.log(`   ${row.link}`);
    console.log("");
  });
  // Each inference the request left open. Show them where they can be
  // corrected: a wrong reading is visible here rather than silent.
  if (res.assumptions.length) {
    console.log(`assumptions: ${res.assumptions.join(" ")}\n`);
  }
}

/** 11. A group, said in one sentence rather than split into fields. */
async function liThreeFriends(): Promise<void> {
  const body = {
    message:
      "Three of us are visiting NYC for the first time, mid-twenties, staying "
      + "in SoHo, out tonight. Something social but not touristy, around $$ a "
      + "head. We like live music and bars and would rather not do anything formal.",
    limit: 10,
  };
  head(11, "Local Intelligence — three friends, first time in NYC", "/local-intelligence", body);
  console.log("(about 13s: reading the catalogue against this request)\n");
  const started = Date.now();
  const res = await client.ask(body);
  printAnswer(res);
  if (!res.results.length) console.log("No results.\n");
  footer(res, started);
}

/**
 * 12. The constraints a search cannot express. A wheelchair, a vegan, someone
 * who does not drink: these are read and reasoned about, not matched as text,
 * and they are the most useful thing you can send.
 */
async function liConstraints(): Promise<void> {
  const body = {
    message:
      "Six friends want somewhere to celebrate a birthday this weekend. Two "
      + "are vegan, one does not drink, one uses a wheelchair so step-free "
      + "access is required. They want to sit together and talk, not stand in "
      + "a crowd. Under $60 a head.",
    place: "Lower East Side",
    effort: "high" as const,
    limit: 10,
  };
  head(12, "Local Intelligence — hard constraints, read not matched", "/local-intelligence", body);
  console.log("(`effort: high` -- a request with real constraints to reason about)\n");
  const started = Date.now();
  const res = await client.ask(body);
  printAnswer(res);
  if (!res.results.length) console.log("No results.\n");
  footer(res, started);
}

/**
 * 13. A calendar is a list. Two windows with a gap between them do not search
 * the gap -- send one span covering both and you answer with the day nobody
 * asked about.
 */
async function liTwoWindows(): Promise<void> {
  const body = {
    message:
      "Something to do with my parents while they are visiting. They are in "
      + "their seventies and cannot be on their feet for long.",
    place: "Upper West Side",
    // `thisWeekend()` is Friday evening and Saturday daytime -- two windows
    // with Saturday morning between them, which is not searched. One span
    // from Friday 17:00 to Saturday 23:59 would answer with it.
    when: thisWeekend(),
    limit: 10,
  };
  head(13, "Local Intelligence — two windows, and the gap between them", "/local-intelligence", body);
  console.log("(two windows; the hours between them are not searched)\n");
  const started = Date.now();
  const res = await client.ask(body);
  printAnswer(res);
  if (!res.results.length) console.log("No results.\n");
  footer(res, started);
}

/**
 * 14. A place the gazetteer does not hold. A landmark, a street address, a
 * hotel, a transit line: `place` takes any of them.
 */
async function liLandmark(): Promise<void> {
  const body = {
    message: "Somewhere quiet to read for an hour this afternoon.",
    place: "near the Guggenheim",
    radius_mi: 1,
    effort: "low" as const,
    limit: 10,
  };
  head(14, "Local Intelligence — a landmark, not a neighbourhood", "/local-intelligence", body);
  console.log("(`effort: low` -- a plain ask, nothing to reason about)\n");
  const started = Date.now();
  const res = await client.ask(body);
  printAnswer(res);
  if (!res.results.length) console.log("No results.\n");
  footer(res, started);
}

/** 15. The next page: the same body, plus the cursor. Nothing else changes. */
async function liNextPage(): Promise<void> {
  const body = { message: "what is on tonight", limit: 10 };
  head(15, "Local Intelligence — the next page", "/local-intelligence", body);
  const started = Date.now();
  const first = await client.ask(body);
  printAnswer(first);
  if (!first.next_cursor) {
    console.log("No further pages.\n");
    footer(first, started);
    return;
  }
  console.log(`--- page 2 (cursor ${first.next_cursor.slice(0, 12)}...) ---\n`);
  const second = await client.ask({ ...body, cursor: first.next_cursor });
  printAnswer(second);
  footer(second, started);
}

// ---------------------------------------------------------------------------

const EXAMPLES = [
  searchBasic, searchRadius, searchBrowse, searchVenues, searchRankedAndPaged,
  featuredCity, featuredTonight, featuredSoonest, featuredWeekend, featuredPaged,
  liThreeFriends, liConstraints, liTwoWindows, liLandmark, liNextPage,
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
