import { firstTimersWithDates } from "~~/server/utils/firstTimers";
import { prisma } from "~~/server/utils/prisma";
import { monthRange } from "~~/server/utils/date";

// ?month=YYYY-MM, defaults to the current month.
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const month = typeof query.month === "string" && query.month
    ? query.month
    : new Date().toISOString().slice(0, 7);

  const range = monthRange(month);

  const [serviceEvents, bibleStudyEvents, firstTimerRows] = await Promise.all([
    prisma.event.findMany({
      where: { type: "SERVICE", date: range },
      include: { attendances: { where: { present: true }, include: { member: true } } },
    }),
    prisma.event.findMany({
      where: { type: "BIBLE_STUDY", date: range },
      include: { attendances: { where: { present: true }, include: { member: true } } },
    }),
    // First timers who first showed up this month.
    firstTimersWithDates().then((rows) => rows
      .filter((m) => m.firstSeen >= range.gte && m.firstSeen < range.lt)
      .sort((a, b) => b.firstSeen.getTime() - a.firstSeen.getTime())),
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
  // Who attended each Sunday, and which service(s) — for the Sunday "View" modal.
  type SundayAttendee = { id: string; first: string; last: string; category: string; isVisitor: boolean; guestType: string | null; morning: boolean; afternoon: boolean };
  const attendeesByDate: Record<string, Map<string, SundayAttendee>> = {};
  let totalAttended = 0;

  for (const e of serviceEvents) {
    const dateKey = e.date.toISOString().slice(0, 10);
    byDate[dateKey] ??= { morning: 0, afternoon: 0 };
    attendeesByDate[dateKey] ??= new Map();
    for (const a of e.attendances) {
      const who = attendeesByDate[dateKey].get(a.memberId) ?? {
        id: a.memberId, first: a.member.firstName, last: a.member.lastName, category: a.member.category,
        isVisitor: a.member.isVisitor, guestType: a.member.guestType, morning: false, afternoon: false,
      };
      if (e.session === "MORNING") who.morning = true;
      if (e.session === "AFTERNOON") who.afternoon = true;
      attendeesByDate[dateKey].set(a.memberId, who);
      totalAttended++;
      if (e.session) bySession[e.session]++;
      if (e.session === "MORNING") byDate[dateKey].morning++;
      if (e.session === "AFTERNOON") byDate[dateKey].afternoon++;
    }
  }

  // Afternoon check-ins by people who were also at that same Sunday's morning
  // service — so the Afternoon card can say how many came to both.
  const morningByDate: Record<string, Set<string>> = {};
  for (const e of serviceEvents) {
    if (e.session !== "MORNING") continue;
    const dateKey = e.date.toISOString().slice(0, 10);
    morningByDate[dateKey] ??= new Set();
    e.attendances.forEach((a) => morningByDate[dateKey].add(a.memberId));
  }
  let afternoonAlsoMorning = 0;
  for (const e of serviceEvents) {
    if (e.session !== "AFTERNOON") continue;
    const morning = morningByDate[e.date.toISOString().slice(0, 10)];
    if (morning) afternoonAlsoMorning += e.attendances.filter((a) => morning.has(a.memberId)).length;
  }

  const byWeek = Object.entries(byDate)
    .map(([date, v]) => ({
      date, morning: v.morning, afternoon: v.afternoon, total: v.morning + v.afternoon,
      attendees: [...(attendeesByDate[date]?.values() ?? [])]
        .sort((x, y) => x.last.localeCompare(y.last) || x.first.localeCompare(y.first)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const serviceCategoryStats = tallyByCategory(serviceEvents.flatMap((e) => e.attendances));
  const bibleStudyAttendances = bibleStudyEvents.flatMap((e) => e.attendances);
  const bibleStudyCategoryStats = tallyByCategory(bibleStudyAttendances);
  // Members (not Visitors or Bible Study-type people) among the check-ins.
  const memberCheckIns = bibleStudyAttendances.filter((a) => !a.member.isVisitor);
  const membersAttended = new Set(memberCheckIns.map((a) => a.memberId)).size;
  const nonMembersAttended = new Set(bibleStudyAttendances.filter((a) => a.member.isVisitor).map((a) => a.memberId)).size;
  // Non-members split by type: Bible Study-only people vs. Visitors.
  const bibleStudyOnlyAttended = new Set(bibleStudyAttendances
    .filter((a) => a.member.isVisitor && a.member.guestType === "BIBLE_STUDY").map((a) => a.memberId)).size;
  const visitorsAttended = nonMembersAttended - bibleStudyOnlyAttended;

  // How each first timer found the church: walk-in (e.g. saw a social media
  // post) or invited by someone. Neither ticked = not recorded.
  const firstTimers = firstTimerRows.map((m) => ({
    id: m.id,
    first: m.firstName,
    last: m.lastName,
    joinedAt: m.firstSeen,
    guestType: m.isVisitor ? (m.guestType === "BIBLE_STUDY" || m.guestType === "YOUTH_SERVICE" ? m.guestType : "VISITOR") : "MEMBER",
    source: m.isWalkIn ? "WALK_IN" : m.invitedByName ? "INVITED" : "UNKNOWN",
    invitedByName: m.invitedByName,
    walkInSource: m.isWalkIn ? m.walkInSource : null,
    // The gathering they first came to: their first check-in, or Bible Study
    // for a Bible Study-type person who hasn't been checked in yet.
    firstEventType: m.firstEventType ?? (m.isVisitor && m.guestType === "BIBLE_STUDY" ? "BIBLE_STUDY" : null),
    firstEventSession: m.firstEventSession,
  }));
  // Walk-ins by where they heard about Oaks (Facebook, Instagram, …).
  const walkInSources: Record<string, number> = {};
  for (const f of firstTimers) {
    if (f.source !== "WALK_IN") continue;
    const key = f.walkInSource || "Not recorded";
    walkInSources[key] = (walkInSources[key] ?? 0) + 1;
  }

  return {
    month,
    services: {
      eventCount: serviceEvents.length,
      totalAttended,
      bySession,
      afternoonAlsoMorning,
      byCategory: serviceCategoryStats.byCategory,
      byCategoryMembers: serviceCategoryStats.byCategoryMembers,
      byWeek,
    },
    bibleStudy: {
      sessionsConducted: bibleStudyEvents.length,
      totalAttended: bibleStudyAttendances.length,
      memberCheckIns: memberCheckIns.length,
      nonMemberCheckIns: bibleStudyAttendances.length - memberCheckIns.length,
      membersAttended,
      nonMembersAttended,
      bibleStudyOnlyAttended,
      visitorsAttended,
      byCategory: bibleStudyCategoryStats.byCategory,
      byCategoryMembers: bibleStudyCategoryStats.byCategoryMembers,
    },
    firstTimers: {
      total: firstTimers.length,
      walkIn: firstTimers.filter((f) => f.source === "WALK_IN").length,
      walkInSources,
      invited: firstTimers.filter((f) => f.source === "INVITED").length,
      unknown: firstTimers.filter((f) => f.source === "UNKNOWN").length,
      list: firstTimers,
    },
  };
});
