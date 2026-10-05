// Integration tests for the first-slice diner journey (recommendations,
// availability, events, reservation hand-off, funnel). Needs the
// docker-compose Postgres with migrations applied. Test restaurants are
// placed in Lake Ontario, well away from any real restaurant, so real data
// cannot change the expected ranking. Everything created is removed after.
process.env.NODE_ENV = "test";
require("dotenv").config({ path: require("path").join(__dirname, "../../../.env") });

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { assertJwtSecret } = require("../src/auth");
const app = require("../src/app");
const { pool } = require("../src/db");
const { pseudonym, assertEventKey } = require("../src/services/events");
const { funnel } = require("../src/services/funnel");
const { torontoToday } = require("../src/services/recommendations");

const run = Date.now();
const KM_PER_DEG_LAT = 111.19;
const CENTER_A = { lat: 43.565, lng: -79.4 };
const CENTER_B = { lat: 43.56, lng: -79.25 };
const CENTER_EMPTY = { lat: 43.552, lng: -79.12 };
const PASSWORD = "correct-horse-1";

let server;
let base;
let alice; // { token, id }
let bob;
const createdRecommendations = [];
const createdRestaurants = [];
const sessionId = crypto.randomUUID();

const plusDays = (n) => new Date(Date.parse(torontoToday()) + n * 86400000).toISOString().slice(0, 10);

