/**
 * Search the SyncSo catalogue from the command line.
 *
 *   npm run search -- "live jazz" "New York"
 *   npm run search -- "free museum exhibitions" "New York" --free
 */
import SyncSo, { SyncSoError } from "@syncso/sdk";
import { coverImage, price, requireKey, when, where } from "./print.ts";

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
const limit = limitAt >= 0 ? Number(flags[limitAt + 1]) : 20;

requireKey();
const syncso = new SyncSo();

try {
  const results = await syncso.search({
    query,
    location: { city },
    limit,
    // Requirements are tag ids from GET /meta; each one is a must.
    ...(flags.includes("--free") ? { requirements: ["is_free:true"] } : {}),
  });

  results.experiences.forEach((exp, i) => {
    console.log(`\n${i + 1}. ${exp.title}`);
    console.log(`   ${[when(exp), where(exp), price(exp)].filter(Boolean).join(" · ")}`);
    const image = coverImage(exp);
    if (image) console.log(`   image: ${image.url}`);
    if (exp.booking.primary_link) console.log(`   ${exp.booking.primary_link}`);
  });

  if (results.meta.out_of_area) console.log(`\n${results.meta.coverage?.message}`);
  else if (results.experiences.length === 0) console.log("\nNo results.");

  console.log(`\n— ${results.meta.credits_charged} credit(s) · ${results.request_id}`);
} catch (error) {
  if (!(error instanceof SyncSoError)) throw error;
  console.error(`\nError [${error.code}]: ${error.message}`);
  console.error(`Request id: ${error.requestId}`);
  process.exit(1);
}
