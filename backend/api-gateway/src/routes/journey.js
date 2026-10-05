// The first-slice diner journey: recommendations, simulated availability,
// client behaviour events, and the reservation hand-off. Mounted at /api/v1.
const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { HttpError } = require("../httpError");
const { getProvider } = require("../providers");
const { ProviderError, ERROR_CODES } = require("../providers/reservationProvider");
const { recommend } = require("../services/recommendations");
const { recordClientEvents, isUuid } = require("../services/events");
const { startReservation, cancelReservation } = require("../services/booking");
const limits = require("../rateLimits");

const router = express.Router();

const PROVIDER_STATUS = {
  [ERROR_CODES.INVALID_REQUEST]: 400,
  [ERROR_CODES.UNKNOWN_RESTAURANT]: 404,
  [ERROR_CODES.UNKNOWN_RESERVATION]: 404,
  [ERROR_CODES.SLOT_UNAVAILABLE]: 409,
  [ERROR_CODES.SLOT_EXPIRED]: 410,
  [ERROR_CODES.NOT_SUPPORTED]: 501,
  [ERROR_CODES.RATE_LIMITED]: 429,
  [ERROR_CODES.PROVIDER_UNAVAILABLE]: 503,
};

// Maps known error types to responses; anything else is a 500.
function fail(res, err) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ProviderError) {
    return res.status(PROVIDER_STATUS[err.code] ?? 502).json({ error: err.message, code: err.code, retryable: err.retryable });
  }
  console.error(err);
  return res.status(500).json({ error: "Something went wrong" });
}

const handler = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/v1/recommendations -- nearest restaurants; records recommendation_shown.
router.post("/recommendations", limits.ip, requireAuth, limits.recommendations, handler(async (req, res) => {
  res.status(201).json(await recommend(req.auth.id, req.body));
}));

// GET /api/v1/restaurants/:id/availability?party_size=&date=&time=
// Slots from the reservation provider. Shown labelled simulated while the
// provider is; never part of the ranking.
router.get("/restaurants/:id/availability", limits.ip, requireAuth, limits.availability, handler(async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, "Invalid restaurant id");
  const exists = await pool.query("SELECT 1 FROM restaurants WHERE id = $1", [id]);
  if (!exists.rowCount) throw new HttpError(404, "Restaurant not found");

  const provider = getProvider();
  const [availability] = await provider.getAvailability({
    restaurantIds: [id],
    partySize: Number(req.query.party_size),
    date: req.query.date,
    around: req.query.time,
  });
  res.json({
    restaurantId: availability.restaurantId,
    slots: availability.slots,
    source: availability.source,
    simulated: provider.simulated,
    notice: provider.simulated ? "Simulated availability. Not a real restaurant's tables." : undefined,
  });
}));

// POST /api/v1/events -- restaurant_opened and reservation_intent only.
router.post("/events", limits.ip, requireAuth, limits.events, handler(async (req, res) => {
  res.status(202).json(await recordClientEvents(req.body, req.auth.id));
}));

// POST /api/v1/reservations -- hand off to the provider; records handoff_started
// and, only if an outcome comes back, booking_outcome_received.
router.post("/reservations", limits.ip, requireAuth, limits.reservations, handler(async (req, res) => {
  const user = await pool.query("SELECT id, display_name FROM users WHERE id = $1", [req.auth.id]);
  if (!user.rows[0]) throw new HttpError(401, "User no longer exists");
  const result = await startReservation({ id: req.auth.id, displayName: user.rows[0].display_name }, req.body);
  const body = { ...result };
  if (result.simulated) body.notice = "Demonstration. No real reservation was made.";
  res.status(201).json(body);
}));

// POST /api/v1/reservations/:id/cancel -- cancels the diner's own reservation and
// records booking_outcome_received with outcome "cancelled".
router.post("/reservations/:id/cancel", limits.ip, requireAuth, limits.reservations, handler(async (req, res) => {
  const result = await cancelReservation({ id: req.auth.id }, req.params.id);
  const body = { ...result };
  if (result.simulated) body.notice = "Demonstration. The simulated booking was cancelled.";
  res.json(body);
}));

module.exports = router;
