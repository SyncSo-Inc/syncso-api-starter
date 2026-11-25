/**
 * How the examples print a result. The SDK hands back the API's JSON as it
 * is; these are the few lines a real integration writes on top of it.
 */
import type { Experience, Image } from "@syncso/sdk";

/** Stop before the first call with setup steps, rather than a stack trace. */
export function requireKey(): void {
  if (process.env.SYNCSO_API_KEY) return;
  console.error(
    "\nNo API key configured.\n\n" +
      "  1. Copy .env.example to .env\n" +
      "  2. Put your key in it as SYNCSO_API_KEY=rtdb_live_...\n\n" +
      "No key yet? Create one at https://syncso.com/console\n",
  );
  process.exit(1);
}

/**
 * Times are wall-clock AT THE VENUE. The string is sliced rather than passed
 * to Date on purpose: `new Date("2026-09-05T21:30:00")` is read in the
 * runtime's zone, so an 8pm New York show would print as 5pm in California.
 * A listing that gave no time of day comes back as a date alone, and prints so.
 */
export function when(exp: Experience): string {
  if (exp.time.ongoing) return exp.time.next_end ? `on now, through ${exp.time.next_end.slice(0, 10)}` : "on now";
  const start = exp.time.matched_timeslots[0]?.start ?? exp.time.next_start;
  if (!start) return "";
  const [date, clock] = start.split("T");
  return clock ? `${date} ${clock.slice(0, 5)}` : date!;
}

export function where(exp: Experience): string {
  if (exp.is_online) return "Online";
  return [exp.location?.name, exp.location?.neighborhood].filter(Boolean).join(", ");
}

export function price(exp: Experience): string {
  if (!exp.price) return "";
  if (exp.price.is_free) return "Free";
  const { min, max } = exp.price;
  if (min === null && max === null) return "";
  return min !== null && max !== null && min !== max ? `$${min}-${max}` : `$${min ?? max}`;
}

/** The cover image if the row has one, else the first that came back. */
export function coverImage(exp: Experience): Image | null {
  const images = exp.media?.images;
  if (!images?.length) return null;
  return images.find((img) => img.role === "cover") ?? images[0] ?? null;
}
