const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const healthRouter = require("./routes/health");
const neighbourhoodsRouter = require("./routes/neighbourhoods");
const restaurantsRouter = require("./routes/restaurants");
const { router: authRouter } = require("./routes/auth");
const usersRouter = require("./routes/users");
const merchantRouter = require("./routes/merchant");

const app = express();

// The web app's origin(s), comma-separated; defaults to the Vite dev server.
const origins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim());
app.use(cors({ origin: origins }));
app.use(express.json());
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

app.use("/health", healthRouter);
app.use("/api/v1/neighbourhoods", neighbourhoodsRouter);
app.use("/api/v1/restaurants", restaurantsRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/merchant", merchantRouter);

module.exports = app;
