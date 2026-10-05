// In-memory ReservationProvider for development and demos (ADR-0016).
//
// Every result it produces is marked `simulated: true`. It exists to prove
// the interface is implementable and to let the UI be built before any real
// inventory is connected -- not to stand in for measured data. Slots are
// generated (17:00-21:30 every 30 minutes) with a fixed per-slot capacity,
// and bookings consume that capacity, so double-booking and cancellation
// behave realistically.
const crypto = require("node:crypto");
const { ERROR_CODES, ProviderError } = require("./reservationProvider");

const TZ = "America/Toronto";
const FIRST_SLOT_MINUTES = 17 * 60;
const LAST_SLOT_MINUTES = 21 * 60 + 30;
const SLOT_STEP_MINUTES = 30;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const NEAREST_SLOTS = 6;
const MAX_PARTY_SIZE = 20;

// Offset of America/Toronto from UTC at a given instant, in minutes.
function tzOffsetMinutes(utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

// The instant at which it is `date` `minutesOfDay` on a wall clock in Toronto.
function torontoInstant(date, minutesOfDay) {
  const [y, m, d] = date.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutesOfDay);
  let t = naive - tzOffsetMinutes(naive) * 60000;
  t = naive - tzOffsetMinutes(t) * 60000;
  return t;
}

const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function invalid(message) {
  return new ProviderError(ERROR_CODES.INVALID_REQUEST, message);
}

function parseDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw invalid("date must be YYYY-MM-DD");
  const [y, m, d] = date.split("-").map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw invalid("date is not a real calendar date");
  }
}

function parseAround(around) {
  if (around === undefined) return null;
  const match = typeof around === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.exec(around);
  if (!match) throw invalid("around must be HH:MM");
  return Number(match[1]) * 60 + Number(match[2]);
}

function checkPartySize(partySize) {
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > MAX_PARTY_SIZE) {
    throw invalid(`partySize must be an integer from 1 to ${MAX_PARTY_SIZE}`);
  }
}

/**
 * @param {Object} [options]
 * @param {number} [options.slotCapacity=20]            covers per slot
 * @param {(restaurantId: string) => boolean} [options.isKnownRestaurant]
 * @param {() => Date} [options.now]                    injectable clock for tests
 * @returns {import("./reservationProvider").ReservationProvider}
 */
