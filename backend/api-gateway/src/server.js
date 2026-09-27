require("dotenv").config({ path: require("path").join(__dirname, "../../../.env") });

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const healthRouter = require("./routes/health");
const neighbourhoodsRouter = require("./routes/neighbourhoods");
const restaurantsRouter = require("./routes/restaurants");

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use("/health", healthRouter);
app.use("/api/v1/neighbourhoods", neighbourhoodsRouter);
app.use("/api/v1/restaurants", restaurantsRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`api-gateway listening on http://localhost:${PORT}`);
});
