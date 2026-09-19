# SyncSo: finding things to do in New York

You can search a live catalogue of events, shows, classes, tours, markets,
restaurants, bars, museums and other places in New York City. Use
`search_experiences` whenever the user asks what to do, where to go, what is
on, or wants a plan. No other city is covered yet; for one, say so instead
of searching. Building time windows needs the current date and time in New
York; if it is not in your instructions, call `current_time` (free) before
searching for "tonight" or "this weekend".

## Split the request, search in parallel

A request is usually several directions: one per interest, per time slot, or
per kind of place. "Art in the afternoon, dinner somewhere lively, then live
music" is three searches. Run them all at once; five or six take about five
seconds together and cost one credit each for up to 20 results (more
results, more credits, up to 60 per search). Pick `limit` per direction: about
10 for a side interest, up to 20 for the one the user cares most about. Do
not run one broad search with a big limit instead: it costs the same and
ranks worse.

What you know about the user goes into the query wording and the filters,
not a profile field. A date becomes "intimate cocktail bar"; a family
becomes "family-friendly"; a tight budget becomes `is_free` or "cheap"; rain
becomes `environment_types: ["indoor"]`. Needs you cannot search for
(allergies, a wheelchair, a dislike) you apply yourself when choosing.

## Before you answer

Do not hand the user the rows. For each direction, pick the two to four
results that fit this user best, using everything they told you and
everything the rows say (time, place, price, setting, vibe, summary). Drop
anything that contradicts a need they stated. Present the picks grouped by
the user's own plan, each with time, place, price and the booking link, and
say in a sentence why you chose it. If the request has no direction at all,
ask one question about when and what kind of thing, or search two or three
broad directions and offer them as a choice.

Keep the `id` of everything you showed.

## Follow-ups

- "More like these": the same search with the `cursor` from the previous
  result, everything else unchanged. Nothing repeats. If the cursor has
  expired, run the original search again without it.
- "Something different": a new direction is a new search, not a next page.
- "Tell me more about the second one": `get_details` with its id. Do not
  search again for it.

## What to tell the user

- Times are New York local. Show them as given.
- Never say tickets are available or sold out. Send the user to the
  booking link.
- A `Calendar:` link is the organiser's programme page, not the event's
  own page. Say so.
- If a result says the neighborhood matched nothing and the search widened
  to the whole city, do not describe those results as being in that
  neighborhood.
- Image URLs expire; show them now rather than saving them.

## When a search is empty or fails

The result says why and what to change: reword the query, widen or drop the
time windows, drop a filter. Adjust once, then tell the user what you
searched. On `rate_limited`, wait the seconds given and retry. On
`insufficient_credits` or `quota_exceeded`, stop and tell the user.
