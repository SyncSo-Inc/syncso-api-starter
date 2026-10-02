/**
 * SyncSo Partner API client.
 *
 * No dependencies — fetch is built into Node 18+. Copy this file into your
 * project and adapt it.
 */

const BASE = process.env.SYNCSO_API_BASE ?? "https://rtdb.syncso.com/partner/api/v1";

export class SyncSoError extends Error {
  readonly status: number;
  readonly code: string;
  /** Quote this if you contact support about a specific call. */
  readonly requestId: string;
  readonly retryAfterSeconds?: number;

  // Fields are assigned explicitly rather than declared as constructor
  // parameter properties: those emit code, so Node's own type stripping
  // rejects them and this file would need a build step to run.
  constructor(
    status: number,
    code: string,
    message: string,
    requestId: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "SyncSoError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Its own class so a CLI can print setup steps instead of a stack trace. */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "No API key configured.\n\n" +
        "  1. Copy .env.example to .env\n" +
        "  2. Put your key in it as SYNCSO_API_KEY=rtdb_live_...\n\n" +
        "Or export it:  export SYNCSO_API_KEY=rtdb_live_...\n" +
        "No key yet? Request one at https://syncso.com/partner-api",
    );
    this.name = "MissingApiKeyError";
  }
}

export class SyncSoClient {
  private readonly apiKey: string;

  constructor(apiKey = process.env.SYNCSO_API_KEY) {
    if (!apiKey) throw new MissingApiKeyError();
    this.apiKey = apiKey;
  }

  /** Free-text search over live experiences and venues. */
  search(body: SearchRequest): Promise<SearchResponse> {
    return this.post("/search", body);
  }

  /**
   * A curated pool per city, no query required — for surfaces where nobody
   * has typed anything. Deliberately small: a city with three worth showing
   * returns three, not a padded list. Growth plan and above.
   */
  featured(body: FeaturedRequest): Promise<SearchResponse> {
    return this.post("/featured", body);
  }

  /**
   * Ask what someone should do, in the words they would use.
   *
   * Everything on in that window and area is read against the request --
   * a thousand rows and more -- and comes back ranked, each result with a
   * sentence saying why it is there. Send the whole request as one
   * `message`: who they are with, the occasion, the budget, what they want
   * to avoid, anything they cannot do. Do not split it into several calls,
   * and do not re-rank what comes back -- the order IS the reading.
   *
   * Slower and dearer than search (about 13s and 6-9 credits at the default
   * effort, against under 2s and 1), so it earns its keep when you have
   * something to say about the person. `effort` buys planning and the
   * quality of the sentences; see the manual's section 7.4.
   */
  ask(body: AskRequest): Promise<AskResponse> {
    return this.post("/local-intelligence", body);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    // Images unless the caller said otherwise. Most surfaces showing an event
    // want a picture, and a search row's images only come back if the request
    // asked for them — a default of none makes the catalogue look emptier
    // than it is.
    //
    // NOT on /local-intelligence: that endpoint has no `media` field and
    // rejects what it does not know, so sending this default would 422 every
    // call. Its results carry `image` and `images` without being asked.
    const withMedia =
      path === "/local-intelligence"
        ? (body as Record<string, unknown>)
        : { media: { images_per_result: 3 }, ...(body as Record<string, unknown>) };

    // Local Intelligence takes about 13s and can run longer; a shorter
    // timeout is self-inflicted failure.
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(withMedia),
      signal: AbortSignal.timeout(60_000),
    });

    if (response.ok) return response.json() as Promise<T>;

    const requestId = response.headers.get("x-request-id") ?? "unknown";
    let code = "unknown";
    let message = `HTTP ${response.status}`;
    let retryAfter: number | undefined;
    try {
      const err = (await response.json()) as {
        error?: { code: string; message: string };
        retry_after_s?: number;
      };
      if (err.error) ({ code, message } = err.error);
      retryAfter = err.retry_after_s;
    } catch {
      // A non-JSON body is a transport error — keep the status.
    }
    throw new SyncSoError(response.status, code, message, requestId, retryAfter);
  }
}

