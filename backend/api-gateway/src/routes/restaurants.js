const express = require("express");
const { pool } = require("../db");

const router = express.Router();

// GET /api/v1/restaurants -- basic discovery listing. Distance/ETA
// filtering (the 1.5km-radius, transit-aware check from the original
// design) belongs in the booking service once Valhalla (ADR-0012) is
// wired up; this is the plain listing this route starts from.
// ?limit= defaults to 100; the map view asks for the full set (capped).
router.get("/", async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 10000);
  try {
    const result = await pool.query(
      `SELECT r.id, r.operating_name, r.address, r.cuisine, r.price_level,
              r.accessible, n.area_name AS neighbourhood,
              ST_X(r.location) AS lng, ST_Y(r.location) AS lat
       FROM restaurants r
       LEFT JOIN neighbourhoods n ON n.id = r.neighbourhood_id
       ORDER BY r.operating_name
       LIMIT $1`,
      [limit]
    );
    res.json({ count: result.rowCount, restaurants: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
