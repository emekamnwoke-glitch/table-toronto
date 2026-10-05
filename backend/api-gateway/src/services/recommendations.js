// First-slice recommendation: the nearest restaurants to where the diner is,
// and nothing else (ranking version v1-proximity). See
// docs/product/first-slice-diner-journey.md.
//
// - Straight-line (geodesic) distance, labelled as such. Not walking time.
// - Availability is not an input: it is shown later, labelled simulated.
// - The diner's coordinates are used for this query and then discarded;
//   only per-restaurant distances are stored in the event.
const crypto = require("node:crypto");
const { pool } = require("../db");
const { HttpError } = require("../httpError");
const { torontoInstant } = require("../providers/mockProvider");
const { deterministicId, insertEvents, pseudonym, isUuid } = require("./events");

const RANKING_VERSION = "v1-proximity";

// "850 m away" under a kilometre, "1.2 km away" beyond. Always said to be a straight line.
function describeDistance(km) {
  const text = km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(1)} km`;
  return `${text} away (straight line)`;
}
const LIMIT = 5;
const RADIUS_STEPS_M = [2000, 5000]; // widen once if fewer than LIMIT are found
// Rough bounds of the City of Toronto; a point outside them has no nearby data.
const BOUNDS = { minLat: 43.55, maxLat: 43.9, minLng: -79.65, maxLng: -79.1 };

function torontoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
}

function validate(input) {
  const bad = (msg) => new HttpError(400, msg);
  const { lat, lng, party_size: partySize, date, time, session_id: sessionId, location_source: source } = input ?? {};
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw bad("lat and lng must be numbers");
  }
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) {
    throw new HttpError(422, "That location is outside the City of Toronto");
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) throw bad("party_size must be an integer from 1 to 20");
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw bad("date must be YYYY-MM-DD");
  }
  const today = torontoToday();
  const limit = new Date(Date.parse(today) + 14 * 86400000).toISOString().slice(0, 10);
  if (date < today || date > limit) throw bad("date must be today or within the next 14 days");
  const match = typeof time === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw bad("time must be HH:MM");
  if (!isUuid(sessionId)) throw bad("session_id must be a uuid");
  if (!["device", "map_pick"].includes(source)) throw bad("location_source must be device or map_pick");
  return { lat, lng, partySize, date, time, minutes: Number(match[1]) * 60 + Number(match[2]), sessionId, source };
}

async function nearest(lat, lng, db) {
  let rows = [];
  let radiusM = RADIUS_STEPS_M[0];
  for (radiusM of RADIUS_STEPS_M) {
    ({ rows } = await db.query(
      `SELECT r.id, r.operating_name AS name, r.address, n.area_name AS neighbourhood,
              ST_X(r.location) AS lng, ST_Y(r.location) AS lat,
              ST_Distance(r.location::geography, p.g) AS meters
       FROM restaurants r
       CROSS JOIN (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS g) p
       LEFT JOIN neighbourhoods n ON n.id = r.neighbourhood_id
       WHERE ST_DWithin(r.location::geography, p.g, $3)
       ORDER BY meters, r.id
       LIMIT ${LIMIT}`,
      [lng, lat, radiusM]
    ));
    if (rows.length >= LIMIT) break;
  }
  return { rows, radiusKm: radiusM / 1000 };
}

/**
 * Ranks nearby restaurants for a diner and records recommendation_shown.
 * Returns the response body for the client.
 */
async function recommend(authUserId, input, db = pool) {
  const q = validate(input);
  const { rows, radiusKm } = await nearest(q.lat, q.lng, db);

  const recommendationId = crypto.randomUUID();
  const requestedDiningTime = new Date(torontoInstant(q.date, q.minutes)).toISOString();
  const items = rows.map((r, i) => ({
    rank: i + 1,
    restaurant: { id: r.id, name: r.name, address: r.address, neighbourhood: r.neighbourhood, lng: r.lng, lat: r.lat },
    distanceKm: Math.round(r.meters / 10) / 100,
  }));

  await insertEvents(
    [
      {
        eventId: deterministicId("recommendation_shown", recommendationId),
        eventName: "recommendation_shown",
        occurredAt: new Date().toISOString(),
        sessionId: q.sessionId,
        recommendationId,
        userId: pseudonym(authUserId),
        simulated: false, // ranked by observed proximity; simulated availability is not an input
        restaurantId: null,
        payload: {
          restaurant_ids: items.map((i) => i.restaurant.id),
          ranked_by: "proximity",
          items: items.map((i) => ({ restaurant_id: i.restaurant.id, rank: i.rank, distance_km: i.distanceKm })),
          signals_used: ["proximity"],
          ranking_version: RANKING_VERSION,
          party_size: q.partySize,
          requested_dining_time: requestedDiningTime,
          location_source: q.source,
          radius_km: radiusKm,
        },
      },
    ],
    db
  );

  return {
    recommendationId,
    rankedBy: "proximity",
    rankingVersion: RANKING_VERSION,
    radiusKm,
    request: { partySize: q.partySize, date: q.date, time: q.time, requestedDiningTime },
    items: items.map((i) => ({ ...i, reason: describeDistance(i.distanceKm) })),
    notice:
      "Ranked by distance only, as a straight line. Availability is simulated and does not affect the order.",
  };
}

module.exports = { recommend, RANKING_VERSION, torontoToday };
