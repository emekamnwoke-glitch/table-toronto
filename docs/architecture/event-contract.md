# Event contract

**Status:** Implemented for the first slice. Defines the
behaviour events from
[ADR-0016](adr/0016-demand-layer-and-reservation-provider-port.md) Decision
6, for the journey in
[`first-slice-diner-journey.md`](../product/first-slice-diner-journey.md).

## Principles

- **Append-only.** Events are never edited or deleted.
- **Honest labels.** Every event carries a `simulated` flag. The server
  derives it; a client cannot set it.
- **A handoff is not a booking.** A booking is counted as confirmed only
  when TABLE receives a real confirmation. A demo handoff or a missing
  response is not a booking.
- **Unknown stays unknown.** If a booking outcome is not available, no
  outcome event is emitted. A fake confirmation is never recorded.
- **No precise location, direct or derived.** Events never store the
  diner's coordinates, and never store exact distances to restaurants:
  several distances to restaurants with known locations would let anyone
  work the diner's position back out. They store each restaurant's rank, a
  coarse distance band (`under_500m`, `500m_to_1km`, `1_to_2km`,
  `over_2km`), the search radius, and how the location was chosen. The
  diner still sees their exact distances on screen; they are just not kept.
- **Server emits what it did; the client reports what the diner did.**

## Envelope (every event)

| Field | Notes |
|---|---|
| `event_id` | uuid, unique. Retries and replays with the same id are ignored. Server-emitted events use a deterministic id so a replayed request cannot double-record |
| `event_name` | One of the five below |
| `occurred_at` | ISO 8601 instant when it happened |
| `received_at` | Set by the server on insert |
| `session_id` | uuid, one per app visit |
| `recommendation_id` | uuid. Links every event of one journey to the recommendation that started it |
| `user_id` | Pseudonymous: an HMAC of the account id, not the account id. Keyed by its own secret, `EVENT_PSEUDONYM_KEY`, not by `JWT_SECRET`, so rotating login secrets does not break event continuity. Changing the event key starts a new pseudonym for everyone |
| `simulated` | boolean. See "Deriving `simulated`" |
| `restaurant_id` | uuid. Present on every event except `recommendation_shown` |
| `payload` | The additional fields below |

## Events

| Event | Emitted by | Additional fields |
|---|---|---|
| `recommendation_shown` | server | `restaurant_ids` (display order); `ranked_by` (`proximity`); `items`: per restaurant `{ restaurant_id, rank, distance_band }`; `signals_used` (`["proximity"]`); `ranking_version` (`v1-proximity`); `party_size`; `requested_dining_time`; `location_source` (`device` or `map_pick`); `radius_km` |
| `restaurant_opened` | client | `restaurant_id`; `rank` |
| `reservation_intent` | client | `restaurant_id`; `party_size`; `requested_dining_time` |
| `handoff_started` | server | `restaurant_id`; `destination_type` (`demo` or `provider`); `provider_id` |
| `booking_outcome_received` | server | `restaurant_id`; `outcome` (`confirmed` or `cancelled`); `provider_id`; `covers`; `reservation_id` |

`recommendation_shown` records that a list was *served*, not that it was on
screen. `destination_type = demo` means no real reservation can result.

## Deriving `simulated`

| Event | `simulated` |
|---|---|
| `recommendation_shown` | `false`: ranked by observed proximity; simulated availability is not a ranking input |
| `restaurant_opened` | `false`: a real action on a real list |
| `reservation_intent` | the reservation provider's `simulated` flag |
| `handoff_started` | the provider's `simulated` flag |
| `booking_outcome_received` | the provider's `simulated` flag |

With the only provider today (the mock), the first two are real
observations and the last three are simulated. A confirmation from the mock
is recorded as `confirmed` with `simulated = true` and is never counted as a
real booking.

## Transport

| Endpoint | Does |
|---|---|
| `POST /api/v1/recommendations` | Ranks restaurants and records `recommendation_shown` |
| `GET /api/v1/restaurants/:id/availability` | Returns slots from the provider, with `source.simulated` |
| `POST /api/v1/events` | Accepts `{ "events": [ ... ] }` (up to 20) of `restaurant_opened` and `reservation_intent` only. Rejects the whole batch if any event is malformed, names a recommendation that is not the caller's, or names a restaurant that was not in it |
| `POST /api/v1/reservations` | Calls the provider; records `handoff_started`, and `booking_outcome_received` (`confirmed`) only if the provider returns an outcome |
| `POST /api/v1/reservations/:id/cancel` | Cancels the diner's own reservation and records `booking_outcome_received` with `cancelled`. Anyone else's reservation, or one not made through the journey, is a 404 |

**Limits** (starting values; watch real traffic and the 429s, then adjust).
Per diner, per minute: recommendations 30, availability 60, events 60,
reservations and cancellations 10 (combined). A per-IP backstop of 120 per
minute covers all of these endpoints together, before sign-in. Request
bodies are capped at 32 KB and events at 20 per batch. Over-limit requests
get `429` with a `Retry-After` header; oversized ones get `413`.

**Retries.** The web client retries event posts on `429`, `5xx` and network
failures, up to three attempts with backoff (it honours `Retry-After`, but
gives up rather than make the diner wait more than five seconds). Retries
re-send the same events with the same `event_id`, which the server ignores if
it already recorded them, so a retry cannot inflate the funnel.

**Scaling.** The limiter's store is in memory: correct for one API process.
With several instances, move it to a shared store (for example Redis) so every
instance enforces the same limits.

## Storage

One `events` table (migration 011): `event_id` (primary key), `event_name`,
`occurred_at`, `received_at`, `session_id`, `recommendation_id`, `user_id`,
`restaurant_id` (nullable, no foreign key so history survives a restaurant
being removed), `simulated`, `payload` (jsonb).

## The funnel

Counted in distinct recommendations that reached each stage:

| Stage | Event |
|---|---|
| Recommendations shown | `recommendation_shown` |
| Opens | `restaurant_opened` |
| Reservation intents | `reservation_intent` |
| Handoffs | `handoff_started` |
| Confirmed bookings | `booking_outcome_received` with `outcome = confirmed` |

Reported rates: opens per recommendation shown, intents per open, handoffs
per intent, and confirmed bookings per handoff. Each stage also shows how
many of its journeys were real and how many simulated. **Confirmed
bookings per handoff uses real events only and is `null` when there are no
real handoffs**; it is never computed from simulated confirmations. A
handoff with no outcome event is reported as outcome unknown, not as a
failure and not as a success.

Confirmed counts are **gross**: a cancelled booking stays counted as
confirmed, and cancellations are reported next to it (real and simulated),
so a net figure is never silently implied.

Run it with `npm run funnel --prefix backend/api-gateway`.

## Adding a second signal

Not built. When a second ranking signal passes the admission gate in the
product flow doc, add a `variant` (control / treatment, from a hash of the
user id) to `recommendation_shown` and compare open rate, intent rate and
the chosen `rank` between variants, reporting the sample size with every
figure. Until a second ranking version exists, there is nothing to compare.