async function call(method, route, { body, token } = {}) {
  const res = await fetch(base + route, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function signUp(n) {
  const res = await call("POST", "/auth/register", { body: { email: `j${run}-${n}@example.test`, password: PASSWORD } });
  return { token: res.body.token, id: res.body.user.id };
}

// Restaurants at given distances (km) due north of `center`.
async function makeRestaurants(center, distancesKm, tag) {
  const ids = [];
  for (const [i, km] of distancesKm.entries()) {
    const lat = center.lat + km / KM_PER_DEG_LAT;
    const { rows } = await pool.query(
      `INSERT INTO restaurants (operating_name, address, location)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)) RETURNING id`,
      [`ZZTEST ${run} ${tag}${i}`, `${i} Test Quay ${run}`, center.lng, lat]
    );
    ids.push(rows[0].id);
    createdRestaurants.push(rows[0].id);
  }
  return ids;
}

const search = (token, center, extra = {}) =>
  call("POST", "/recommendations", {
    token,
    body: {
      lat: center.lat,
      lng: center.lng,
      party_size: 2,
      date: plusDays(2),
      time: "19:00",
      session_id: sessionId,
      location_source: "map_pick",
      ...extra,
    },
  });

async function recommend(token, center, extra) {
  const res = await search(token, center, extra);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  createdRecommendations.push(res.body.recommendationId);
  return res.body;
}

const eventsFor = async (recommendationId) =>
  (await pool.query("SELECT * FROM events WHERE recommendation_id = $1 ORDER BY received_at, event_name", [recommendationId])).rows;

let batchA; // restaurant ids at CENTER_A, ascending by distance (tie pair at index 3,4)
let batchB;

before(async () => {
  assertJwtSecret();
  assertEventKey();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  alice = await signUp("alice");
  bob = await signUp("bob");
  batchA = await makeRestaurants(CENTER_A, [0.1, 0.3, 0.5, 0.9, 0.9, 1.5, 1.9], "A");
  batchB = await makeRestaurants(CENTER_B, [0.2, 0.4, 1.0, 3.0, 4.5, 6.0], "B");
});

after(async () => {
  await pool.query("DELETE FROM events WHERE recommendation_id = ANY($1::uuid[])", [createdRecommendations]);
  await pool.query("DELETE FROM restaurants WHERE id = ANY($1::uuid[])", [createdRestaurants]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`j${run}-%@example.test`]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("recommendations: nearest five first, with distance and the reason", async () => {
  const rec = await recommend(alice.token, CENTER_A);
  assert.equal(rec.rankedBy, "proximity");
  assert.equal(rec.rankingVersion, "v1-proximity");
  assert.equal(rec.radiusKm, 2);
  assert.equal(rec.items.length, 5);
  assert.deepEqual(rec.items.map((i) => i.rank), [1, 2, 3, 4, 5]);

  const expectedKm = [0.1, 0.3, 0.5, 0.9, 0.9];
  rec.items.forEach((item, i) => {
    assert.ok(Math.abs(item.distanceKm - expectedKm[i]) < 0.02, `item ${i}: ${item.distanceKm}`);
    assert.match(item.reason, /^\d+ m away \(straight line\)$/, "under a kilometre is shown in metres");
  });
  // The first three are unambiguous; the 0.9 km pair is a tie broken by id.
  assert.deepEqual(rec.items.slice(0, 3).map((i) => i.restaurant.id), batchA.slice(0, 3));
  const tied = [batchA[3], batchA[4]].sort();
  assert.deepEqual(rec.items.slice(3).map((i) => i.restaurant.id), tied);
  assert.match(rec.notice, /distance only/i);
  assert.match(rec.notice, /simulated/i);
});

test("recommendations: the shown event carries the spec fields and no precise location", async () => {
  const rec = await recommend(alice.token, CENTER_A);
  const [event] = (await eventsFor(rec.recommendationId)).filter((e) => e.event_name === "recommendation_shown");
  assert.ok(event);
  assert.equal(event.simulated, false);
  assert.equal(event.session_id, sessionId);
  assert.equal(event.restaurant_id, null);
  assert.equal(event.user_id, pseudonym(alice.id));
  assert.notEqual(event.user_id, alice.id);

  const p = event.payload;
  assert.deepEqual(p.restaurant_ids, rec.items.map((i) => i.restaurant.id));
  assert.equal(p.ranked_by, "proximity");
  assert.deepEqual(p.signals_used, ["proximity"]);
  assert.equal(p.ranking_version, "v1-proximity");
  assert.equal(p.location_source, "map_pick");
  assert.equal(p.party_size, 2);
  assert.deepEqual(p.items.map((i) => i.rank), [1, 2, 3, 4, 5]);
  // Only rank and a coarse band per restaurant: exact distances to restaurants with
  // known locations would let someone work the diner's position back out.
  assert.ok(p.items.every((i) => JSON.stringify(Object.keys(i).sort()) === '["distance_band","rank","restaurant_id"]'));
  assert.ok(p.items.every((i) => ["under_500m", "500m_to_1km", "1_to_2km", "over_2km"].includes(i.distance_band)));
  assert.ok(!JSON.stringify(event).includes("distance_km"), "no per-restaurant distances in stored events");

  const stored = JSON.stringify(event);
  assert.ok(!stored.includes(String(CENTER_A.lat)) && !stored.includes(String(CENTER_A.lng)), "coordinates must not be stored");
  assert.ok(!/"(lat|lng|latitude|longitude)"/.test(stored));
});

test("recommendations: widens once to 5 km when fewer than five are close", async () => {
  const rec = await recommend(alice.token, CENTER_B);
  assert.equal(rec.radiusKm, 5);
  assert.deepEqual(rec.items.map((i) => i.restaurant.id), batchB.slice(0, 5));
  assert.ok(!rec.items.some((i) => i.restaurant.id === batchB[5]), "the 6 km restaurant is out of range");
});

test("recommendations: an empty list is an honest empty list", async () => {
  const rec = await recommend(alice.token, CENTER_EMPTY);
  assert.deepEqual(rec.items, []);
});

test("recommendations: validates input and requires sign-in", async () => {
  assert.equal((await call("POST", "/recommendations", { body: {} })).status, 401);
  assert.equal((await search(alice.token, { lat: 45.5, lng: -73.5 })).status, 422, "outside Toronto");
  assert.equal((await search(alice.token, CENTER_A, { party_size: 0 })).status, 400);
  assert.equal((await search(alice.token, CENTER_A, { time: "7pm" })).status, 400);
  assert.equal((await search(alice.token, CENTER_A, { date: "2020-01-01" })).status, 400);
  assert.equal((await search(alice.token, CENTER_A, { session_id: "nope" })).status, 400);
  assert.equal((await search(alice.token, CENTER_A, { location_source: "gps" })).status, 400);
});

test("availability is labelled simulated and needs a real restaurant", async () => {
  const q = `party_size=2&date=${plusDays(2)}&time=19:00`;
  const res = await call("GET", `/restaurants/${batchA[0]}/availability?${q}`, { token: alice.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.simulated, true);
  assert.equal(res.body.source.simulated, true);
  assert.match(res.body.notice, /simulated/i);
  assert.ok(res.body.slots.length > 0);

  assert.equal((await call("GET", `/restaurants/${batchA[0]}/availability?${q}`)).status, 401);
  assert.equal((await call("GET", `/restaurants/${crypto.randomUUID()}/availability?${q}`, { token: alice.token })).status, 404);
  assert.equal((await call("GET", `/restaurants/not-a-uuid/availability?${q}`, { token: alice.token })).status, 400);
  assert.equal((await call("GET", `/restaurants/${batchA[0]}/availability?party_size=0&date=${plusDays(2)}`, { token: alice.token })).status, 400);
});

const opened = (rec, rank = 1, extra = {}) => ({
  event_id: crypto.randomUUID(),
  event_name: "restaurant_opened",
  occurred_at: new Date().toISOString(),
  session_id: sessionId,
  recommendation_id: rec.recommendationId,
  restaurant_id: rec.items[rank - 1].restaurant.id,
  rank,
  ...extra,
});

test("client events: recorded once, simulated flag decided by the server", async () => {
  const rec = await recommend(alice.token, CENTER_A);
  const open = opened(rec, 2);
  const intent = {
    event_id: crypto.randomUUID(),
    event_name: "reservation_intent",
    occurred_at: new Date().toISOString(),
    session_id: sessionId,
    recommendation_id: rec.recommendationId,
    restaurant_id: rec.items[1].restaurant.id,
    party_size: 2,
    requested_dining_time: rec.request.requestedDiningTime,
    simulated: false, // a client claiming "real" must be ignored
  };

  const first = await call("POST", "/events", { token: alice.token, body: { events: [open, intent] } });
  assert.equal(first.status, 202);
  assert.deepEqual(first.body, { received: 2, recorded: 2 });

  const replay = await call("POST", "/events", { token: alice.token, body: { events: [open, intent] } });
  assert.deepEqual(replay.body, { received: 2, recorded: 0 }, "same event_ids are ignored");

  const rows = await eventsFor(rec.recommendationId);
  const storedOpen = rows.find((e) => e.event_name === "restaurant_opened");
  const storedIntent = rows.find((e) => e.event_name === "reservation_intent");
  assert.equal(storedOpen.simulated, false);
  assert.equal(storedOpen.payload.rank, 2);
  assert.equal(storedIntent.simulated, true, "the provider is simulated, whatever the client says");
  assert.equal(storedIntent.payload.party_size, 2);
});

test("client events: rejects what the diner cannot honestly report", async () => {
  const rec = await recommend(alice.token, CENTER_A);
  const post = (event, token = alice.token) => call("POST", "/events", { token, body: { events: [event] } });

  assert.equal((await post({ ...opened(rec), event_name: "handoff_started" })).status, 400, "server-only event");
  assert.equal((await post({ ...opened(rec), event_name: "booking_outcome_received" })).status, 400);
  assert.equal((await post(opened(rec, 1, { rank: 3 }))).status, 400, "rank must match the list");
  assert.equal((await post(opened(rec, 1, { restaurant_id: batchB[0] }))).status, 403, "not in that recommendation");
  assert.equal((await post(opened(rec), bob.token)).status, 403, "someone else's recommendation");
  assert.equal((await post(opened(rec, 1, { recommendation_id: crypto.randomUUID() }))).status, 403);
  assert.equal((await post(opened(rec, 1, { occurred_at: "2999-01-01T00:00:00Z" }))).status, 400);
  assert.equal((await call("POST", "/events", { body: { events: [opened(rec)] } })).status, 401);
  assert.equal((await call("POST", "/events", { token: alice.token, body: { events: [] } })).status, 400);

  // One bad event rejects the whole batch: nothing is recorded.
  const good = opened(rec, 1);
  const res = await call("POST", "/events", { token: alice.token, body: { events: [good, opened(rec, 1, { rank: 5 })] } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /events\[1\]/);
  assert.equal((await eventsFor(rec.recommendationId)).filter((e) => e.event_id === good.event_id).length, 0);
});

async function slotFor(token, restaurantId, partySize = 2) {
  const res = await call("GET", `/restaurants/${restaurantId}/availability?party_size=${partySize}&date=${plusDays(2)}&time=19:00`, { token });
  assert.equal(res.status, 200);
  return res.body.slots[0];
}

const reserve = (token, rec, restaurantId, slot, extra = {}) =>
  call("POST", "/reservations", {
    token,
    body: {
      recommendation_id: rec.recommendationId,
      restaurant_id: restaurantId,
      session_id: sessionId,
      slot_token: slot.token,
      party_size: 2,
      idempotency_key: `idem-${crypto.randomUUID()}`,
      ...extra,
    },
  });

test("reservation: a demo hand-off is recorded as simulated and never as a booking", async () => {
  const rec = await recommend(alice.token, CENTER_A);
  const restaurantId = rec.items[0].restaurant.id;
  const slot = await slotFor(alice.token, restaurantId);
  const key = `idem-${crypto.randomUUID()}`;

  const res = await reserve(alice.token, rec, restaurantId, slot, { idempotency_key: key });
  assert.equal(res.status, 201);
  assert.equal(res.body.outcome, "confirmed");
  assert.equal(res.body.simulated, true);
  assert.equal(res.body.reservation.simulated, true);
  assert.match(res.body.notice, /No real reservation was made/);

  const rows = await eventsFor(rec.recommendationId);
  const handoff = rows.filter((e) => e.event_name === "handoff_started");
  const outcome = rows.filter((e) => e.event_name === "booking_outcome_received");
  assert.equal(handoff.length, 1);
  assert.equal(handoff[0].simulated, true);
  assert.equal(handoff[0].payload.destination_type, "demo");
  assert.equal(handoff[0].payload.provider_id, "mock");
  assert.equal(outcome.length, 1);
  assert.equal(outcome[0].simulated, true);
  assert.deepEqual(
    [outcome[0].payload.outcome, outcome[0].payload.provider_id, outcome[0].payload.covers],
    ["confirmed", "mock", 2]
  );

  // Replaying the same request books nothing new and records nothing new.
  const again = await reserve(alice.token, rec, restaurantId, slot, { idempotency_key: key });
  assert.equal(again.body.reservation.id, res.body.reservation.id);
  const after = await eventsFor(rec.recommendationId);
  assert.equal(after.filter((e) => e.event_name === "handoff_started").length, 1);
  assert.equal(after.filter((e) => e.event_name === "booking_outcome_received").length, 1);
});

test("reservation: a failed hand-off leaves the outcome unknown, with no invented confirmation", async () => {
  const rec = await recommend(alice.token, CENTER_A);
  const restaurantId = rec.items[2].restaurant.id;
  const slot = await slotFor(alice.token, restaurantId, 20);

  const first = await reserve(alice.token, rec, restaurantId, slot, { party_size: 20 });
  assert.equal(first.status, 201);
  const second = await reserve(alice.token, rec, restaurantId, slot, { party_size: 20 });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, "SLOT_UNAVAILABLE");

  const rows = await eventsFor(rec.recommendationId);
  assert.equal(rows.filter((e) => e.event_name === "handoff_started").length, 2, "both attempts were hand-offs");
  assert.equal(rows.filter((e) => e.event_name === "booking_outcome_received").length, 1, "only the real response is an outcome");
});

test("reservation: only for a recommendation and restaurant the diner was shown", async () => {
  const rec = await recommend(alice.token, CENTER_A);
  const slot = await slotFor(alice.token, batchA[0]);
  assert.equal((await reserve(bob.token, rec, rec.items[0].restaurant.id, slot)).status, 403, "someone else's recommendation");
  assert.equal((await reserve(alice.token, rec, batchB[0], slot)).status, 403, "restaurant not in the list");
  assert.equal((await reserve(alice.token, rec, rec.items[0].restaurant.id, { token: "garbage" })).status, 410);
  assert.equal((await call("POST", "/reservations", { body: {} })).status, 401);
  assert.equal((await reserve(alice.token, rec, rec.items[0].restaurant.id, slot, { idempotency_key: "x" })).status, 400);
});

test("funnel: counts journeys per stage and never counts a simulated confirmation as a booking", async () => {
  const j = await recommend(alice.token, CENTER_A); // full journey
  const k = await recommend(alice.token, CENTER_A); // shown only
  const restaurantId = j.items[0].restaurant.id;

  await call("POST", "/events", {
    token: alice.token,
    body: {
      events: [
        opened(j, 1),
        {
          event_id: crypto.randomUUID(),
          event_name: "reservation_intent",
          occurred_at: new Date().toISOString(),
          session_id: sessionId,
          recommendation_id: j.recommendationId,
          restaurant_id: restaurantId,
          party_size: 2,
          requested_dining_time: j.request.requestedDiningTime,
        },
      ],
    },
  });
  assert.equal((await reserve(alice.token, j, restaurantId, await slotFor(alice.token, restaurantId))).status, 201);

  const f = await funnel({ recommendationIds: [j.recommendationId, k.recommendationId] });
  const stage = Object.fromEntries(f.stages.map((s) => [s.stage, s]));
  assert.deepEqual([stage.shown.total, stage.shown.real, stage.shown.simulated], [2, 2, 0]);
  assert.deepEqual([stage.opened.total, stage.opened.real, stage.opened.simulated], [1, 1, 0]);
  assert.deepEqual([stage.intent.total, stage.intent.real, stage.intent.simulated], [1, 0, 1]);
  assert.deepEqual([stage.handoff.total, stage.handoff.real, stage.handoff.simulated], [1, 0, 1]);
  assert.deepEqual([stage.confirmed.total, stage.confirmed.real, stage.confirmed.simulated], [1, 0, 1]);

  const rate = Object.fromEntries(f.rates.map((r) => [r.name, r]));
  assert.equal(rate.opens_per_shown.value, 0.5);
  assert.equal(rate.opens_per_shown.includesSimulated, false);
  assert.equal(rate.intents_per_open.value, 1);
  assert.equal(rate.intents_per_open.includesSimulated, true);
  assert.equal(rate.handoffs_per_intent.value, 1);
  assert.equal(rate.confirmed_per_handoff.value, null, "no real hand-offs, so no real confirmation rate");
  assert.equal(f.confirmedBookingsReal, 0);
});

test("funnel: an empty selection reports zeros and null rates, not errors", async () => {
  const f = await funnel({ recommendationIds: [crypto.randomUUID()] });
  assert.ok(f.stages.every((s) => s.total === 0));
  assert.ok(f.rates.every((r) => r.value === null));
});

test("event pseudonyms use their own key, not the login secret", () => {
  const savedKey = process.env.EVENT_PSEUDONYM_KEY;
  const savedJwt = process.env.JWT_SECRET;
  try {
    const before = pseudonym("account-1");
    process.env.JWT_SECRET = "x".repeat(64); // rotating login secrets must not change identities
    assert.equal(pseudonym("account-1"), before);
    process.env.EVENT_PSEUDONYM_KEY = "y".repeat(64);
    assert.notEqual(pseudonym("account-1"), before, "a different key gives different pseudonyms");

    process.env.EVENT_PSEUDONYM_KEY = "short";
    assert.throws(assertEventKey, /EVENT_PSEUDONYM_KEY/);
    delete process.env.EVENT_PSEUDONYM_KEY;
    assert.throws(assertEventKey, /EVENT_PSEUDONYM_KEY/);
  } finally {
    process.env.EVENT_PSEUDONYM_KEY = savedKey;
    process.env.JWT_SECRET = savedJwt;
  }
});

test("cancelling: records a cancelled outcome, frees the slot, and is the diner's alone", async () => {
  const rec = await recommend(alice.token, CENTER_A);
  const restaurantId = rec.items[3].restaurant.id;
  const slot = await slotFor(alice.token, restaurantId, 20);
  const booked = await reserve(alice.token, rec, restaurantId, slot, { party_size: 20 });
  assert.equal(booked.status, 201);
  const reservationId = booked.body.reservation.id;

  const cancelPath = `/reservations/${reservationId}/cancel`;
  assert.equal((await call("POST", cancelPath, { token: bob.token })).status, 404, "someone else's reservation");
  assert.equal((await call("POST", cancelPath)).status, 401);
  assert.equal((await call("POST", "/reservations/not-a-real-id/cancel", { token: alice.token })).status, 404);

  const res = await call("POST", cancelPath, { token: alice.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.reservation.status, "cancelled");
  assert.match(res.body.notice, /simulated/i);

  const cancelled = (await eventsFor(rec.recommendationId)).filter(
    (e) => e.event_name === "booking_outcome_received" && e.payload.outcome === "cancelled"
  );
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].simulated, true);
  assert.equal(cancelled[0].payload.reservation_id, reservationId);
  assert.equal(cancelled[0].payload.covers, 20);

  // Cancelling again changes nothing and records nothing new.
  assert.equal((await call("POST", cancelPath, { token: alice.token })).status, 200);
  assert.equal(
    (await eventsFor(rec.recommendationId)).filter((e) => e.payload.outcome === "cancelled").length,
    1
  );

  // The freed slot can be booked again (it was full at party size 20).
  const fresh = await slotFor(alice.token, restaurantId, 20);
  assert.equal((await reserve(alice.token, rec, restaurantId, fresh, { party_size: 20 })).status, 201);

  // The funnel keeps confirmations gross and reports cancellations alongside.
  const f = await funnel({ recommendationIds: [rec.recommendationId] });
  assert.equal(f.cancellations.simulated, 1);
  assert.equal(f.cancellations.real, 0);
  assert.equal(f.stages.find((s) => s.stage === "confirmed").total, 1);
});

test("rate limits: a per-IP backstop covers every journey endpoint, even before sign-in, and says when to retry", async () => {
  process.env.TEST_RATE_LIMITS = "1";
  process.env.JOURNEY_IP_LIMIT = "5";
  try {
    const hit = (route) => fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const routes = ["/events", "/recommendations", "/reservations", "/events", "/recommendations"];
    for (const route of routes) assert.equal((await hit(route)).status, 401, "handled (unauthenticated) until the limit");

    const limited = await hit("/reservations"); // a different endpoint, same IP
    assert.equal(limited.status, 429);
    const retryAfter = Number(limited.headers.get("retry-after"));
    assert.ok(retryAfter > 0 && retryAfter <= 60, `Retry-After should be seconds, got ${limited.headers.get("retry-after")}`);
    assert.match((await limited.json()).error, /too many/i);
  } finally {
    delete process.env.TEST_RATE_LIMITS;
    delete process.env.JOURNEY_IP_LIMIT;
  }
});

test("rate limits: each journey endpoint is limited per diner", async () => {
  process.env.TEST_RATE_LIMITS = "1";
  try {
    const carol = await signUp("carol");
    const statuses = async (route, n, init = {}) => {
      const out = [];
      for (let i = 0; i < n; i++) out.push((await call("POST", route, { token: carol.token, body: {}, ...init })).status);
      return out;
    };

    const events = await statuses("/events", 61);
    assert.ok(events.slice(0, 60).every((s) => s === 400), "the first 60 are handled (and rejected as malformed)");
    assert.equal(events[60], 429);

    const reservations = await statuses("/reservations", 11);
    assert.equal(reservations[10], 429);
    assert.ok(reservations.slice(0, 10).every((s) => s === 400));

    // Limits are per diner: another account is unaffected.
    assert.equal((await call("POST", "/events", { token: alice.token, body: {} })).status, 400);
  } finally {
    delete process.env.TEST_RATE_LIMITS;
  }
});

test("request bodies are size-limited and malformed JSON gets a JSON error", async () => {
  const big = { events: [{ junk: "x".repeat(40 * 1024) }] };
  const res = await call("POST", "/events", { token: alice.token, body: big });
  assert.equal(res.status, 413);
  assert.match(res.body.error, /too large/i);

  const raw = await fetch(base + "/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${alice.token}` },
    body: "{not json",
  });
  assert.equal(raw.status, 400);
  assert.match((await raw.json()).error, /malformed/i);
});