// ---------------------------------------------------------------------------
// Types — trimmed to what this starter uses. The full response carries more:
// https://syncso.com/partner-api

export interface Location {
  city?: string;
  /** Narrows a city search. Only valid with `city`, never with `point`. */
  area_text?: string;
  /** Circle search. radius_km 0.1-50. Results carry `distance_km`. */
  point?: { lat: number; lng: number; radius_km: number };
}

/** Local time at the target city, no UTC offset: "2026-09-05T19:00". */
export interface TimeWindow {
  start: string;
  end: string;
}

/**
 * A bounded lift, not a sort: results scoring above the catalogue median move
 * earlier in proportion to how far above, and relevance still carries most of
 * the order. Results at or below the median stay where they were.
 */
export interface Ranking {
  prefer_popularity?: boolean;
  prefer_credibility?: boolean;
  prefer_uniqueness?: boolean;
}

export interface MediaOptions {
  images_per_result?: number;
  videos_per_result?: number;
  include_videos?: boolean;
  /** false to receive only photographs. */
  include_ai_generated?: boolean;
}

export interface Image {
  url: string;
  /** "cover" is the one to lead with; the rest are "gallery". */
  role: string | null;
  is_ai_generated: boolean;
  attribution: { platform: string | null; author: string | null } | null;
  /** Venue images are presigned and DO expire — re-fetch, never cache the URL. */
  expires_at: string | null;
}

export interface Media {
  images: Image[];
  videos: Array<{ url: string; platform: string | null }>;
}

/** The cover image if the row has one, else the first of whatever came back. */
export function coverImage(row: { media?: Media | null }): Image | null {
  const images = row.media?.images;
  if (!images?.length) return null;
  return images.find((img) => img.role === "cover") ?? images[0] ?? null;
}

export interface SearchRequest {
  /**
   * Omit it entirely for browse mode, where the filters are the intent.
   * A blank string is always rejected — an empty search box forwarded
   * verbatim is a bug on your side, and this API says so.
   */
  query?: string;
  location: Location;
  time_windows?: TimeWindow[];
  result_types?: Array<"experiences" | "venues">;
  /** 1-60. Maximum per result type, not in total. */
  limit?: number;
  /** The `meta.next_cursor` of the previous page, everything else unchanged. */
  cursor?: string;
  ranking?: Ranking;
  media?: MediaOptions;
  /**
   * Narrows experiences only; venues are never filtered. An experience whose
   * attribute is unknown is left out rather than guessed.
   */
  filters?: {
    experiences?: {
      is_free?: boolean;
      environment_types?: Array<"indoor" | "outdoor" | "mixed">;
    };
  };
}

/** /featured takes no query: that is the point of it. */
export interface FeaturedRequest {
  location: Location;
  time_windows?: TimeWindow[];
  /** 1-100, default 20. */
  limit?: number;
  cursor?: string;
  /** `score`: strongest first (default). `time`: soonest first. */
  sort?: "score" | "time";
  media?: MediaOptions;
}

export interface AskRequest {
  /**
   * What they want, as a person would say it. A sentence or two, not
   * keywords. Leave nothing out for being unsearchable: a wheelchair, an
   * allergy, a dislike, "my parents are in their seventies and can't be on
   * their feet long" are read and reasoned about, and they are the most
   * useful thing you can send. Time and place can be said here too.
   */
  message: string;
  /**
   * A neighbourhood, borough, landmark, street address or transit line,
   * when you want to be certain of it rather than leave it to the
   * sentence. Beats any place named in `message`.
   */
  place?: string;
  /** Their position, when you have it. Beats `place`. */
  lat?: number;
  lng?: number;
  /** How far they will go. Default 3 miles from a point, 5 from an area. */
  radius_mi?: number;
  /**
   * Windows you have already resolved, New York local wall-clock
   * (`YYYY-MM-DDTHH:MM`). Beats any time in `message`.
   *
   * A LIST because a calendar is a list: two windows with a gap between
   * them do not search the gap. Give `end` only when there is a real
   * deadline -- an absent `end` means the rest of that day, not the year.
   */
  when?: Array<{ start: string; end?: string }>;
  /**
   * What is true of this person across visits. It reorders the answer; it
   * never narrows what is searched.
   */
  context?: { interests?: string[]; preferences?: Array<Record<string, unknown>> };
  /**
   * How hard to think about the request. `medium` is the default and is
   * right almost always; `high` for a request carrying real constraints to
   * reason about; `low` for a bare "what's on tonight".
   */
  effort?: "high" | "medium" | "low";
  /**
   * How many results to return (1-400, default 50). A sentence is written
   * for every one and the price follows that, so ask for what you will
   * actually show.
   */
  limit?: number;
  /** The previous answer's `next_cursor`, everything else unchanged. */
  cursor?: string;
}

