// Per-diner rate limits for the journey endpoints. Used after requireAuth, so
// the key is the account id, not an IP address (many diners share one).
const rateLimit = require("express-rate-limit");

function perDiner(limit, windowMs = 60 * 1000) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => req.auth.id,
    // Off under test unless a test opts in, so the suite is not throttled by itself.
    skip: () => process.env.NODE_ENV === "test" && process.env.TEST_RATE_LIMITS !== "1",
    message: { error: "Too many requests, slow down" },
  });
}

// Per minute, per diner. Generous for a person, tight for a script.
module.exports = {
  recommendations: perDiner(30),
  availability: perDiner(60),
  events: perDiner(60),
  reservations: perDiner(10),
};
