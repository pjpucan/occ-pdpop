import { timingSafeEqual } from "node:crypto";
import { computeEmpowerReport } from "~~/server/utils/empowerReport";

// Machine-readable Empower report for the Google Sheets sync
// (apps-script/EmpowerSync.gs). There's no login session here, so it's
// protected by a shared secret instead: the caller sends
// `Authorization: Bearer <REPORT_FEED_TOKEN>`. With no token configured the
// feed is switched off.
//
// ?month=YYYY-MM picks the month; it defaults to the previous month, since the
// sheet pulls on the 3rd, after the month has closed.
export default defineEventHandler(async (event) => {
  const expected = process.env.REPORT_FEED_TOKEN || "";
  if (!expected) {
    throw createError({ statusCode: 503, statusMessage: "Report feed is not configured." });
  }
  const header = getHeader(event, "authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const ok = given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) {
    throw createError({ statusCode: 401, statusMessage: "Invalid report feed token." });
  }

  const query = getQuery(event);
  let month = typeof query.month === "string" ? query.month : "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    const now = new Date();
    month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  }
  const pastorName = typeof query.pastorName === "string" ? query.pastorName : "";

  return computeEmpowerReport(month, pastorName);
});
