# ADR-0017: No Google Places content for ranking, storage or model training

**Status:** Accepted
**Date:** 2026-10-05
**Partly supersedes:** [ADR-0003](0003-restaurant-data-source.md) (its last
consequence, that the Google Places API supplies the popular-times target)

## Context

The original project used the Google Places API for restaurant attributes
(rating, review count, visit duration) and, as the training target for its
busyness model, popular-times data. ADR-0003 carried that plan forward: it
kept Google Places "for the one field it is uniquely positioned to
provide". The project notes have listed Google Places access as the one part
of the pipeline that "can't be free/open".

On 2026-10-05 the Place Details field list, the pricing page and Google's
terms were read directly. Findings:

- **No popular-times or live-busyness field exists** in Place Details.
  Google documents popular times as something shown in Maps and Search, not
  as API output. The attributes the API does offer are address, location and
  types (cheapest tier); wheelchair-accessibility options and primary type
  (a middle tier); opening hours, rating, rating count and price level (the
  "Enterprise" tier, billed per call); and cuisine-style flags such as
  `servesDinner` and `reservable` (the highest tier).
- **The terms restrict what can be done with the data** (Google Maps
  Platform Terms of Service, last modified 2026-08-26, and the Service
  Specific Terms, last modified 2026-06-10). Paraphrased:
  - *No scraping, pre-fetching, indexing or storing.* Only the place ID may
    be cached indefinitely; latitude and longitude may be cached for at most
    30 consecutive days (Service Specific Terms, Places API, §14.3).
  - *No use with a non-Google map.* Places content must not be displayed on
    or used with a non-Google map (§14.2). The Places UI Kit is the one
    exception, allowed with or without a non-Google map (§15.1).
  - *No creating content from Google Maps content.* The terms give, as an
    example of what is prohibited, using Places latitude and longitude as
    input to a point-in-polygon analysis, and using Google Maps content to
    train, test, validate or fine-tune machine learning models.
- This is a reading of legal text, not legal advice, and the terms change.

## Decision

1. **Google Places content is not used in this project** to train, test or
   validate any model; as a stored attribute or ranking feature (hours,
   rating, price level, accessibility, cuisine, types); to place or label
   anything on the MapLibre map (ADR-0009, ADR-0011); or in any join against
   neighbourhood polygons (ADR-0005). Nothing from the Places API is
   pre-fetched or cached. Place IDs and coordinates already held come from the
   licence data and our own geocoder (ADR-0003, ADR-0013), not from Places.

2. **The popular-times busyness target is retired as a plan.** The busyness
   model no longer has an assumed training source. Any "how busy is it now"
   or demand signal must come from a source that passes the admission gate in
   ADR-0016 Decision 7 (a named source and licence, known coverage and
   freshness, a label for missing cases). Scraped popular times, and
   third-party services that repackage Google's data, do not pass that gate
   without a source and licence check that shows otherwise.

3. **No `GOOGLE_PLACES_API_KEY` in the project's configuration.** The
   placeholder in `.env.example` is removed so nothing implies the key is
   expected.

4. **Not planned, but not forbidden:** the Places UI Kit, which the terms
   allow beside a non-Google map. If it were ever used it would be Google's
   rendered widget showing Google's content with Google's attribution, and
   nothing from it would flow into our ranking, storage or models.

This ADR does not choose a replacement. Candidates are evaluated against the
admission gate, one at a time, as ADR-0016 describes.

## Consequences

- ADR-0003's last consequence no longer holds. The busyness model, which the
  original reported at 62.7% accuracy, **cannot be rebuilt the way the
  original built it**. That is a finding to report, not a bug to hide: the
  rebuild's feature matrix will stay at three of nine populated feature
  groups, with no target, until a legitimate source exists, and the
  mobility-proxy work (ADR-0004) is not a substitute for a busyness label.
- Columns that were planned from Google Places (rating, review count,
  typical visit duration, the busyness target) have no source now. The
  separate land-use group (area, turnover, takeaway ratio) was blocked on a
  different decision and is unaffected by this one.
- The second ranking signal for the diner journey cannot come from Places.
  The candidates, none measured yet: OpenStreetMap tags (`opening_hours`,
  `cuisine`, `wheelchair`) from the Toronto extract that Valhalla needs
  anyway (ADR-0012), which also needs matching OSM points to licence-data
  restaurants; manager-entered attributes, already built; and, as an idea
  only, manager-reported current busyness, a small but first-party demand
  signal. Weather sources have not had their terms checked.
- Dropping Places removes a paid, quota-bound dependency and the one
  non-open-source data input, consistent with ADR-0006 onward.
- If this is ever reconsidered, re-read the terms first (they were last
  modified in mid 2026) and take legal advice before relying on any reading
  in this ADR.

## Alternatives considered

- **Use Places with a Google Map.** Rejected: it contradicts ADR-0009 and
  ADR-0011, and no popular-times data would be gained.
- **Call Places on demand and only show the result, storing nothing.**
  Rejected for ranking: it cannot feed a stored feature or a model, costs per
  call, and mixing it with our map is what the terms prohibit.
- **Scrape popular times.** Rejected outright: against the terms, brittle,
  and not a basis for a portfolio project.
- **Buy popular times from a third-party service.** Not adopted. Where such a
  service gets its data and on what licence is unverified.

## Open questions

- How much of Toronto's restaurant data OpenStreetMap actually carries
  (hours, cuisine, wheelchair), and how well it matches the licence records.
  An attempted count against the public Overpass servers on 2026-10-05 failed
  because they were busy; measure against a downloaded extract instead.
- Whether managers will report current busyness, and whether a first-party
  signal with small coverage is worth building.
- What the busyness model becomes: dropped, kept as a clearly labelled
  proxy-only demonstration, or rebuilt on a first-party signal.