function createMockProvider({ slotCapacity = 20, isKnownRestaurant = () => true, now = () => new Date() } = {}) {
  /** @type {Map<string, any>} */
  const reservations = new Map();
  /** @type {Map<string, any>} idempotency key (per diner) -> outcome */
  const outcomes = new Map();

  const source = () => ({ providerId: "mock", retrievedAt: now().toISOString(), simulated: true });

  const booked = (restaurantId, startsAt) =>
    [...reservations.values()]
      .filter((r) => r.restaurantId === restaurantId && r.startsAt === startsAt && r.status === "confirmed")
      .reduce((sum, r) => sum + r.partySize, 0);

  function requireKnown(restaurantId) {
    if (typeof restaurantId !== "string" || !isKnownRestaurant(restaurantId)) {
      throw new ProviderError(ERROR_CODES.UNKNOWN_RESTAURANT, `Unknown restaurant ${restaurantId}`);
    }
  }

  function makeToken(restaurantId, startsAt) {
    const expiresAt = new Date(now().getTime() + TOKEN_TTL_MS).toISOString();
    const body = Buffer.from(JSON.stringify({ r: restaurantId, s: startsAt, e: expiresAt })).toString("base64url");
    return { token: `mock.${body}`, expiresAt };
  }

  function readToken(token) {
    try {
      if (typeof token !== "string" || !token.startsWith("mock.")) throw new Error("not ours");
      const { r, s, e } = JSON.parse(Buffer.from(token.slice(5), "base64url").toString());
      if (!r || !s || !e) throw new Error("malformed");
      return { restaurantId: r, startsAt: s, expiresAt: e };
    } catch {
      throw new ProviderError(ERROR_CODES.SLOT_EXPIRED, "Slot token was not issued by this provider");
    }
  }

  return {
    id: "mock",
    displayName: "Simulated availability",
    simulated: true,
    capabilities: { liveAvailability: false, createReservation: true, cancelReservation: true },

    async getAvailability({ restaurantIds, partySize, date, around } = {}) {
      if (!Array.isArray(restaurantIds) || restaurantIds.length === 0) throw invalid("restaurantIds must be a non-empty array");
      checkPartySize(partySize);
      parseDate(date);
      const target = parseAround(around);
      restaurantIds.forEach(requireKnown);

      return restaurantIds.map((restaurantId) => {
        let slots = [];
        for (let m = FIRST_SLOT_MINUTES; m <= LAST_SLOT_MINUTES; m += SLOT_STEP_MINUTES) {
          const start = torontoInstant(date, m);
          const startsAt = new Date(start).toISOString();
          if (start <= now().getTime()) continue;
          if (slotCapacity - booked(restaurantId, startsAt) < partySize) continue;
          const { token, expiresAt } = makeToken(restaurantId, startsAt);
          slots.push({ startsAt, localTime: hhmm(m), token, expiresAt, _minutes: m });
        }
        if (target !== null) {
          slots.sort((a, b) => Math.abs(a._minutes - target) - Math.abs(b._minutes - target) || a._minutes - b._minutes);
          slots = slots.slice(0, NEAREST_SLOTS);
        }
        return {
          restaurantId,
          slots: slots.map(({ _minutes, ...slot }) => slot),
          source: source(),
        };
      });
    },

    async createReservation({ restaurantId, slotToken, partySize, diner, idempotencyKey } = {}) {
      if (typeof idempotencyKey !== "string" || !idempotencyKey) throw invalid("idempotencyKey is required");
      if (!diner || typeof diner.userId !== "string" || !diner.userId) throw invalid("diner.userId is required");
      checkPartySize(partySize);
      requireKnown(restaurantId);

      const idemKey = `${diner.userId}:${idempotencyKey}`;
      if (outcomes.has(idemKey)) return outcomes.get(idemKey);

      const slot = readToken(slotToken);
      if (slot.restaurantId !== restaurantId) {
        throw new ProviderError(ERROR_CODES.SLOT_EXPIRED, "Slot token is for a different restaurant");
      }
      if (now().getTime() >= Date.parse(slot.expiresAt)) {
        throw new ProviderError(ERROR_CODES.SLOT_EXPIRED, "Slot token has expired; fetch availability again");
      }
      if (slotCapacity - booked(restaurantId, slot.startsAt) < partySize) {
        throw new ProviderError(ERROR_CODES.SLOT_UNAVAILABLE, "That time is no longer available");
      }

      const reservation = {
        id: crypto.randomUUID(),
        providerId: "mock",
        restaurantId,
        userId: diner.userId,
        partySize,
        startsAt: slot.startsAt,
        status: "confirmed",
        createdAt: now().toISOString(),
        simulated: true,
      };
      reservations.set(reservation.id, reservation);
      const outcome = { outcome: "confirmed", reservation: { ...reservation } };
      outcomes.set(idemKey, outcome);
      return outcome;
    },

    async getReservation(reservationId) {
      const reservation = reservations.get(reservationId);
      if (!reservation) throw new ProviderError(ERROR_CODES.UNKNOWN_RESERVATION, `No reservation ${reservationId}`);
      return { ...reservation };
    },

    async cancelReservation(reservationId) {
      const reservation = reservations.get(reservationId);
      if (!reservation) throw new ProviderError(ERROR_CODES.UNKNOWN_RESERVATION, `No reservation ${reservationId}`);
      reservation.status = "cancelled";
      return { ...reservation };
    },
  };
}

module.exports = { createMockProvider, torontoInstant };
