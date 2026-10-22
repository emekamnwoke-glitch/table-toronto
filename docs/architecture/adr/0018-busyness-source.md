# ADR-0018: Busyness source for the demand signal

**Status:** Proposed (options note; no option chosen yet)
**Date:** 2026-10-22
**Relates to:** [ADR-0016](0016-demand-layer-and-reservation-provider-port.md) (Decision 7 admission gate), [ADR-0017](0017-no-google-places-content.md) (retires the popular-times target), [ADR-0004](0004-mobility-proxy-bike-share.md) (mobility proxy)

## Context

The diner journey ranks restaurants by proximity only (`v1-proximity`).
ADR-0016 Decision 7 allows a second signal, "how busy is it now", but only
once a source passes an admission gate: a named source and licence, known
coverage and freshness, and a label for missing cases. A signal that fails
the gate is not shown and never gets a guessed value.

The original project trained a busyness model on Google popular-times data.
ADR-0017 removed that plan. Places has no popular-times field, its terms
bar storing or training on its content, and scraping or buying popular
times was rejected. The busyness model has no training target now. The
migration `008_busyness_scores` and the `busyness` fields on recommendations
exist, but nothing populates them, and the first slice does not depend on
them.

So the open question is which source, if any, can supply a busyness signal
that passes the gate, and what the busyness model becomes.

## Options

### A. No busyness signal; keep proximity only

Ship `v1-proximity` as the only ranking. Leave the busyness fields empty and
the model unbuilt, and say so in the write-up.

- Passes the gate trivially. Nothing to license or label beyond what exists.
- The diner journey loses the "how busy" dimension the product description
  names. The comparison between ranking versions, which is the main research
  point of ADR-0016, has only one version to compare.
- The busyness model stays unbuilt. That is reported as a finding, as
  ADR-0017 requires.

### B. OpenStreetMap opening hours as a "open now" signal (not busyness)

Use `opening_hours`, `cuisine` and `wheelchair` from the Toronto OSM extract
(already needed for routing, ADR-0012). Use `opening_hours` to say whether a
place is open at the diner's time, which is a fact about the place, not
demand.

- Clearly distinct from busyness. It answers "can I eat there now", not
  "how crowded is it". The label must say so, so it is never presented as
  demand.
- Coverage is unmeasured. ADR-0017 notes that an earlier count against the
  public Overpass servers failed, so this needs a downloaded extract and a
  match against the licence records.
- OSM is licensed under the ODbL. Any published derived database needs
  attribution and share-alike treatment. This needs checking before a
  dataset is released.
- Does not address the busyness training target, so the busyness model
  would still be unbuilt.

### C. Manager-reported current busyness (first-party)

Managers report current busyness through the manager interface, which
already exists for manager-entered attributes. Reports are timestamped and
labelled as manager-reported.

- First-party, so the licence question is ours to settle, and the signal
  can be shown with its source stated.
- Coverage will be small. Only restaurants whose managers join the
  programme report anything, and reports go stale quickly, so the freshness
  rule has to decide when a report stops counting.
- Needs a real user population to measure against. ADR-0016 notes that the
  project's traffic is too low to support claims about a signal's effect, so
  this would demonstrate the mechanism rather than prove the effect.
- A busyness model trained on these reports would have very few labels.
  Treat any such model as a demonstration, not a production predictor.

### D. Mobility proxy as a busyness stand-in (Bike Share ridership)

Use Bike Share Toronto ridership (ADR-0004) as a proxy for foot traffic and
train the busyness model on it.

- Has a named, open source with known coverage. Coverage is thin outside
  downtown and midtown, and ADR-0016 records that 375 of 7,211 restaurants
  have no signal at any hour.
- ADR-0017 is explicit that a mobility proxy is not a substitute for a
  busyness label. Presenting it as busyness would fail the "label for
  missing cases" and "named source" parts of the gate in spirit, even if it
  passes the letter.
- Allowed only as a clearly labelled proxy-only demonstration, never as the
  "how busy" value shown to a diner.

### E. Purchase popular times from a third-party service

- ADR-0017 left this unadopted because the upstream data source and licence
  are unverified. It cannot pass the gate until those are checked in writing.
- Re-open only if a vendor documents where the data comes from and grants a
  licence that covers storage and model training.

### F. Scrape popular times

Rejected, as in ADR-0017. Against the Google terms, brittle, and not a basis
for a portfolio project.

## Recommendation (for discussion)

Keep **A** as the shipping position, and run **B** and **C** as the two
candidates to evaluate against the gate, one at a time, as ADR-0016 asks.

- **B** is cheap to check and is a real ranking input, but it answers a
  different question. It is useful for "open now" and should not carry the
  busyness label.
- **C** is the only option that can give a true busyness signal from a
  source we control. It is worth building only if the manager interface
  already has the reporting path, and its coverage will be small.
- **D** should be used only as a labelled demonstration, if at all.
- **E** and **F** stay closed unless the conditions above are met.

The busyness model itself is undecided. Its options are to drop it, keep it
as a labelled proxy-only demonstration (D), or rebuild it on C once there
are enough reports to train on. The migration `008_busyness_scores` should
not be used until that choice is made.

## Consequences (of proceeding with the recommendation)

- No busyness value is shown to diners until a source passes the gate. The
  busyness fields stay empty.
- The busyness model stays unbuilt, and the original's 62.7% figure stays a
  finding about a model that had no legitimate training target (ADR-0017).
- Any signal added later ships as its own ranking version and is recorded
  with its data status in `recommendation_shown`.
- Any published OSM-derived data carries ODbL attribution and share-alike
  terms. Check this before publishing a dataset.

## Open questions

- Does the manager interface need a busyness-report path, or is that a
  separate build? What is the freshness rule for a report?
- How much of Toronto's restaurant data does the OSM extract carry for
  `opening_hours`, and how well does it match the licence records?
- Should the busyness model be dropped, kept as a demonstration, or rebuilt
  on first-party reports?
- Who checks the licence terms for any third-party source before it is
  considered (ADR-0017 recommends taking legal advice before relying on a
  reading of terms)?
