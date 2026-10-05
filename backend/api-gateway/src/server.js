require("dotenv").config({ path: require("path").join(__dirname, "../../../.env") });

const { assertJwtSecret } = require("./auth");
assertJwtSecret();

const app = require("./app");

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`api-gateway listening on http://localhost:${PORT}`);
});
