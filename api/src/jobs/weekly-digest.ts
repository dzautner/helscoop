import { pool } from "../db";
import { sendWeeklyActivityDigests } from "../notifications";

sendWeeklyActivityDigests()
  .then((sent) => {
    console.log(`Weekly activity digests sent: ${sent}`);
  })
  .catch((err) => {
    console.error("Weekly activity digest failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
