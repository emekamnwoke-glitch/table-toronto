# ADR-0016: Dining-decision and demand layer; reservations behind a provider port

**Status:** Proposed
**Date:** 2026-10-05

## Context

The project began as a rebuild of Tablé (ADR-0001): a marketplace where
the app owns restaurant table inventory, validates a diner's ETA against a
hold window, and confirms the booking itself. That model makes the app a
reservation system of record, which is the part of the problem least
likely to be differentiated and most expensive to make real. A solo
project cannot credibly hold live inventory for a city's restaurants, and
the data it does have (Business Licences, ADR-0003) carries no hours,
ratings, cuisine or availability.

The part that is distinctive is the decision: given where someone is, the
time, the weather, their preferences and how busy places are, *where
should they eat right now?* Reservation is what happens after that
decision, and it can be done by whichever system already holds the
inventory.

What exists today: PostGIS restaurants and neighbourhoods, diner and
manager accounts, onboarding preferences, a manager dashboard, and
`bookings` / `restaurant_tables` tables (migrations 005-006) whose
`booking.js` service is still a stub. Nothing records user behaviour, and
nothing yet depends on the booking model.

## Decision

1. **Position the product as a dining-decision and demand layer.** The
   consumer experience is "best options for this moment"; it ends in a
   reservation hand-off. The app is not the system of record for
   reservations.

2. **Put reservations behind a `ReservationProvider` port.** The
   interface (`backend/api-gateway/src/providers/reservationProvider.js`)
   has four methods: `getAvailability`, `createReservation`,
   `getReservation`, `cancelReservation`. Callers never import a concrete
   booking system. Which provider serves a request is registry
   configuration.
   - **`mock`** (built): in-memory, deterministic, always simulated. It
     exists so the UI and recommendation work can proceed before any real
     inventory is connected.
   - **`direct`** (later): our own `restaurant_tables` inventory and the
     hold-window / ETA rule from migration 006, reimplemented as this
     provider's policy rather than as the application's only booking
     model.
   - **A third-party adapter** (later, optional): only through that
     party's approved partner API, under its terms. No scraping and no
     unofficial endpoints.

3. **Simulated data is labelled end to end.** Every availability result
   and reservation carries `simulated: boolean`, and every availability
   result carries a `source` (provider id, retrieval time, simulated
   flag). Analytics, dashboards and any write-up must exclude simulated
   rows from figures presented as measured.

4. **The interface is shaped for the weakest provider, not the
   strongest.** `capabilities` flags say what a provider can really do;
   `createReservation` may return a `redirect` outcome for providers that
   cannot book in-app; availability is time-limited via opaque slot
   tokens; creation requires an idempotency key; failures are a closed set
   of `ProviderError` codes with a `retryable` flag. A directory-only or
   link-out integration therefore fits without changes to callers.

5. **Restaurant identity stays ours.** The port speaks TABLE restaurant
   ids. Mapping to a provider's own ids is the adapter's responsibility
   (a `restaurant_provider_refs` table when the first real adapter needs
   one).

What does not change: the data, infrastructure and map decisions in
ADR-0002 to ADR-0015, the auth and role model, the Terracotta identity,
and the fresh-build rule in ADR-0001.

## Consequences

- The booking service becomes provider-agnostic. `services/booking.js`
  should orchestrate (validate ETA with Valhalla, call the provider,
  record the result) rather than own table locking. Migration 006's
  `bookings` table is kept but is not yet wired to the port; deciding
  whether it stores provider reservations (with a provider id and
  `simulated` column) is deferred to the first slice that books.
- Reservation time is a slot on a date. The hold-window model in
  migration 006 is a different shape (arrive within N minutes), so the
  `direct` provider must define how a slot maps onto it. This is the main
  design work still open.
- Two things the product story depends on are **not available** and are
  not created by this ADR: real availability (needs a real provider) and
  "current demand / how busy" (needs a data source, see below). Until
  then, availability is simulated and the busyness fields stay empty or
  simulated and labelled.
- The consumer app will need an events table (impression, view,
  reservation intent, click, booking) before any funnel or partner view is
  honest. Out of scope here; it is the next decision after this one.
- Any "partner view" or dashboard built before real data exists must be
  visibly a demonstration. Fabricated conversion or cover counts presented
  as results would undermine the project.
- A contract test suite (`test/reservationProvider.contract.js`) defines
  the expected behaviour for every provider; new providers pass it before
  being registered.

## Alternatives considered

- **Keep the original marketplace model (the app owns inventory).**
  Rejected as the defining model: it cannot be real at city scale and
  hides the part of the product that is genuinely new. It survives as the
  `direct` provider.
- **Integrate one named reservation system directly.** Rejected: it ties
  the app's architecture and demo to access that has not been granted, and
  leaves nothing working without it.
- **Scrape availability from a third-party site.** Rejected outright:
  against site terms, brittle, and not something to build a portfolio or a
  partnership on.

## Open questions

- Whether any third-party reservation or directory API is obtainable, and
  on what terms. The partner-programme claims in the strategy notes that
  prompted this ADR have not been verified against the provider's own
  documentation. The port does not depend on the answer.
- The source for "how busy is it now". Google's official Places API, to my
  knowledge, returns hours, rating, price level and place types but not
  popular-times data; this needs checking before the busyness model's
  training target is assumed obtainable (it is the open decision recorded
  in the project notes).
- Whether `direct` should enforce the ETA rule at booking time or only at
  arrival, once slots exist.
