const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { publicUser } = require("./auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/v1/users/me
router.get("/me", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.auth.id]);
    if (!result.rows[0]) return res.status(401).json({ error: "User no longer exists" });
    res.json({ user: publicUser(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string" && x.length <= 50);

// PATCH /api/v1/users/me/preferences -- partial update of the onboarding
// preferences. Accessibility needs are a hard constraint in offer matching.
// `onboarded: true` marks onboarding finished or skipped (one-way).
router.patch("/me/preferences", async (req, res) => {
  const { cuisinePreferences, budgetPreference, diningStyle, accessibilityNeeds, displayName, onboarded } =
    req.body || {};
  const sets = [];
  const values = [];
  const add = (column, value) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (cuisinePreferences !== undefined) {
    if (!isStringArray(cuisinePreferences)) return res.status(400).json({ error: "cuisinePreferences must be a string array" });
    add("cuisine_preferences", cuisinePreferences);
  }
  if (accessibilityNeeds !== undefined) {
    if (!isStringArray(accessibilityNeeds)) return res.status(400).json({ error: "accessibilityNeeds must be a string array" });
    add("accessibility_needs", accessibilityNeeds);
  }
  if (budgetPreference !== undefined) {
    if (budgetPreference !== null && !(Number.isInteger(budgetPreference) && budgetPreference >= 1 && budgetPreference <= 4)) {
      return res.status(400).json({ error: "budgetPreference must be 1-4 or null" });
    }
    add("budget_preference", budgetPreference);
  }
  if (diningStyle !== undefined) {
    if (diningStyle !== null && typeof diningStyle !== "string") return res.status(400).json({ error: "diningStyle must be a string or null" });
    add("dining_style", diningStyle);
  }
  if (displayName !== undefined) {
    if (typeof displayName !== "string") return res.status(400).json({ error: "displayName must be a string" });
    add("display_name", displayName.trim() || null);
  }
  if (onboarded !== undefined) {
    if (onboarded !== true) return res.status(400).json({ error: "onboarded can only be set to true" });
    sets.push("onboarded_at = COALESCE(onboarded_at, now())");
  }
  if (!sets.length) return res.status(400).json({ error: "No preference fields provided" });

  try {
    values.push(req.auth.id);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows[0]) return res.status(401).json({ error: "User no longer exists" });
    res.json({ user: publicUser(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
