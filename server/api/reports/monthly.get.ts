import { prisma } from "~~/server/utils/prisma";
import { monthRange } from "~~/server/utils/date";

// ?month=YYYY-MM, defaults to the current month.
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const month = typeof query.month === "string" && query.month
    ? query.month
    : new Date().toISOString().slice(0, 7);

  const range = monthRange(month);

  const [serviceEvents, bibleStudyEvents] = await Promise.all([
    prisma.event.findMany({
      where: { type: "SERVICE", date: range },
      include: { attendances: { where: { present: true }, include: { member: true } } },
    }),
    prisma.event.findMany({
      where: { type: "BIBLE_STUDY", date: range },
      include: { attendances: { where: { present: true } } },
    }),
  ]);

  const bySession = { MORNING: 0, AFTERNOON: 0 };
  const byCategory: Record<string, number> = {};
  const byDate: Record<string, { morning: number; afternoon: number }> = {};
  let totalAttended = 0;

  for (const e of serviceEvents) {
    const dateKey = e.date.toISOString().slice(0, 10);
    byDate[dateKey] ??= { morning: 0, afternoon: 0 };
    for (const a of e.attendances) {
      totalAttended++;
      if (e.session) bySession[e.session]++;
      if (e.session === "MORNING") byDate[dateKey].morning++;
      if (e.session === "AFTERNOON") byDate[dateKey].afternoon++;
      byCategory[a.member.category] = (byCategory[a.member.category] ?? 0) + 1;
    }
  }

  const byWeek = Object.entries(byDate)
    .map(([date, v]) => ({ date, morning: v.morning, afternoon: v.afternoon, total: v.morning + v.afternoon }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const bibleStudyAttendance = bibleStudyEvents.reduce((sum, e) => sum + e.attendances.length, 0);

  return {
    month,
    services: {
      eventCount: serviceEvents.length,
      totalAttended,
      bySession,
      byCategory,
      byWeek,
    },
    bibleStudy: {
      sessionsConducted: bibleStudyEvents.length,
      totalAttended: bibleStudyAttendance,
    },
  };
});
