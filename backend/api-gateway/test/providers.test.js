// Mock provider + registry tests. No database needed.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { createMockProvider, torontoInstant } = require("../src/providers/mockProvider");
const { ERROR_CODES } = require("../src/providers/reservationProvider");
const { registerProvider, getProvider, listProviders, resetProviders } = require("../src/providers");
const { runProviderContract, daysAhead, rejectsWith } = require("./reservationProvider.contract");

const KNOWN = "11111111-1111-1111-1111-111111111111";
const UNKNOWN = "99999999-9999-9999-9999-999999999999";
const isKnownRestaurant = (id) => id === KNOWN;

runProviderContract("mock provider", () => createMockProvider({ isKnownRestaurant }), {
  knownRestaurantId: KNOWN,
  unknownRestaurantId: UNKNOWN,
});

test("mock provider: everything it returns is marked simulated", async () => {
  const provider = createMockProvider({ isKnownRestaurant });
  const date = daysAhead(3);
  const [{ source, slots }] = await provider.getAvailability({ restaurantIds: [KNOWN], partySize: 2, date });
  assert.equal(source.simulated, true);
  const { reservation } = await provider.createReservation({
    restaurantId: KNOWN,
    slotToken: slots[0].token,
    partySize: 2,
    diner: { userId: "d" },
    idempotencyKey: "k",
  });
  assert.equal(reservation.simulated, true);
});

test("mock provider: capacity is consumed by bookings and freed by cancellation", async () => {
  const provider = createMockProvider({ isKnownRestaurant, slotCapacity: 4 });
  const date = daysAhead(3);
  const query = { restaurantIds: [KNOWN], partySize: 4, date };
  const [{ slots }] = await provider.getAvailability(query);
  const target = slots[0];
  const book = (key, token = target.token) =>
    provider.createReservation({
      restaurantId: KNOWN,
      slotToken: token,
      partySize: 4,
      diner: { userId: key },
      idempotencyKey: key,
    });

  const first = await book("a");
  // Same slot, now full: a second booking from the same (still valid) token fails...
  await assert.rejects(book("b"), rejectsWith(ERROR_CODES.SLOT_UNAVAILABLE));
  // ...and the slot disappears from availability for that party size.
  const [after] = await provider.getAvailability(query);
  assert.ok(!after.slots.some((s) => s.startsAt === target.startsAt));

  await provider.cancelReservation(first.reservation.id);
  const [freed] = await provider.getAvailability(query);
  assert.ok(freed.slots.some((s) => s.startsAt === target.startsAt));
  assert.equal((await book("b", freed.slots.find((s) => s.startsAt === target.startsAt).token)).outcome, "confirmed");
});

test("mock provider: slot tokens expire", async () => {
  let clock = Date.now();
  const provider = createMockProvider({ isKnownRestaurant, now: () => new Date(clock) });
  const [{ slots }] = await provider.getAvailability({ restaurantIds: [KNOWN], partySize: 2, date: daysAhead(3) });
  clock += 11 * 60 * 1000;
  await assert.rejects(
    provider.createReservation({
      restaurantId: KNOWN,
      slotToken: slots[0].token,
      partySize: 2,
      diner: { userId: "d" },
      idempotencyKey: "k",
    }),
    rejectsWith(ERROR_CODES.SLOT_EXPIRED)
  );
});

test("mock provider: slots already in the past are never offered", async () => {
  const provider = createMockProvider({ isKnownRestaurant, now: () => new Date("2030-06-15T22:00:00Z") }); // 18:00 Toronto
  const [{ slots }] = await provider.getAvailability({ restaurantIds: [KNOWN], partySize: 2, date: "2030-06-15" });
  assert.ok(slots.length > 0);
  assert.ok(slots.every((s) => Date.parse(s.startsAt) > Date.parse("2030-06-15T22:00:00Z")));
  assert.equal(slots[0].localTime, "18:30");
});

test("torontoInstant respects daylight saving time", () => {
  // 19:00 in July is EDT (UTC-4); in January it is EST (UTC-5).
  assert.equal(new Date(torontoInstant("2030-07-15", 19 * 60)).toISOString(), "2030-07-15T23:00:00.000Z");
  assert.equal(new Date(torontoInstant("2030-01-15", 19 * 60)).toISOString(), "2030-01-16T00:00:00.000Z");
});

test("registry: the first provider is the default, duplicates are rejected, bad shapes fail fast", () => {
  resetProviders();
  const mock = registerProvider(createMockProvider({ isKnownRestaurant }));
  assert.equal(getProvider(), mock);
  assert.equal(getProvider("mock"), mock);
  assert.deepEqual(listProviders().map((p) => p.id), ["mock"]);
  assert.throws(() => registerProvider(createMockProvider()), /already registered/);
  assert.throws(() => registerProvider({ id: "broken", displayName: "x", capabilities: {} }), /capabilities/);
  assert.throws(() => getProvider("nope"), /No reservation provider/);
  resetProviders();
  assert.throws(() => getProvider(), /No reservation provider/);
});
