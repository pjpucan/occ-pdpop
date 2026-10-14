import { prisma } from "~~/server/utils/prisma";

// A first timer belongs to the week/month they first showed up: the date of
// their earliest check-in, or the day they were added (joinedAt) if that's
// earlier or they haven't been checked in yet. People are often added to PDP
// a day or two after the gathering they first came to.
export async function firstTimersWithDates() {
  const rows = await prisma.member.findMany({
    where: { isFirstTimer: true },
    include: {
      attendances: {
        where: { present: true },
        select: { event: { select: { type: true, date: true } } },
        orderBy: { event: { date: "asc" } },
        take: 1,
      },
    },
  });
  return rows.map(({ attendances, ...m }) => {
    const first = attendances[0]?.event;
    const firstSeen = first && first.date < m.joinedAt ? first.date : m.joinedAt;
    return { ...m, firstSeen, firstEventType: first?.type ?? null };
  });
}
