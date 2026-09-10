/**
 * Search the SyncSo catalogue from the command line.
 *
 *   npm run search -- "live jazz" "New York"
 *   npm run search -- "free museum exhibitions" "New York" --free
 */
import { MissingApiKeyError, SyncSoClient, SyncSoError } from "./client.ts";
import type { Experience } from "./client.ts";

const [query, city, ...flags] = process.argv.slice(2);

if (!query || !city) {
  console.log(`
Usage: npm run search -- <query> <city> [--free] [--limit N]

  npm run search -- "live jazz" "New York"
  npm run search -- "free museum exhibitions" "New York" --free
`);
  process.exit(1);
}

const limitAt = flags.indexOf("--limit");
const limit = limitAt >= 0 ? Number(flags[limitAt + 1]) : 10;

/**
 * Times are wall-clock AT THE VENUE. The string is sliced rather than passed
 * to Date on purpose: `new Date("2026-09-05T21:30:00")` is read in the
 * runtime's zone, so an 8pm New York show would print as 5pm in California.
 */
function when(exp: Experience): string {
  const slot = exp.time.matched_timeslots[0]?.start ?? exp.time.next_start;
  if (!slot?.local) return "Time TBA";
  const [date, clock] = slot.local.split("T");
  // A date_only event has no real clock time — printing 12:00 AM would
  // invent a precision the source never had.
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

try {
  const client = new SyncSoClient();
  const results = await client.search({
    query,
    location: { city },
    limit,
    ...(flags.includes("--free") ? { filters: { experiences: { is_free: true } } } : {}),
  });

  results.experiences.forEach((exp, i) => {
    const where = exp.venue?.name ?? (exp.is_online ? "Online" : exp.neighborhood ?? "");
    console.log(`\n${i + 1}. ${exp.title}`);
    console.log(`   ${[when(exp), where, price(exp)].filter(Boolean).join(" · ")}`);
    if (exp.booking.primary_link) console.log(`   ${exp.booking.primary_link}`);
  });

  if (results.experiences.length === 0) console.log("\nNo results.");

  // If the area was relaxed, these rows are city-wide — saying otherwise
  // would tell the user something untrue.
  const scope = results.meta.normalized?.area_scope ?? {};
  if (Object.values(scope).includes("relaxed")) {
    console.log(`\nNote: "${results.meta.normalized?.area_text}" matched nothing; widened to the whole city.`);
  }

  console.log(`\n— ${results.meta.credits_charged ?? "?"} credit(s) · ${results.request_id}`);
} catch (error) {
  if (error instanceof MissingApiKeyError) {
    console.error(`\n${error.message}`);
  } else if (error instanceof SyncSoError) {
    console.error(`\nError [${error.code}]: ${error.message}`);
    console.error(`Request id: ${error.requestId}`);
  } else {
    throw error;
  }
  process.exit(1);
}
