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
   * Personalized search. Pass what you know about the person in
   * `user_context`; each result comes back with a `match.reason`.
   *
   * Slower and dearer than search (20-30s, 3-10 credits vs 2-4s, 1), so it
   * earns its keep only when you actually know something about the person.
   */
  recommend(body: SearchRequest & IntelligenceExtras): Promise<SearchResponse> {
    return this.post("/local-intelligence", { ...body, stream: false });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    // Local Intelligence can take 30s; a shorter timeout is self-inflicted failure.
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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

export interface IntelligenceExtras {
  /** Adds a 2-3 sentence `summary` of the recommendations. */
  include_summary?: boolean;
  /** Omit entirely for an unpersonalized AI ranking. */
  user_context?: {
    /** The richer this is, the better the ranking. Up to 2000 chars. */
    preferences_text?: string;
    interests?: string[];
    avoid?: string[];
    profile?: {
      party?: "solo" | "couple" | "friends" | "family" | "team";
      budget?: "$" | "$$" | "$$$" | "$$$$";
      age_range?: string;
      home_area?: string;
    };
  };
  intelligence?: {
    /**
     * false uses your query verbatim for retrieval — several times faster and
     * cheaper. Results are still ranked and explained either way; the switch
     * only changes how candidates are found.
     */
    intent?: boolean;
  };
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
  /** Local Intelligence only. */
  match?: { score: number; reason: string | null };
}

export interface Venue {
  id: string;
  name: string;
  venue_type: string | null;
  address: string | null;
  neighborhood: string | null;
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
