// Behaviour events (docs/architecture/event-contract.md). Append-only.
//
// Rules this module enforces:
//   - `simulated` is derived here, never taken from a client.
//   - user ids are stored as a pseudonym, not the account id.
//   - clients may only report what the diner did (restaurant_opened,
//     reservation_intent), and only about a recommendation that was served to
//     them and a restaurant that was in it.
//   - no coordinates are ever stored.
const crypto = require("node:crypto");
const { pool } = require("../db");
const { HttpError } = require("../httpError");
const { getProvider } = require("../providers");

const CLIENT_EVENT_NAMES = ["restaurant_opened", "reservation_intent"];
const MAX_BATCH = 20;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isInstant = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v));

// Called at startup: the pseudonym key is its own secret (EVENT_PSEUDONYM_KEY),
// not derived from JWT_SECRET, so rotating login secrets does not break the
// continuity of stored events and one leak does not expose the other.
function assertEventKey() {
  const k = process.env.EVENT_PSEUDONYM_KEY;
  if (!k || k.length < 32) {
    throw new Error(
      "EVENT_PSEUDONYM_KEY must be set to a random string of at least 32 characters " +
        '(e.g. node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))")'
    );
  }
}

// One-way and stable per user while EVENT_PSEUDONYM_KEY is unchanged; the events
// table cannot be joined back to accounts without the key.
function pseudonym(userId) {
  assertEventKey();
  return crypto.createHmac("sha256", process.env.EVENT_PSEUDONYM_KEY).update(String(userId)).digest("hex").slice(0, 32);
}

// A uuid derived from its inputs, so a replayed request records the same
// event id and is ignored instead of recorded twice.
function deterministicId(...parts) {
  const h = crypto.createHash("sha256").update(parts.join("|")).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/**
 * @typedef {Object} EventRecord
 * @property {string} eventId
 * @property {string} eventName
 * @property {string} occurredAt   ISO instant
 * @property {string} sessionId
 * @property {string} recommendationId
 * @property {string} userId       pseudonym
 * @property {boolean} simulated
 * @property {string|null} restaurantId
 * @property {Object} payload
 */

/** Inserts events; duplicates (same event_id) are ignored. Returns how many were new. */
async function insertEvents(events, db = pool) {
  let inserted = 0;
  for (const e of events) {
    const result = await db.query(
      `INSERT INTO events (event_id, event_name, occurred_at, session_id, recommendation_id,
                           user_id, simulated, restaurant_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (event_id) DO NOTHING`,
      [e.eventId, e.eventName, e.occurredAt, e.sessionId, e.recommendationId, e.userId,
       e.simulated, e.restaurantId ?? null, JSON.stringify(e.payload ?? {})]
    );
    inserted += result.rowCount;
  }
  return inserted;
}

/** The recommendation_shown event for this diner, or null. */
async function findRecommendation(recommendationId, userPseudonym, db = pool) {
  if (!isUuid(recommendationId)) return null;
  const { rows } = await db.query(
    `SELECT payload, session_id FROM events
     WHERE event_name = 'recommendation_shown' AND recommendation_id = $1 AND user_id = $2`,
    [recommendationId, userPseudonym]
  );
  return rows[0] ?? null;
}

// Validates one client-reported event against the diner's recommendation.
// Returns an EventRecord, or throws HttpError(400/403).
async function buildClientEvent(raw, userPseudonym, db) {
  const bad = (msg) => new HttpError(400, msg);
  if (!raw || typeof raw !== "object") throw bad("event must be an object");
  if (!CLIENT_EVENT_NAMES.includes(raw.event_name)) {
    throw bad(`event_name must be one of: ${CLIENT_EVENT_NAMES.join(", ")}`);
  }
  if (!isUuid(raw.event_id)) throw bad("event_id must be a uuid");
  if (!isUuid(raw.session_id)) throw bad("session_id must be a uuid");
  if (!isUuid(raw.recommendation_id)) throw bad("recommendation_id must be a uuid");
  if (!isUuid(raw.restaurant_id)) throw bad("restaurant_id must be a uuid");
  if (!isInstant(raw.occurred_at)) throw bad("occurred_at must be an ISO 8601 timestamp");
  if (Date.parse(raw.occurred_at) > Date.now() + MAX_FUTURE_SKEW_MS) throw bad("occurred_at is in the future");

  const recommendation = await findRecommendation(raw.recommendation_id, userPseudonym, db);
  if (!recommendation) throw new HttpError(403, "Unknown recommendation");
  const ids = recommendation.payload.restaurant_ids;
  const position = ids.indexOf(raw.restaurant_id);
  if (position === -1) throw new HttpError(403, "Restaurant was not part of that recommendation");

  let payload;
  let simulated;
  if (raw.event_name === "restaurant_opened") {
    if (raw.rank !== position + 1) throw bad("rank does not match the recommendation");
    payload = { restaurant_id: raw.restaurant_id, rank: raw.rank };
    simulated = false; // a real action on a real, proximity-ranked list
  } else {
    if (!isInt(raw.party_size, 1, 20)) throw bad("party_size must be an integer from 1 to 20");
    if (!isInstant(raw.requested_dining_time)) throw bad("requested_dining_time must be an ISO 8601 timestamp");
    payload = {
      restaurant_id: raw.restaurant_id,
      party_size: raw.party_size,
      requested_dining_time: new Date(raw.requested_dining_time).toISOString(),
    };
    simulated = getProvider().simulated; // the intent is toward the provider's availability
  }

  return {
    eventId: raw.event_id,
    eventName: raw.event_name,
    occurredAt: new Date(raw.occurred_at).toISOString(),
    sessionId: raw.session_id,
    recommendationId: raw.recommendation_id,
    userId: userPseudonym,
    simulated,
    restaurantId: raw.restaurant_id,
    payload,
  };
}

/** Validates and records a client batch. All-or-nothing: one bad event rejects the batch. */
async function recordClientEvents(body, authUserId, db = pool) {
  const events = body?.events;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_BATCH) {
    throw new HttpError(400, `events must be an array of 1 to ${MAX_BATCH} events`);
  }
  const user = pseudonym(authUserId);
  const records = [];
  for (const [i, raw] of events.entries()) {
    try {
      records.push(await buildClientEvent(raw, user, db));
    } catch (err) {
      if (err instanceof HttpError) throw new HttpError(err.status, `events[${i}]: ${err.message}`);
      throw err;
    }
  }
  const recorded = await insertEvents(records, db);
  return { received: records.length, recorded };
}

module.exports = {
  assertEventKey,
  pseudonym,
  deterministicId,
  insertEvents,
  findRecommendation,
  recordClientEvents,
  isUuid,
  CLIENT_EVENT_NAMES,
};
