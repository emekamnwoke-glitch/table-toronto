const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const healthRouter = require("./routes/health");
const neighbourhoodsRouter = require("./routes/neighbourhoods");
const restaurantsRouter = require("./routes/restaurants");
const { router: authRouter } = require("./routes/auth");
const usersRouter = require("./routes/users");
const merchantRouter = require("./routes/merchant");
const journeyRouter = require("./routes/journey");
const { setupProviders } = require("./providers/setup");

setupProviders();

const app = express();

// The web app's origin(s), comma-separated; defaults to the Vite dev server.
const origins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: "32kb" }));
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

app.use("/health", healthRouter);
app.use("/api/v1/neighbourhoods", neighbourhoodsRouter);
app.use("/api/v1/restaurants", restaurantsRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/merchant", merchantRouter);
app.use("/api/v1", journeyRouter);

// Oversized or malformed JSON bodies get a JSON answer, not Express's HTML page.
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body too large" });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body" });
  return next(err);
});

module.exports = app;
