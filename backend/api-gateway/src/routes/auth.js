const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { signToken } = require("../auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// bcrypt only looks at the first 72 bytes; reject longer passwords rather
// than silently truncating them.
const MAX_PASSWORD_BYTES = 72;

// Compared against when the email is unknown, so a miss costs the same as a
// wrong password and response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// Per ip: 20 attempts / 15 min across register + login (api-contract-v0).
// Disabled under test so the suite isn't throttled by itself.
router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    message: { error: "Too many attempts, try again later" },
  })
);

// Never send password_hash to the client; camelCase to match the API contract.
function publicUser(row) {
  return {
    id: row.id,
    role: row.role,
    email: row.email,
    displayName: row.display_name,
    cuisinePreferences: row.cuisine_preferences,
    budgetPreference: row.budget_preference,
    diningStyle: row.dining_style,
    accessibilityNeeds: row.accessibility_needs,
    onboarded: row.onboarded_at !== null,
  };
}

// POST /api/v1/auth/register -- creates a diner. Managers are not
// self-service: they are attached to a restaurant by an operator.
router.post("/register", async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_BYTES} bytes` });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES (lower($1), $2, $3) RETURNING *`,
      [email.trim(), hash, typeof displayName === "string" ? displayName.trim() || null : null]
    );
    const user = result.rows[0];
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email already registered" });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required" });
  }
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = lower($1)", [email.trim()]);
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    // Same message for unknown email and wrong password.
    if (!user || !ok) return res.status(401).json({ error: "Incorrect email or password" });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, publicUser };
