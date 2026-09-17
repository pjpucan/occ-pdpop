// Turns "YYYY-MM" into a [gte, lt) range covering that whole month in UTC,
// for use directly as a Prisma `date` filter.
export function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { gte: start, lt: end };
}
