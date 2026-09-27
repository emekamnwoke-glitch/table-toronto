const express = require("express");
const { pool } = require("../db");

const router = express.Router();

// GET /api/v1/neighbourhoods -- the 158 zones restaurants and the
// mobility-proxy feature are joined against (ADR-0005). Geometry is
// returned as GeoJSON so a MapLibre client can render it directly.
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, area_name, area_short_code, ST_AsGeoJSON(geom)::json AS geometry
       FROM neighbourhoods
       ORDER BY area_name`
    );
    res.json({ count: result.rowCount, neighbourhoods: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
