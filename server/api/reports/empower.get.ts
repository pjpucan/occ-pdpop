import { computeEmpowerReport } from "~~/server/utils/empowerReport";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const month = typeof query.month === "string" && query.month
    ? query.month
    : new Date().toISOString().slice(0, 7);
  const pastorName = typeof query.pastorName === "string" ? query.pastorName : "";

  return computeEmpowerReport(month, pastorName);
});