/** One ranked result, with the sentence already written for this request. */
export interface AskResult {
  id: string;
  title: string;
  /** 0-1, how well this answers the request. */
  score: number;
  /**
   * One sentence, addressed to the end user, built only from facts in the
   * result itself. Safe to display verbatim. `null` when none could be
   * written in time: show the result without it rather than hiding it.
   */
  reason: string | null;
  /** The same fit in short phrases, for a card that shows tags. */
  reasons?: string[];
  start?: string | null;
  end?: string | null;
  /** True for a run already open -- say "on now, through ..." not a time. */
  ongoing?: boolean;
  venue?: string | null;
  neighborhood?: string | null;
  distance_mi?: number | null;
  price_min?: number | null;
  price_max?: number | null;
  is_free?: boolean | null;
  link?: string | null;
  summary?: string | null;
  image?: string | null;
  images?: string[];
  category?: string | null;
  experience_type?: string | null;
}

export interface AskResponse {
  /**
   * The opening line: how much was read and what the request was taken to
   * mean. Show it first -- it is the reader's one chance to correct you.
   */
  understood: string | null;
  /** Rows in the window and area before ranking; the figure `understood` quotes. */
  total_in_range: number;
  /** Ranked. Show them in this order. */
  results: AskResult[];
  /** What the time and place words resolved to. */
  window: Record<string, unknown>;
  place: Record<string, unknown>;
  /** Each inference the request left open, in one sentence. Show them. */
  assumptions: string[];
  /** True when the circle searched is empty but the catalogue is not. */
  out_of_area?: boolean;
  /** True when nothing in range actually fits; say so rather than implying a match. */
  thin_answer?: boolean;
  /** Results folded away as the same suggestion as one that is here. */
  folded?: Array<Record<string, string>>;
  next_cursor?: string | null;
  meta?: { credits_charged?: number; effort?: string; results?: number };
  request_id?: string;
}

/** Wall-clock time at the venue, plus the zone to read it in. */
export interface LocalTime {
  local: string;
  timezone: string;
}

export interface Experience {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  experience_type: string | null;
  time: {
    type: string;
    next_start: LocalTime | null;
    matched_timeslots: Array<{ start: LocalTime }>;
  };
  venue: { name: string; address: string | null; neighborhood: string | null } | null;
  is_online: boolean;
  environment_type: string | null;
  neighborhood: string | null;
  price: { min: number | null; max: number | null; currency: string; is_free: boolean } | null;
  booking: { primary_link: string | null };
  media?: Media | null;
  /** Local Intelligence only. */
  match?: { score: number; reason: string | null };
}

export interface Venue {
  id: string;
  name: string;
  venue_type: string | null;
  address: string | null;
  neighborhood: string | null;
  media?: Media | null;
  match?: { score: number; reason: string | null };
}

export interface SearchResponse {
  experiences: Experience[];
  venues: Venue[];
  summary?: string;
  meta: {
    /** "relaxed" means that array was widened to the whole city. */
    normalized?: { area_text?: string | null; area_scope?: Record<string, string> };
    /** Both arrays empty: no_candidates | no_personalized_matches | deadline_exhausted. */
    empty_reason?: string;
    latency_ms?: number;
    credits_charged?: number;
    /** Present while more pages remain; null on the last. */
    next_cursor?: string | null;
  };
  request_id: string;
}
