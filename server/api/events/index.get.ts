import { prisma } from "~~/server/utils/prisma";
import { monthRange } from "~~/server/utils/date";

// Optional ?month=YYYY-MM to scope the list (used by the attendance
// check-in screen to show "this month's events" instead of everything ever).
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const month = typeof query.month === "string" ? query.month : undefined;

  const where = month ? { date: monthRange(month) } : {};

  const events = await prisma.event.findMany({
    where,
    include: { _count: { select: { attendances: { where: { present: true } } } } },
    orderBy: { date: "desc" },
  });

  return events.map((e) => ({
    id: e.id,
    name: e.name,
    date: e.date,
    type: e.type,
    session: e.session,
    preacherName: e.preacherName,
    topic: e.topic,
    presentCount: e._count.attendances,
  }));
});
