# ADR-0016: Dining-decision and demand layer; reservations behind a provider port

**Status:** Proposed
**Date:** 2026-10-05 (revised 2026-10-05: product principle and event measurement added)

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
   product principle: *help someone choose where to eat now, then observe
   what they do after seeing the recommendation.* The consumer experience
   is "best options for this moment"; it ends in a reservation hand-off,
   and what happens after the recommendation is measured as part of the
   product (Decision 6), not added later as analytics. The app is not the
   system of record for reservations. The earlier model where the app owns
   table inventory and confirms bookings is a **future provider option**
   (`direct`, below), not the product's defining model.

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

6. **Measure what the diner does next, honestly.** The first journey is
   *dining moment → ranked options → the diner's next action*. Each
   recommendation must be able to say which signals shaped it, and a
   missing or simulated signal is labelled as such, never shown as a live
   fact (Decision 7 says which signals the first version may use). Five
   events are captured, in order:

   | Event | Records |
   |---|---|
   | `recommendation_shown` | Which restaurants were presented, in what order, and which signals were used (with their data status) |
   | `restaurant_opened` | Which option the diner opened, and its rank |
   | `reservation_intent` | That the diner chose to continue toward booking |
   | `handoff_started` | That TABLE sent the diner to a booking destination, and whether that destination was a demo |
   | `booking_outcome_received` | `confirmed` or `cancelled`, from the provider; emitted only when an outcome is actually received |

   This gives one funnel: shown → opened → intent → handoff → confirmed,
   where confirmation data exists. Rules: a handoff is never reported as a
   completed reservation; a missing outcome stays unknown and no
   confirmation is ever emitted without one; and simulated or demo events are kept
   apart from measured ones in every count (Decision 3). Reservation choice
   stays downstream of the recommendation: initially TABLE shows clearly
   labelled simulated availability and records whether the diner continues
   toward booking.

   The first journey, its success criteria and ranking rules are in
   [`docs/product/first-slice-diner-journey.md`](../../product/first-slice-diner-journey.md);
   field-level event definitions, who emits each event, and the counting
   rules are in [`docs/architecture/event-contract.md`](../event-contract.md).
   Events never store the diner's coordinates or exact distances to restaurants
   (which could be combined with the restaurants' known locations to place
   the diner); they keep rank and a coarse distance band. A booking is counted as
   confirmed only when TABLE receives a real confirmation; the simulated
   provider's confirmations are recorded with `simulated = true` and are
   never counted as bookings.

7. **The first honest signal is proximity; others are added one at a
   time.** Proximity is the only signal the current data supports for every
   restaurant (each has coordinates; the diner supplies a location), so the
   first ranking version (`v1-proximity`) orders by straight-line distance,
   labelled as straight line, and by nothing else. Simulated availability is
   shown beside it but does not shape the order. Demand, weather and wait
   time appear only when there is a credible source: a named source and
   licence, known coverage and freshness, and a label for missing cases. A
   signal that fails that gate is not shown and is never given a guessed
   value. Each new signal ships as its own ranking version and is compared
   with the previous one (a recorded `variant`, added when a second ranking
   version exists) on open rate, continue rate
   and chosen rank, reported with its sample size; at this project's traffic
   the comparison demonstrates the mechanism, and claims about a signal's
   effect need enough volume to support them.

What does not change: the data, infrastructure and map decisions in
ADR-0002 to ADR-0015, the auth and role model, the Terracotta identity,
and the fresh-build rule in ADR-0001.

## What changes from the original project

The original (`comp47360-team2`, "Tablé": *tables available now,
reachable in time*) was a six-person academic MVP for Manhattan: a
two-sided marketplace where restaurants release spare table capacity,
nearby diners receive private flash offers, and an in-app booking is
confirmed only if the diner can arrive within the restaurant's hold
window. Table Toronto keeps its ideas and changes the following. Rows
marked ADR-0001 to ADR-0015 were decided earlier; this ADR adds the
product and booking rows.

