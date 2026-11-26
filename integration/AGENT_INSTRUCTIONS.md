# SyncSo: finding things to do

SyncSo reads everything happening around this person — events, shows,
classes, tours, markets, tastings — and answers what they should do. Use
`find_things_to_do` whenever they ask what to do, where to go, what is on,
or want a day or an evening planned. We cover New York and San Francisco for now — for
anywhere else, say that rather than searching. If they have not said which
city, ask them before searching.

## The clock

Every answer opens with the current time in each city we cover. Say times
in words — "tonight", "this weekend" — and they are resolved against the
clock of the city asked about, which
is the simplest thing to do; send a resolved window in `when` only when you
already hold exact values. Before the first call of a conversation, use the
date your own instructions give you; if you have none, ask without `when`
and read the clock off the answer.

## One call, and the answer comes back ordered

Send what they said, in their words. Whether to add what you know about
them depends on the ask.

**When they named what they want** — "jazz tonight", "a pottery class" —
send that, and leave their tastes out. They already chose the direction,
and anything you add pulls the answer away from it.

**When the ask is open** — "what should we do tonight", "something fun this
weekend" — what you know about them is how the answer finds its direction.
Add what would change which plans are right this time: who they are (where
they live, how long they have been here — a visitor with four days and
someone ten years in Bushwick want opposite answers), what they have liked,
disliked or already done, who they are with and the occasion. Their question
still leads; leave out what does not bear on it.

**Either way, say what they cannot do or must avoid** — a wheelchair, an
allergy, a budget, "my parents can't be on their feet long". It does not
move the direction, it rules plans out, and it is read and reasoned about,
not matched as text.

Write it all as they would say it, in the first person — "I live in
Bushwick", "my partner and I" — not about them as "they": a sentence about
"them" reads as someone else coming along. Within 700 characters, their own
sentence first. A longer request is refused with a note saying so. A bare
question is a fine request — there is nothing to invent.

**Do not split it into searches.** One request is one call, however many
interests it names. "Art in the afternoon, dinner somewhere lively, then
live music" is one `request`, not three.

**Do not re-rank or filter what comes back.** Every row was read against
this request by a model that saw it — a thousand rows and more — and the
order is that judgement. Show them in the order given. Picking your
favourites out of the middle discards the only part of the work you cannot
redo from a list.

An answer takes 8-12 seconds with reasons and 3-6 without.

Leave `limit` out: it is 20, and that is almost always the right ask. A
smaller number does not come back sooner — the sentences are written in
parallel and released in rank order, so the first card arrives at the same
moment either way.

## Showing the answer

Each row arrives finished, laid out as the card to show:

    ![name](the picture)

    **name** — why it suits this person, when the row has it
    time · location · price
    [Book](the booking link)

Pass them on in that shape and that order, all of them, top to bottom.
Please don't reorder everything, and please don't investigate everything,
because the user needs the results fast.

A row may carry a sentence saying why it suits this person, or may not.
When it does, use it as written — rewriting it costs the reader the
reasoning and gains nothing. When it does not, show the row without one
rather than writing your own from the title.

Keep the image on its own line with a blank line under it, or clients will
not draw it. Drop the `[1] id: …` handles — they are there so you can tell
which row is which, not for the reader. Times are local to the event's
city; never convert them, and never say whether tickets are available.

Open with the line the answer leads with: it says how much was read and
what the request was taken to mean, which is the reader's one chance to
correct you before reading on.

## Follow-ups

- **More**: the same `request` with the `cursor` from the last answer.
  Nothing else changed. An expired cursor means asking again without one.
- **A change of mind** ("too far", "something cheaper", "actually Friday"):
  a new call with the change folded into `request`. Say the whole thing
  again, not just the correction.
- **More about one row**: `get_details` with its id and
  `kind: "experience"` — every row here is one, so there is nothing to
  work out. It returns the whole schedule
  rather than the next dates, the venue as a place, where else it is
  listed. Several ids can go in one call. Do not paste what
  it returns at the user: material for your paragraph, not the answer.

## When an answer is empty or fails

Nothing on in that window and area means the window or the distance is the
thing to widen — there is no second place to look. Adjust once, then tell
the user what you asked for. An answer that says a place is outside the
area we cover is neither empty nor a failure: we cover New York and San Francisco only
for now, and nothing was searched. Say that in a sentence, and do not
search one of those in its place unless they ask for it. An answer that asks
which city, or which of two places you sent, is a question for the user: ask
it, then call again with one place. Send `lat`/`lng` only for "near me".

On `rate_limited`, wait the seconds given and retry. On
`insufficient_credits` or `quota_exceeded`, stop: the answer says what
happened and what to do next.
