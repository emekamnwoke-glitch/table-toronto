// Reservation hand-off for the first slice (ADR-0016). This is the
// orchestration layer: it checks that the diner is acting on a recommendation
// they were actually shown, calls the ReservationProvider port, and records
// the two server-side events:
//
//   handoff_started           when TABLE calls the provider on the diner's behalf
//   booking_outcome_received  only when the provider returns an outcome
//
// A failed or missing outcome leaves the outcome unknown: no confirmation is
// ever invented, and a simulated provider's confirmation is recorded with
// simulated = true so it can never count as a real booking.
//
// Not here yet: the ETA check against restaurant hold windows (needs Valhalla,
// ADR-0012) and table locking, which move into a future `direct` provider.
const { pool } = require("../db");
const { HttpError } = require("../httpError");
const { getProvider } = require("../providers");
const { deterministicId, findRecommendation, insertEvents, pseudonym, isUuid } = require("./events");

function validate(input) {
  const bad = (msg) => new HttpError(400, msg);
  const i = input ?? {};
  if (!isUuid(i.recommendation_id)) throw bad("recommendation_id must be a uuid");
  if (!isUuid(i.restaurant_id)) throw bad("restaurant_id must be a uuid");
  if (!isUuid(i.session_id)) throw bad("session_id must be a uuid");
  if (typeof i.slot_token !== "string" || !i.slot_token) throw bad("slot_token is required");
  if (!Number.isInteger(i.party_size) || i.party_size < 1 || i.party_size > 20) throw bad("party_size must be an integer from 1 to 20");
  if (typeof i.idempotency_key !== "string" || i.idempotency_key.length < 8 || i.idempotency_key.length > 100) {
    throw bad("idempotency_key must be a string of 8 to 100 characters");
  }
  return i;
}

/**
 * @param {{ id: string, displayName?: string|null }} diner
 * @param {Object} input  request body (snake_case)
 */
async function startReservation(diner, input, db = pool) {
  const i = validate(input);
  const user = pseudonym(diner.id);

  const recommendation = await findRecommendation(i.recommendation_id, user, db);
  if (!recommendation) throw new HttpError(403, "Unknown recommendation");
  if (!recommendation.payload.restaurant_ids.includes(i.restaurant_id)) {
    throw new HttpError(403, "Restaurant was not part of that recommendation");
  }

  const provider = getProvider();
  const base = {
    sessionId: i.session_id,
    recommendationId: i.recommendation_id,
    userId: user,
    simulated: provider.simulated,
    restaurantId: i.restaurant_id,
  };
  const key = [i.recommendation_id, i.restaurant_id, i.idempotency_key];

  // Recorded before the provider call: the hand-off happened even if it fails.
  await insertEvents(
    [
      {
        ...base,
        eventId: deterministicId("handoff_started", ...key),
        eventName: "handoff_started",
        occurredAt: new Date().toISOString(),
        payload: {
          restaurant_id: i.restaurant_id,
          destination_type: provider.simulated ? "demo" : "provider",
          provider_id: provider.id,
        },
      },
    ],
    db
  );

  const result = await provider.createReservation({
    restaurantId: i.restaurant_id,
    slotToken: i.slot_token,
    partySize: i.party_size,
    diner: { userId: diner.id, name: diner.displayName ?? undefined },
    idempotencyKey: i.idempotency_key,
  });

  if (result.outcome === "confirmed") {
    await insertEvents(
      [
        {
          ...base,
          eventId: deterministicId("booking_outcome_received", ...key),
          eventName: "booking_outcome_received",
          occurredAt: new Date().toISOString(),
          payload: {
            restaurant_id: i.restaurant_id,
            outcome: "confirmed",
            provider_id: provider.id,
            covers: result.reservation.partySize,
            reservation_id: result.reservation.id,
          },
        },
      ],
      db
    );
  }
  // A "redirect" outcome sends the diner elsewhere; we learn nothing, so no outcome event.

  return { ...result, simulated: provider.simulated, providerId: provider.id };
}

/**
 * Cancels a reservation the diner made, and records booking_outcome_received
 * with outcome "cancelled". Only the diner who made it can cancel it, and only
 * through the journey that produced it: the confirmed outcome event is how we
 * know which recommendation it belongs to. Anything else is a 404, so the
 * existence of other people's reservations is not revealed.
 */
async function cancelReservation(diner, reservationId, db = pool) {
  const notFound = new HttpError(404, "Reservation not found");
  if (typeof reservationId !== "string" || !reservationId) throw notFound;

  const user = pseudonym(diner.id);
  const { rows } = await db.query(
    `SELECT session_id, recommendation_id, restaurant_id, payload FROM events
     WHERE event_name = 'booking_outcome_received' AND user_id = $1
       AND payload->>'outcome' = 'confirmed' AND payload->>'reservation_id' = $2`,
    [user, reservationId]
  );
  const confirmed = rows[0];
  if (!confirmed) throw notFound;

  const provider = getProvider();
  // The provider-side owner must match too, checked before anything is cancelled.
  const existing = await provider.getReservation(reservationId);
  if (existing.userId !== diner.id) throw notFound;
  const reservation = await provider.cancelReservation(reservationId);

  await insertEvents(
    [
      {
        eventId: deterministicId("booking_outcome_received", "cancelled", reservationId),
        eventName: "booking_outcome_received",
        occurredAt: new Date().toISOString(),
        sessionId: confirmed.session_id,
        recommendationId: confirmed.recommendation_id,
        userId: user,
        simulated: provider.simulated,
        restaurantId: confirmed.restaurant_id,
        payload: {
          restaurant_id: confirmed.restaurant_id,
          outcome: "cancelled",
          provider_id: provider.id,
          covers: confirmed.payload.covers,
          reservation_id: reservationId,
        },
      },
    ],
    db
  );
  return { reservation, simulated: provider.simulated, providerId: provider.id };
}

module.exports = { startReservation, cancelReservation };
