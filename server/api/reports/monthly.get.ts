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
      include: { attendances: { where: { present: true }, include: { member: true } } },
    }),
  ]);

  // Tally attendances by member category, the same way for services and
  // Bible study — each returns both the per-category count and the list of
  // members (with how many times each attended) behind a "View" button.
  function tallyByCategory(attendances: { member: { id: string; firstName: string; lastName: string; category: string } }[]) {
    const byCategory: Record<string, number> = {};
    const byCategoryMembers: Record<string, Map<string, { id: string; first: string; last: string; count: number }>> = {};
    for (const a of attendances) {
      byCategory[a.member.category] = (byCategory[a.member.category] ?? 0) + 1;
      byCategoryMembers[a.member.category] ??= new Map();
      const existing = byCategoryMembers[a.member.category].get(a.member.id);
      byCategoryMembers[a.member.category].set(a.member.id, {
        id: a.member.id,
        first: a.member.firstName,
        last: a.member.lastName,
        count: (existing?.count ?? 0) + 1,
      });
    }
    return {
      byCategory,
      byCategoryMembers: Object.fromEntries(
        Object.entries(byCategoryMembers).map(([category, members]) => [category, [...members.values()]])
      ),
    };
  }

  const bySession = { MORNING: 0, AFTERNOON: 0 };
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
    }
  }

  const byWeek = Object.entries(byDate)
    .map(([date, v]) => ({ date, morning: v.morning, afternoon: v.afternoon, total: v.morning + v.afternoon }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const serviceCategoryStats = tallyByCategory(serviceEvents.flatMap((e) => e.attendances));
  const bibleStudyAttendances = bibleStudyEvents.flatMap((e) => e.attendances);
  const bibleStudyCategoryStats = tallyByCategory(bibleStudyAttendances);

  return {
    month,
    services: {
      eventCount: serviceEvents.length,
      totalAttended,
      bySession,
      byCategory: serviceCategoryStats.byCategory,
      byCategoryMembers: serviceCategoryStats.byCategoryMembers,
      byWeek,
    },
    bibleStudy: {
      sessionsConducted: bibleStudyEvents.length,
      totalAttended: bibleStudyAttendances.length,
      byCategory: bibleStudyCategoryStats.byCategory,
      byCategoryMembers: bibleStudyCategoryStats.byCategoryMembers,
    },
  };
});
