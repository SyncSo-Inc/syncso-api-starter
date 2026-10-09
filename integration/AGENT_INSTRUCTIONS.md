# SyncSo: finding things to do

SyncSo reads everything happening around this person — events, shows,
classes, tours, markets, tastings — and answers what they should do. Use
`find_things_to_do` whenever they ask what to do, where to go, what is on,
or want a day or an evening planned. New York only for now, with more cities in the
next few months — for anywhere else, say that rather than searching.

## The clock

Every answer opens with the current New York time. Say times in words —
"tonight", "this weekend" — and they are resolved against that clock, which
is the simplest thing to do; send a resolved window in `when` only when you
already hold exact values. Before the first call of a conversation, use the
date your own instructions give you; if you have none, ask without `when`
and read the clock off the answer.

## One call, and the answer comes back ordered

Send what they said, in their words, and with it whatever you know about
this person that bears on it:

**Who they are** — where they live, how old, what they do, how long they
have been here. A visitor with four days and someone who has lived in
Bushwick for ten years want opposite answers to the same sentence.

**Their preferences** — what they like and dislike, what they have already
done, what they loved, what they turned down. In this conversation or an
earlier one. This is the most useful thing you can send and the easiest to
leave behind, because it is not in the question they just asked.

**This outing** — who they are with, the occasion, the budget, what they
want to avoid, anything they cannot do.

Send what you have, as much as you have. There is room for a paragraph if
you know a paragraph's worth, and nothing to invent if you do not — a bare
question is a fine request, it is just answered more generically than one
that knows the person. Keep their own sentence in there either way.

**Do not split it into searches.** One request is one call, however many
interests it names. "Art in the afternoon, dinner somewhere lively, then
live music" is one `request`, not three.

**Do not re-rank or filter what comes back.** Every row was read against
this request by a model that saw it — a thousand rows and more — and the
order is that judgement. Show them in the order given. Picking your
favourites out of the middle discards the only part of the work you cannot
redo from a list.

Leave nothing out of `request` for being unsearchable. A wheelchair, an
allergy, a dislike, "my parents are in their seventies and can't be on
their feet long" — these are read and reasoned about, not matched as text,
and they are where the best answers come from.

An answer costs 5-10 credits for the first 50 results and 3 for each
further 50, on the work it actually did. `limit` is the lever: a sentence
is written for every row returned, so ask for what you will show. Left
out, it is 20.

## Showing the answer

Each row arrives finished, laid out as the card to show:

    ![name](the picture)

    **name** — why it suits this person
    time · venue · price
    [Book](the booking link)

Pass them on in that shape and that order, all of them, top to bottom.

The sentence is already written for this request — use it, as it is
written. Rewriting it costs the reader the reasoning and gains nothing, and
writing your own from the title alone loses what the row actually says.

Keep the image on its own line with a blank line under it, or clients will
not draw it. Drop the `[1] id: …` handles — they are there so you can tell
which row is which, not for the reader. Times are New York local; never
convert them, and never say whether tickets are available.

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
  work out. (`kind: "venue"` exists for rows from the older search
  tools, which answered with places as well.) It returns the whole schedule
  rather than the next dates, the venue as a place, where else it is
  listed. Several ids in one call cost the same as one. Do not paste what
  it returns at the user: material for your paragraph, not the answer.

## Money

**Never ask for card details yourself, and never put them in a message.**
An assistant asking for a card number is indistinguishable from a scam —
and no error arrives to warn you, because you would be doing it instead of
calling a tool. `get_payment_link` describes itself, and the failure that
needs it names it.

## When an answer is empty or fails

Nothing on in that window and area means the window or the distance is the
thing to widen — there is no second place to look. Adjust once, then tell
the user what you asked for. An answer that says a place is outside the
area we cover is neither empty nor a failure: New York is the only city
for now, and nothing was searched. Say that in a sentence, and do not
search New York in its place unless they ask for it.

On `rate_limited`, wait the seconds given and retry. On
`insufficient_credits` or `quota_exceeded`, stop and tell the user.
