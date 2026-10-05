// Prints the first funnel. Usage: npm run funnel [-- --since 2026-10-01]
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "../../../.env") });

const { funnel } = require("../src/services/funnel");
const { pool } = require("../src/db");

async function main() {
  const i = process.argv.indexOf("--since");
  const since = i > -1 ? new Date(process.argv[i + 1]).toISOString() : undefined;
  const result = await funnel({ since });

  console.log(`\nFirst funnel${since ? ` since ${since}` : ""} (distinct recommendations per stage)\n`);
  console.log("stage".padEnd(12) + "total".padStart(7) + "real".padStart(7) + "simulated".padStart(11));
  for (const s of result.stages) {
    console.log(s.stage.padEnd(12) + String(s.total).padStart(7) + String(s.real).padStart(7) + String(s.simulated).padStart(11));
  }
  console.log("\nrates");
  for (const r of result.rates) {
    const value = r.value === null ? "n/a" : `${(r.value * 100).toFixed(1)}%`;
    const note = r.includesSimulated ? " (includes simulated steps)" : "";
    console.log(`  ${r.name.padEnd(24)} ${value.padStart(7)}  [${r.basis}]${note}`);
  }
  console.log(`\nconfirmed bookings (real): ${result.confirmedBookingsReal}  (gross: cancellations are counted separately)`);
  console.log(`cancellations: ${result.cancellations.total} (real ${result.cancellations.real}, simulated ${result.cancellations.simulated})`);
  if (result.confirmedBookingsReal === 0) {
    console.log("No real confirmations exist: simulated confirmations are never counted as bookings.");
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
