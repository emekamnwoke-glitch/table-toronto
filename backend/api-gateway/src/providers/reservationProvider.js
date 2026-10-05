// The reservation port (ADR-0016). Everything that books, or hands a diner
// off to book, goes through a ReservationProvider; route handlers and the
// recommendation code never talk to a concrete booking system directly.
//
// Implementations live beside this file:
//   mockProvider.js   in-memory, deterministic, always `simulated: true`
//   (later) direct    our own restaurant_tables inventory + hold window
//   (later) a third-party adapter, only via that party's approved partner
//           API -- never by scraping
//
// A provider is a plain object with the metadata and methods below.
// `assertReservationProvider` checks that shape; test/reservationProvider
// .contract.js is the behavioural contract every implementation must pass.

/**
 * @typedef {Object} ProviderCapabilities
 * @property {boolean} liveAvailability  getAvailability reflects real, current inventory
 * @property {boolean} createReservation Can confirm a booking in-app. If false,
 *   createReservation must either return a `redirect` outcome or throw NOT_SUPPORTED.
 * @property {boolean} cancelReservation Can cancel a booking it created.
 */

/**
 * @typedef {Object} Source
 * @property {string} providerId
 * @property {string} retrievedAt  ISO 8601 instant
 * @property {boolean} simulated   True for any data that is not a real
 *   restaurant's real inventory. Analytics must exclude simulated data from
 *   anything presented as measured.
 */

/**
 * @typedef {Object} Slot
 * @property {string} startsAt   ISO 8601 instant
 * @property {string} localTime  "HH:MM" in America/Toronto, for display
 * @property {string} token      Opaque; pass back to createReservation unchanged
 * @property {string} expiresAt  ISO 8601 instant after which `token` is rejected
 */

/**
 * @typedef {Object} RestaurantAvailability
 * @property {string} restaurantId  TABLE's restaurant id (uuid), never a provider's
 * @property {Slot[]} slots         Empty when nothing is bookable; never invented
 * @property {Source} source
 */

/**
 * @typedef {Object} AvailabilityQuery
 * @property {string[]} restaurantIds
 * @property {number} partySize       Integer, 1-20
 * @property {string} date            "YYYY-MM-DD", America/Toronto
 * @property {string} [around]        "HH:MM" preferred time; slots are returned
 *   nearest-first within the provider's search window when given
 */

/**
 * @typedef {Object} ReservationRequest
 * @property {string} restaurantId
 * @property {string} slotToken
 * @property {number} partySize
 * @property {{ userId: string, name?: string, email?: string }} diner
 * @property {string} idempotencyKey  Required. Repeating a request with the same
 *   key returns the original outcome instead of booking twice.
 */

/**
 * @typedef {Object} Reservation
 * @property {string} id                     TABLE's id for this reservation
 * @property {string} providerId
 * @property {string} [providerReservationId]
 * @property {string} restaurantId
 * @property {string} userId
 * @property {number} partySize
 * @property {string} startsAt
 * @property {'confirmed'|'cancelled'} status
 * @property {string} createdAt
 * @property {boolean} simulated
 */

/**
 * @typedef {{ outcome: 'confirmed', reservation: Reservation }
 *         | { outcome: 'redirect', url: string }} ReservationOutcome
 * `redirect` is for providers that cannot book in-app (for example a
 * directory-only integration): the UI sends the diner to `url` to finish.
 */

/**
 * @typedef {Object} ReservationProvider
 * @property {string} id            Stable machine id, e.g. "mock", "direct"
 * @property {string} displayName
 * @property {ProviderCapabilities} capabilities
 * @property {(q: AvailabilityQuery) => Promise<RestaurantAvailability[]>} getAvailability
 *   One entry per requested restaurant, in request order.
 * @property {(r: ReservationRequest) => Promise<ReservationOutcome>} createReservation
 * @property {(reservationId: string) => Promise<Reservation>} getReservation
 * @property {(reservationId: string) => Promise<Reservation>} cancelReservation
 *   Idempotent: cancelling a cancelled reservation returns it unchanged.
 */

const ERROR_CODES = Object.freeze({
  INVALID_REQUEST: "INVALID_REQUEST", // bad party size, date, missing idempotency key...
  UNKNOWN_RESTAURANT: "UNKNOWN_RESTAURANT", // provider has no mapping for this restaurant
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE", // taken since availability was fetched
  SLOT_EXPIRED: "SLOT_EXPIRED", // token past expiresAt, or not one this provider issued
  UNKNOWN_RESERVATION: "UNKNOWN_RESERVATION",
  NOT_SUPPORTED: "NOT_SUPPORTED", // capability flag is false
  RATE_LIMITED: "RATE_LIMITED", // retryable
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE", // upstream down or timed out; retryable
});

// Every failure a provider reports is one of these, so callers can map
// codes to HTTP statuses and retry decisions without knowing the provider.
class ProviderError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = code === ERROR_CODES.RATE_LIMITED || code === ERROR_CODES.PROVIDER_UNAVAILABLE;
  }
}

const REQUIRED_METHODS = ["getAvailability", "createReservation", "getReservation", "cancelReservation"];
const REQUIRED_CAPABILITIES = ["liveAvailability", "createReservation", "cancelReservation"];

// Fails fast, at registration time, if an implementation is missing a
// method or capability flag. Returns the provider so it can be chained.
function assertReservationProvider(provider) {
  if (!provider || typeof provider !== "object") throw new TypeError("provider must be an object");
  if (typeof provider.id !== "string" || !provider.id) throw new TypeError("provider.id must be a non-empty string");
  if (typeof provider.displayName !== "string") throw new TypeError(`${provider.id}: displayName must be a string`);
  for (const flag of REQUIRED_CAPABILITIES) {
    if (typeof provider.capabilities?.[flag] !== "boolean") {
      throw new TypeError(`${provider.id}: capabilities.${flag} must be a boolean`);
    }
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof provider[method] !== "function") throw new TypeError(`${provider.id}: missing method ${method}()`);
  }
  return provider;
}

module.exports = { ERROR_CODES, ProviderError, assertReservationProvider, REQUIRED_METHODS };
