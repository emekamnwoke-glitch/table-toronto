const express = require("express");
const { pool } = require("../db");

const router = express.Router();

// GET /api/v1/restaurants -- basic discovery listing. Distance/ETA
// filtering (the 1.5km-radius, transit-aware check from the original
// design) belongs in the booking service once Valhalla (ADR-0012) is
// wired up; this is the plain listing this route starts from.
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.operating_name, r.address, r.cuisine, r.price_level,
              r.accessible, n.area_name AS neighbourhood
       FROM restaurants r
       LEFT JOIN neighbourhoods n ON n.id = r.neighbourhood_id
       ORDER BY r.operating_name
       LIMIT 100`
    );
    res.json({ count: result.rowCount, restaurants: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
