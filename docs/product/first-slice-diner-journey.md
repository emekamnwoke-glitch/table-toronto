# First slice: the diner journey

**Status:** Built (first slice). Implements the principle in
[ADR-0016](../architecture/adr/0016-demand-layer-and-reservation-provider-port.md):
help someone choose where to eat now, then observe what they do after
seeing the recommendation. Events are specified in
[`event-contract.md`](../architecture/event-contract.md).

## The first signal: proximity

The first recommendation signal TABLE can show honestly is **proximity**.
It is the only signal the current data supports for every restaurant: each
has coordinates, and the diner supplies a location. Demand, weather and
wait time appear only when there is a credible source for them (see
"Adding signals one at a time"). So the first version ranks by proximity
and nothing else, and says so.

Proximity in v1 is **straight-line distance**, labelled as such. It is not
walking time (that needs Valhalla, not yet running) and can mislead where
the direct line crosses a ravine, rail corridor or the lake. Replacing it
with walking time later is a new ranking version, measured like any other
change.

## Why this slice

It tests the thesis (do recommendations lead people toward a booking?) and
produces observable behaviour without access to any real reservation
system. The repo already has accounts, restaurants with coordinates, and a
simulated `ReservationProvider`. Missing: recommendation delivery and
behaviour tracking.

## The path

```text
1 Ask  →  2 Nearby options  →  3 Open one  →  4 Continue?  →  5 Demo hand-off
          (reason visible)     (simulated      (the signal)     (labelled simulated)
                                availability)
```

1. **Ask.** A signed-in diner gives a location, a party size (1-20) and a
   date and time. Location comes from the device if allowed, otherwise a
   point picked on the map. Time is limited to 17:00-21:30, the window the
   simulated provider offers; the form says so.
2. **Nearby options.** A short list (up to 5), nearest first. Each card
   shows the restaurant, its neighbourhood and the reason: *1.2 km away
   (straight line)*.
3. **Open one.** The detail view shows the same reason plus **simulated**
   time slots near the requested time, clearly marked.
4. **Continue?** The diner picks a slot and chooses "Continue to
   reservation", or leaves. This choice is the behaviour being measured.
5. **Demo hand-off.** TABLE calls the simulated provider and shows a
   screen that says plainly: *demonstration, no real reservation was made.*
   The outcome is recorded as simulated.

## What counts as a successful first demo

1. **Nearby options for a chosen time.** A diner sees a short list (up to
   5) of nearby restaurants for the date and time they asked for.
2. **The reason is visible.** Every option shows why it is recommended
   (proximity, with the method named), and any simulated information is
   marked simulated.
3. **Open and continue.** The diner can open an option, see simulated
   availability, and continue toward a reservation.
4. **Every step is recorded, honestly.** TABLE records each step as an
   event, marks demo data as simulated, and records a booking outcome as
   leaves an outcome unknown when it cannot be known (no fake
   confirmation is ever emitted). Nothing simulated or unknown is ever
   counted as a real booking.

It is not a success if any screen or report presents a simulated
availability, a demo confirmation, or an unknown outcome as a real result.
This slice measures behaviour (do people continue?), not bookings.

## Ranking v1

- **Candidates:** restaurants within 2 km of the diner, widened to 5 km if
  fewer than 5 are found.
- **Order:** nearest first. Ties break on restaurant id so the order is
  repeatable.
- **Output:** up to 5 restaurants. The ranking version is recorded with
  every recommendation (`v1-proximity`).
- **Availability is not a ranking input.** The simulated provider supplies
  slots to show on the detail view, but they do not decide which
  restaurants appear or in what order, so simulated data never shapes the
  list. The requested time is used for the availability display, not for
  ranking, because we have no opening hours.

| Signal | Source | v1 |
|---|---|---|
| Proximity | Straight line from the diner's point to the restaurant | **Ranks the list.** Observed, labelled "straight line" |
| Availability | Simulated provider | **Shown, not ranked.** Simulated, labelled |
| Cuisine and price match | Manager-entered; empty for licence-data restaurants | Not used |
| Accessibility | Restaurant flag cannot tell "no" from "unknown" | Not used |
| Weather, demand, wait time | No credible source yet | Not used and not shown |

## Adding signals one at a time

Each new signal ships as its own ranking version, so its effect can be
measured against the version without it.

**Gate: a signal is allowed in only if it has all of:** a named source and
licence; known coverage (what share of restaurants and times it covers);
a known freshness; and a way to label the cases where it is missing. A
signal that fails the gate is not shown. A signal is never given a guessed
value to fill a gap.

**Likely order** (each only once its gate is passed): walking time via
Valhalla (a better proximity), manager-entered cuisine and price
preferences, weather from a credible forecast source, then demand and wait
time, which depend on the still-undecided busyness data source.

**Measurement.** Every recommendation records its `ranking_version`.
When a second version exists, a `variant` (control / treatment, assigned
from a hash of the user id so a diner stays in one variant) is added, and
the versions are compared on how often a diner opens an option, how often
they continue to a reservation, and which rank they chose. See the event
contract. At this project's traffic these numbers will be too small to
support a conclusion, so the first goal is that the measurement works and
is honest; any claim about a signal's effect needs enough volume to
justify it, and a write-up should say how much volume that was.

## What we record

Five events, in order: `recommendation_shown`, `restaurant_opened`,
`reservation_intent`, `handoff_started`, `booking_outcome_received`. Field
definitions, who emits each, and the counting rules are in the event
contract. The funnel is shown → opened → intent → handoff → confirmed, with
simulated rows always reported apart from measured ones. In this slice the
reservation steps (intent, handoff, outcome) are simulated because the
provider is; `recommendation_shown` and `restaurant_opened` are real
observations on a ranking built from real proximity.

## Out of scope for the slice

Walking time, any signal other than proximity, real availability, the
manager's side of the funnel, push notifications, the mobile app, and the
partner/aggregate view. Each needs real data or a decision not yet made;
none is faked to fill the gap.

## Decisions needed before building

1. **Where location comes from** if the device refuses it: a map pick
   (needs no geocoder) or an address box (needs Nominatim, not yet
   running). Proposed: map pick.
2. ~~Location privacy~~ **Decided:** events never store the diner's
   coordinates, and not exact per-restaurant distances either (those could
   be combined with the restaurants' known locations to place the diner).
   They keep rank, a coarse distance band and how the location was chosen.
3. **For later, not v1:** `restaurants.accessible` is `NOT NULL DEFAULT
   false`, so "not accessible" and "unknown" look the same. Make it
   nullable before accessibility becomes a hard filter.

## Done when

A signed-in diner can complete steps 1-5 against the local stack; each
recommendation shows its proximity reason and labelled simulated
availability; all five events are recorded with the right emitter; a
funnel query returns shown → opened → intent → handoff → confirmed counts
with real and simulated journeys shown separately; and tests cover the ranking
(including restaurants exactly on the radius edge and fewer than 5
candidates), the event rules (a handoff is never counted as a
confirmation), and the funnel query.
