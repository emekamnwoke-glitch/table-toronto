// Behavioural contract for any ReservationProvider (ADR-0016). Not a test
// file itself (no .test.js suffix): each implementation calls
// runProviderContract() from its own test file, so the same expectations
// apply to the mock, the direct provider and any third-party adapter.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { assertReservationProvider, ERROR_CODES, ProviderError } = require("../src/providers/reservationProvider");

const daysAhead = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const rejectsWith = (code) => (err) => {
  assert.ok(err instanceof ProviderError, `expected ProviderError, got ${err}`);
  assert.equal(err.code, code);
  return true;
};

/**
 * @param {string} label
 * @param {() => import("../src/providers/reservationProvider").ReservationProvider} makeProvider
 *   Must return a fresh provider each call.
 * @param {{ knownRestaurantId: string, unknownRestaurantId: string }} ids
 */
function runProviderContract(label, makeProvider, { knownRestaurantId, unknownRestaurantId }) {
  const date = daysAhead(3);
  const diner = { userId: "diner-1", name: "Test Diner" };
  const query = (extra = {}) => ({ restaurantIds: [knownRestaurantId], partySize: 2, date, ...extra });

  async function firstSlot(provider, partySize = 2) {
    const [result] = await provider.getAvailability(query({ partySize }));
    assert.ok(result.slots.length > 0, "expected at least one bookable slot");
    return result.slots[0];
  }

  test(`${label}: implements the interface`, () => {
    assertReservationProvider(makeProvider());
  });

  test(`${label}: availability has one entry per restaurant, in order, with provenance`, async () => {
    const provider = makeProvider();
    const results = await provider.getAvailability(
      query({ restaurantIds: [knownRestaurantId, knownRestaurantId] })
    );
    assert.equal(results.length, 2);
    for (const r of results) {
      assert.equal(r.restaurantId, knownRestaurantId);
      assert.equal(r.source.providerId, provider.id);
      assert.equal(typeof r.source.simulated, "boolean");
      assert.ok(!Number.isNaN(Date.parse(r.source.retrievedAt)));
      for (const slot of r.slots) {
        assert.ok(!Number.isNaN(Date.parse(slot.startsAt)));
        assert.match(slot.localTime, /^\d{2}:\d{2}$/);
        assert.equal(typeof slot.token, "string");
        assert.ok(Date.parse(slot.expiresAt) > Date.now());
      }
    }
  });

  test(`${label}: availability honours "around" by returning the nearest slots first`, async () => {
    const [result] = await makeProvider().getAvailability(query({ around: "19:00" }));
    const minutes = result.slots.map((s) => Number(s.localTime.slice(0, 2)) * 60 + Number(s.localTime.slice(3)));
    const distances = minutes.map((m) => Math.abs(m - 19 * 60));
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
  });

  test(`${label}: rejects bad availability requests`, async () => {
    const provider = makeProvider();
    await assert.rejects(provider.getAvailability(query({ partySize: 0 })), rejectsWith(ERROR_CODES.INVALID_REQUEST));
    await assert.rejects(provider.getAvailability(query({ partySize: 2.5 })), rejectsWith(ERROR_CODES.INVALID_REQUEST));
    await assert.rejects(provider.getAvailability(query({ date: "2026-02-30" })), rejectsWith(ERROR_CODES.INVALID_REQUEST));
    await assert.rejects(provider.getAvailability(query({ around: "7pm" })), rejectsWith(ERROR_CODES.INVALID_REQUEST));
    await assert.rejects(provider.getAvailability(query({ restaurantIds: [] })), rejectsWith(ERROR_CODES.INVALID_REQUEST));
    await assert.rejects(
      provider.getAvailability(query({ restaurantIds: [unknownRestaurantId] })),
      rejectsWith(ERROR_CODES.UNKNOWN_RESTAURANT)
    );
  });

  test(`${label}: a slot can be booked, read back and cancelled`, async () => {
    const provider = makeProvider();
    const slot = await firstSlot(provider);
    const outcome = await provider.createReservation({
      restaurantId: knownRestaurantId,
      slotToken: slot.token,
      partySize: 2,
      diner,
      idempotencyKey: "key-1",
    });
    assert.equal(outcome.outcome, "confirmed");
    const { reservation } = outcome;
    assert.equal(reservation.status, "confirmed");
    assert.equal(reservation.restaurantId, knownRestaurantId);
    assert.equal(reservation.userId, diner.userId);
    assert.equal(reservation.partySize, 2);
    assert.equal(reservation.startsAt, slot.startsAt);
    assert.equal(reservation.providerId, provider.id);

    assert.deepEqual(await provider.getReservation(reservation.id), reservation);

    const cancelled = await provider.cancelReservation(reservation.id);
    assert.equal(cancelled.status, "cancelled");
    assert.equal((await provider.cancelReservation(reservation.id)).status, "cancelled", "cancel is idempotent");
    assert.equal((await provider.getReservation(reservation.id)).status, "cancelled");
  });

  test(`${label}: repeating an idempotency key does not book twice`, async () => {
    const provider = makeProvider();
    const slot = await firstSlot(provider);
    const request = {
      restaurantId: knownRestaurantId,
      slotToken: slot.token,
      partySize: 2,
      diner,
      idempotencyKey: "same-key",
    };
    const first = await provider.createReservation(request);
    const second = await provider.createReservation(request);
    assert.equal(second.reservation.id, first.reservation.id);
  });

  test(`${label}: validates reservation requests`, async () => {
    const provider = makeProvider();
    const slot = await firstSlot(provider);
    const ok = { restaurantId: knownRestaurantId, slotToken: slot.token, partySize: 2, diner, idempotencyKey: "k" };
    await assert.rejects(provider.createReservation({ ...ok, idempotencyKey: undefined }), rejectsWith(ERROR_CODES.INVALID_REQUEST));
    await assert.rejects(provider.createReservation({ ...ok, partySize: 0 }), rejectsWith(ERROR_CODES.INVALID_REQUEST));
    await assert.rejects(provider.createReservation({ ...ok, diner: {} }), rejectsWith(ERROR_CODES.INVALID_REQUEST));
    await assert.rejects(
      provider.createReservation({ ...ok, restaurantId: unknownRestaurantId }),
      rejectsWith(ERROR_CODES.UNKNOWN_RESTAURANT)
    );
    await assert.rejects(provider.createReservation({ ...ok, slotToken: "garbage" }), rejectsWith(ERROR_CODES.SLOT_EXPIRED));
  });

  test(`${label}: unknown reservations are reported, not invented`, async () => {
    const provider = makeProvider();
    await assert.rejects(provider.getReservation("nope"), rejectsWith(ERROR_CODES.UNKNOWN_RESERVATION));
    await assert.rejects(provider.cancelReservation("nope"), rejectsWith(ERROR_CODES.UNKNOWN_RESERVATION));
  });
}

module.exports = { runProviderContract, daysAhead, rejectsWith };