| Area | Original (Tablé) | Table Toronto | Decided in |
|---|---|---|---|
| **Product** | Two-sided immediate-dining marketplace; the app owns table inventory and confirms bookings | Dining-decision and demand layer: works out where to eat right now, then hands off to a reservation provider | **This ADR** |
| **Core loop** | Restaurant releases capacity → private flash offers to nearby diners → booking | Context-aware recommendation → reservation hand-off. Spare-capacity detection ("opportunity") is the successor to manager-launched campaigns; how the existing offer tables fit is **open** (see below) | **This ADR** |
| **Booking** | In-app, ETA-gated against `hold_window_minutes`, table locked in a transaction | Behind a `ReservationProvider` port. The ETA rule and table locking become the policy of a future `direct` provider; slots are dated and time-limited | **This ADR** |
| **Data honesty** | Simulated/historical restaurant data, stated in the architecture notes | Same posture, made structural: every availability result and reservation carries `simulated`, and simulated rows are excluded from anything presented as measured | **This ADR** |
| **Geography** | Manhattan only | Full amalgamated City of Toronto, 158 neighbourhoods | [0002](0002-scope-full-amalgamated-toronto.md) |
| **Restaurant and venue data** | NYC sources (including PLUTO land use) | Toronto Business Licences, frozen at Dec 2022; carries no cuisine, hours, rating or availability. A PLUTO equivalent is still unchosen | [0003](0003-restaurant-data-source.md) |
| **Mobility proxy** | NYC taxi drop-offs | Bike Share Toronto ridership: seasonal and thin outside downtown/midtown (375 of 7,211 restaurants have no signal at any hour) | [0004](0004-mobility-proxy-bike-share.md), [0005](0005-zone-geometry-unit.md) |
| **Busyness model** | XGBoost via FastAPI, all nine feature groups, reported 62.7% accuracy | Feature matrix built but only three of nine groups populated and no target column; expect different accuracy and report it as a finding. A possible future demand signal (Decision 7); not needed for the first slice, which ranks by proximity | existing notes; this ADR |
| **Hosting** | GCP: Cloud Run, Firebase Hosting (projects deleted and billing closed 2026-08-01) | Self-hosted Dokku or CapRover on a VPS, Caddy for static files | [0006](0006-compute-hosting-platform.md), [0007](0007-web-app-hosting.md) |
| **Database** | Cloud SQL (managed Postgres) | Self-hosted PostgreSQL + PostGIS | [0008](0008-database-engine-and-hosting.md) |
| **Maps and tiles** | Google Maps JS SDK | MapLibre GL JS (web), MapLibre native (mobile), OpenFreeMap tiles | [0009](0009-web-map-rendering-library.md), [0010](0010-mobile-map-rendering-approach.md), [0011](0011-map-tile-provider.md) |
| **Routing and geocoding** | Google Routes API (cached), with a distance fallback | Self-hosted Valhalla; Nominatim | [0012](0012-routing-eta-engine.md), [0013](0013-geocoding-service.md) |
| **Push notifications** | Expo push | Expo push, kept as the one non-open-source exception | [0014](0014-push-notification-service.md) |
| **Team and authorship** | Six-person course project, shared code | Solo portfolio project; fresh codebase, no code or history carried over | [0001](0001-fresh-build-not-fork.md) |
| **Clients** | Consumer mobile (Expo) and merchant web (React + Vite) sharing Redux Toolkit / RTK Query | One web app (React + Vite, react-router, React context) serving diner and manager screens; the mobile app is not built yet | built, not a recorded decision |
| **Auth and roles** | JWT bearer, with an interim `X-User-Id` header for web demos; guest discovery | JWT bearer only; no guest mode yet. Diners self-register; managers are provisioned by an operator (`create-manager`) | built, not a recorded decision |
| **Onboarding preferences** | Budget tier, dietary tags, cuisines, dining styles, wheelchair and sensory access needs | Cuisines, budget (1-4), dining style, accessibility needs. Dietary tags are **not** carried over yet; preferences are saved but only wheelchair and cuisine are used, and only where restaurant data has values | built, not a recorded decision |
| **API gateway** | Express 5 | Express 4 | built, not a recorded decision |
| **Visual identity** | Not carried over | Terracotta: cream and ink-brown with a clay accent, DM Serif Display and DM Sans | built, not a recorded decision |

**Carried over unchanged:** the four-part monorepo split (frontend,
backend, ml-pipeline, database); Node/Express and PostgreSQL for the
gateway and data; JWT bearer authentication; the hold-window idea and ETA
validation as a rule (now provider policy rather than the only booking
model); treating accessibility needs as a hard constraint rather than a
ranking preference; and the practice of reporting data limitations as
findings rather than hiding them.

### Relationship to ADR-0001

ADR-0001 says the rebuild reuses "the ETA-gated booking flow, and the
private flash-deal matching concept" as design inspiration. That stays
true of the *inspiration* but this ADR refines how: ETA-gated booking
survives as provider policy, and the flash-deal concept is the open item
below. ADR-0001's rule that no code or history is carried over is
unaffected.

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
- Event capture (Decision 6) is part of the first slice, not a later
  analytics add-on: the demo journey and its events were built together
  (migration 011, `services/events.js`, `services/funnel.js`), and no funnel
  is shown without them. Providers now declare `simulated`, and the server
  derives each event's flag from it.
- Any "partner view" or dashboard built before real data exists must be
  visibly a demonstration. Fabricated conversion or cover counts presented
  as results would undermine the project.
- A contract test suite (`test/reservationProvider.contract.js`) defines
  the expected behaviour for every provider; new providers pass it before
  being registered.

## Alternatives considered

- **Keep the original marketplace model (the app owns inventory).**
  Rejected as the defining model: it cannot be real at city scale and
  hides the part of the product that is genuinely new. It survives as a
  future provider option (`direct`), not the product's defining model.
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
- What happens to the original's flash-deal mechanism (migration 007's
  `campaigns` and `offers`, and the `campaigns.js` service stub). Options:
  keep manager-launched campaigns alongside system-detected opportunity;
  fold campaigns into opportunity as the manager's way of acting on it; or
  drop them. Undecided, and nothing is built either way.
