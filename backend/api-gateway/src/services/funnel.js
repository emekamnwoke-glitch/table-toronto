// The first funnel (docs/architecture/event-contract.md): recommendations
// shown -> opens -> reservation intents -> handoffs -> confirmed bookings,
// counted in distinct recommendations that reached each stage, with real and
// simulated journeys always shown separately.
//
// The last rate (confirmed per handoff) uses real events only and is null
// when there are no real handoffs: a simulated provider's confirmation is
// never counted as a booking.
const { pool } = require("../db");

const STAGES = [
  { stage: "shown", event: "recommendation_shown" },
  { stage: "opened", event: "restaurant_opened" },
  { stage: "intent", event: "reservation_intent" },
  { stage: "handoff", event: "handoff_started" },
  { stage: "confirmed", event: "booking_outcome_received" },
];

/**
 * @param {{ since?: string, recommendationIds?: string[] }} [options]
 *   since: ISO timestamp lower bound on occurred_at; recommendationIds: restrict to these journeys
 */
async function funnel({ since, recommendationIds } = {}, db = pool) {
  const { rows } = await db.query(
    `SELECT event_name, simulated, count(DISTINCT recommendation_id)::int AS journeys
     FROM events
     WHERE ($1::timestamptz IS NULL OR occurred_at >= $1)
       AND ($2::uuid[] IS NULL OR recommendation_id = ANY($2))
       AND (event_name <> 'booking_outcome_received' OR payload->>'outcome' = 'confirmed')
     GROUP BY event_name, simulated`,
    [since ?? null, recommendationIds ?? null]
  );

  const stages = STAGES.map(({ stage, event }) => {
    const real = rows.find((r) => r.event_name === event && r.simulated === false)?.journeys ?? 0;
    const simulated = rows.find((r) => r.event_name === event && r.simulated === true)?.journeys ?? 0;
    return { stage, event, real, simulated };
  });

  // Distinct journeys per stage across both groups, so a journey whose early
  // steps are real and later steps simulated is counted once per stage.
  const { rows: totals } = await db.query(
    `SELECT event_name, count(DISTINCT recommendation_id)::int AS journeys
     FROM events
     WHERE ($1::timestamptz IS NULL OR occurred_at >= $1)
       AND ($2::uuid[] IS NULL OR recommendation_id = ANY($2))
       AND (event_name <> 'booking_outcome_received' OR payload->>'outcome' = 'confirmed')
     GROUP BY event_name`,
    [since ?? null, recommendationIds ?? null]
  );
  for (const s of stages) s.total = totals.find((r) => r.event_name === s.event)?.journeys ?? 0;

  const by = Object.fromEntries(stages.map((s) => [s.stage, s]));
  const ratio = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 1000 : null);

  const rates = [
    { name: "opens_per_shown", value: ratio(by.opened.total, by.shown.total), from: "shown", to: "opened" },
    { name: "intents_per_open", value: ratio(by.intent.total, by.opened.total), from: "opened", to: "intent" },
    { name: "handoffs_per_intent", value: ratio(by.handoff.total, by.intent.total), from: "intent", to: "handoff" },
  ].map((r) => ({
    ...r,
    basis: "all journeys",
    includesSimulated: by[r.from].simulated > 0 || by[r.to].simulated > 0,
  }));
  rates.push({
    name: "confirmed_per_handoff",
    value: ratio(by.confirmed.real, by.handoff.real),
    from: "handoff",
    to: "confirmed",
    basis: "real events only",
    includesSimulated: false,
  });

  // Confirmed counts are gross: a cancelled booking stays in "confirmed" and is
  // also counted here, so net figures are never silently implied.
  const { rows: cancelled } = await db.query(
    `SELECT simulated, count(DISTINCT recommendation_id)::int AS journeys
     FROM events
     WHERE event_name = 'booking_outcome_received' AND payload->>'outcome' = 'cancelled'
       AND ($1::timestamptz IS NULL OR occurred_at >= $1)
       AND ($2::uuid[] IS NULL OR recommendation_id = ANY($2))
     GROUP BY simulated`,
    [since ?? null, recommendationIds ?? null]
  );
  const cancellations = {
    real: cancelled.find((r) => r.simulated === false)?.journeys ?? 0,
    simulated: cancelled.find((r) => r.simulated === true)?.journeys ?? 0,
  };
  cancellations.total = cancellations.real + cancellations.simulated;

  return { stages, rates, confirmedBookingsReal: by.confirmed.real, cancellations };
}

module.exports = { funnel, STAGES };
