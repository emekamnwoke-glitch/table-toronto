const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../auth");

const router = express.Router();
router.use(requireAuth, requireRole("manager"));

// A manager only ever sees and edits the restaurant whose manager_user_id
// is their own id -- ownership is enforced in the queries, not just by role.
const SELECT = `
  SELECT r.id, r.operating_name, r.address, r.cuisine, r.price_level, r.accessible,
         r.seating_capacity, r.hold_window_minutes,
         ST_X(r.location) AS lng, ST_Y(r.location) AS lat,
         n.area_name AS neighbourhood
  FROM restaurants r
  LEFT JOIN neighbourhoods n ON n.id = r.neighbourhood_id
  WHERE r.manager_user_id = $1`;

function publicRestaurant(row) {
  return {
    id: row.id,
    name: row.operating_name,
    address: row.address,
    neighbourhood: row.neighbourhood,
    lng: row.lng,
    lat: row.lat,
    cuisine: row.cuisine,
    priceLevel: row.price_level,
    accessible: row.accessible,
    seatingCapacity: row.seating_capacity,
    holdWindowMinutes: row.hold_window_minutes,
  };
}

// GET /api/v1/merchant/restaurant
router.get("/restaurant", async (req, res) => {
  try {
    const result = await pool.query(SELECT, [req.auth.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "No restaurant is assigned to this account" });
    res.json({ restaurant: publicRestaurant(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// PATCH /api/v1/merchant/restaurant -- the details managers know and the
// licence data does not: cuisine, price, accessibility, capacity, hold window.
router.patch("/restaurant", async (req, res) => {
  const { cuisine, priceLevel, accessible, seatingCapacity, holdWindowMinutes } = req.body || {};
  const sets = [];
  const values = [];
  const add = (column, value) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (cuisine !== undefined) {
    const ok = cuisine === null || (typeof cuisine === "string" && cuisine.trim().length > 0 && cuisine.length <= 50);
    if (!ok) return res.status(400).json({ error: "cuisine must be a non-empty string (max 50) or null" });
    add("cuisine", cuisine === null ? null : cuisine.trim());
  }
  if (priceLevel !== undefined) {
    if (priceLevel !== null && !isInt(priceLevel, 1, 4)) return res.status(400).json({ error: "priceLevel must be 1-4 or null" });
    add("price_level", priceLevel);
  }
  if (accessible !== undefined) {
    if (typeof accessible !== "boolean") return res.status(400).json({ error: "accessible must be true or false" });
    add("accessible", accessible);
  }
  if (seatingCapacity !== undefined) {
    if (seatingCapacity !== null && !isInt(seatingCapacity, 1, 2000)) return res.status(400).json({ error: "seatingCapacity must be 1-2000 or null" });
    add("seating_capacity", seatingCapacity);
  }
  if (holdWindowMinutes !== undefined) {
    if (!isInt(holdWindowMinutes, 5, 120)) return res.status(400).json({ error: "holdWindowMinutes must be 5-120" });
    add("hold_window_minutes", holdWindowMinutes);
  }
  if (!sets.length) return res.status(400).json({ error: "No fields provided" });

  try {
    values.push(req.auth.id);
    const update = await pool.query(
      `UPDATE restaurants SET ${sets.join(", ")} WHERE manager_user_id = $${values.length}`,
      values
    );
    if (!update.rowCount) return res.status(404).json({ error: "No restaurant is assigned to this account" });
    const result = await pool.query(SELECT, [req.auth.id]);
    res.json({ restaurant: publicRestaurant(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
