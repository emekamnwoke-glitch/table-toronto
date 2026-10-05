// Rate limits for the journey endpoints.
//
// Two layers. Per diner (keyed by account id, so many diners behind one
// address are not lumped together), and a per-IP backstop shared by all the
// journey endpoints, applied before authentication so an unauthenticated flood
// is limited too. Over-limit responses are 429 with a Retry-After header.
//
// These are starting values (per minute). Watch legitimate traffic and the
// 429s during a pilot and adjust. The in-memory store is correct for a single
// API process; with several instances, switch to a shared store (for example
// Redis) so every instance enforces the same limits.
const rateLimit = require("express-rate-limit");

const WINDOW_MS = 60 * 1000;

// Off under test unless a test opts in, so the suite is not throttled by itself.
const skipInTests = () => process.env.NODE_ENV === "test" && process.env.TEST_RATE_LIMITS !== "1";

const base = {
  windowMs: WINDOW_MS,
  standardHeaders: "draft-7", // RateLimit headers, and Retry-After on a 429
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: "Too many requests, slow down" },
};

function perDiner(limit) {
  return rateLimit({ ...base, limit, keyGenerator: (req) => req.auth.id });
}

module.exports = {
  // Backstop across all journey endpoints from one address. The limit is read on
  // every request so a test can lower it (JOURNEY_IP_LIMIT).
  ip: rateLimit({ ...base, limit: () => Number(process.env.JOURNEY_IP_LIMIT) || 120 }),
  recommendations: perDiner(30),
  availability: perDiner(60),
  events: perDiner(60),
  reservations: perDiner(10), // also covers cancellations
};
