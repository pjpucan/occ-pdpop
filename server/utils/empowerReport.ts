import { prisma } from "~~/server/utils/prisma";

// "Empower Global Statistical Report" — a standardized monthly report format
// this church submits upward to its network. Cut-off periods are Monday-
// Sunday weeks, per the org's own template — a period belongs to the month
// containing its Sunday, so the first week of a month can start in the
// previous month, and trailing days at month-end roll into next month's
// report instead of forming a short leftover period.
//
// Category mapping to the template's 8 population columns: SOLO -> "Solo
// Parent", YOUNG_COUPLES + COUPLES merged into "Couples" (the template only
// has one Couples column), UNASSIGNED is excluded from EPOP entirely and
// reported separately as a warning if any exist.
export const CATEGORY_COLUMNS = ["KIDS", "TWEENS", "YTH", "NXT", "SOLO", "SENIOR_ADULT", "COUPLES", "LEGACY"] as const;
export const CATEGORY_COLUMN_LABELS: Record<string, string> = {
  KIDS: "Kids (0-8)", TWEENS: "Tweens (9-12)", YTH: "YTH (13-22)", NXT: "NXT (23-39)",
  SOLO: "Solo Parent", SENIOR_ADULT: "Senior Adult (40-59)", COUPLES: "Couples", LEGACY: "Legacy (60+)",
};

function mapCategory(category: string): string | null {
  if (category === "YOUNG_COUPLES") return "COUPLES";
  if (category === "UNASSIGNED") return null;
  return category;
}

function buildPeriods(year: number, monthIndex: number) {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const periods: { start: Date; end: Date; label: string }[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, monthIndex, day));
    if (date.getUTCDay() !== 0) continue; // only Sundays — each one anchors a Mon-Sun period

    const endDate = new Date(Date.UTC(year, monthIndex, day, 23, 59, 59, 999));
    const startDate = new Date(Date.UTC(year, monthIndex, day - 6, 0, 0, 0, 0));

    const startMonthAbbr = startDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    const endMonthAbbr = endDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    const startDay = String(startDate.getUTCDate()).padStart(2, "0");
    const endDay = String(endDate.getUTCDate()).padStart(2, "0");
    const label = startMonthAbbr === endMonthAbbr
      ? `${endMonthAbbr} ${startDay} - ${endDay}`
      : `${startMonthAbbr} ${startDay} - ${endMonthAbbr} ${endDay}`;

    periods.push({ start: startDate, end: endDate, label });
  }
  return periods;
}

// EPOP by report-column, as of `asOf` (end of day), per the Empower
// guidelines: each cut-off's EPOP = the previous cut-off's EPOP + that
// cut-off's first timers (Weekly General and Bible Study). EPOP only grows —
// nobody is subtracted (e.g. for being Inactive).
//
// So EPOP as of a date = the pre-existing base roster + every first timer
// added up to that date:
//   - Base: Members (not Visitors / Bible Study-type) who aren't first timers.
//     `Member.joinedAt` for the bulk-imported roster is just the import time,
//     so the base counts regardless of its timestamp.
//   - First timers of ANY type (Member, Visitor or Bible Study), from the day
//     they were added (joinedAt).
// "Total EPOP" is just the sum of these columns.
async function populationAsOf(asOf: Date) {
  const members = await prisma.member.findMany({
    where: {
      OR: [
        { isVisitor: false, isFirstTimer: false },
        { isFirstTimer: true, joinedAt: { lte: asOf } },
      ],
    },
    select: { category: true },
  });

  const counts: Record<string, number> = Object.fromEntries(CATEGORY_COLUMNS.map((c) => [c, 0]));
  let unassigned = 0;
  for (const m of members) {
    const mapped = mapCategory(m.category);
    if (mapped) counts[mapped]++;
    else unassigned++;
  }
  const totalEpop = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, totalEpop, unassigned };
}

async function firstTimerCounts(start: Date, end: Date) {
  const [allOfficial, bibleStudy] = await Promise.all([
    prisma.member.count({
      where: { isFirstTimer: true, joinedAt: { gte: start, lte: end }, guestType: { not: "BIBLE_STUDY" } },
    }),
    prisma.member.count({
      where: { isFirstTimer: true, joinedAt: { gte: start, lte: end }, guestType: "BIBLE_STUDY" },
    }),
  ]);
  return { allOfficial, bibleStudy };
}

async function bibleStudyStats(start: Date, end: Date) {
  const events = await prisma.event.findMany({
    where: { type: "BIBLE_STUDY", date: { gte: start, lte: end } },
    include: { attendances: { where: { present: true }, include: { member: { select: { firstName: true, lastName: true } } } } },
  });
  const conducted = events.length;
  const checkIns = events.flatMap((e) => e.attendances.map((a) => ({
    memberId: a.memberId, role: a.role, name: `${a.member.firstName} ${a.member.lastName}`,
  })));
  // attendeeIds is the unique people, used for the Running Total deduction.
  const attendeeIds = new Set(checkIns.map((a) => a.memberId));
  return {
    conducted,
    attendees: weeklyBibleStudyAttendees(checkIns),
    attendeeDeductions: leaderDeductions(checkIns),
    attendeeIds,
  };
}

// Who the once-per-week rule took off the Attendees count, for the note under
// the report: each leader with more than one check-in that week, how many
// check-ins they had, and how many were removed.
export function leaderDeductions(checkIns: { memberId: string; role: string | null; name: string }[]) {
  const byLeader = new Map<string, { name: string; checkIns: number }>();
  const leaders = new Set(checkIns.filter((a) => a.role === "FACILITATOR" || a.role === "CO_FACILITATOR").map((a) => a.memberId));
  for (const a of checkIns) {
    if (!leaders.has(a.memberId)) continue;
    const v = byLeader.get(a.memberId) ?? { name: a.name, checkIns: 0 };
    v.checkIns++;
    byLeader.set(a.memberId, v);
  }
  return [...byLeader.values()]
    .filter((v) => v.checkIns > 1)
    .map((v) => ({ ...v, removed: v.checkIns - 1 }))
    .sort((a, b) => b.removed - a.removed || a.name.localeCompare(b.name));
}

// Attendees for one week: every check-in counts, so a regular attendee who
// came to 3 sessions counts 3 times — except anyone who facilitated or
// co-facilitated a session that week, who counts once for the whole week no
// matter how many sessions they led or attended. (Same rule as the Bible
// Study week totals on the Attendance page.)
export function weeklyBibleStudyAttendees(checkIns: { memberId: string; role: string | null }[]) {
  const leaders = new Set(checkIns.filter((a) => a.role === "FACILITATOR" || a.role === "CO_FACILITATOR").map((a) => a.memberId));
  return checkIns.filter((a) => !leaders.has(a.memberId)).length + leaders.size;
}

// Running Total (per the Empower guidelines): the combined attendance at the
// church's gatherings in that cut-off period — Sunday Worship, Midweek,
// Prayer Meeting, Prayer & Fasting, Kids service — i.e. every event that isn't
// a Bible Study. It's every check-in in the period: someone at both the
// morning and afternoon service counts twice, the same way the Attendance
// page adds them up.
async function serviceAttendance(start: Date, end: Date) {
  return prisma.attendance.count({
    where: { present: true, event: { type: { not: "BIBLE_STUDY" }, date: { gte: start, lte: end } } },
  });
}

export async function computeEmpowerReport(month: string, pastorName = "") {
  const [year, monthNum] = month.split("-").map(Number);
  const monthIndex = monthNum - 1;

  const periodsRaw = buildPeriods(year, monthIndex);
  const monthStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const prevMonthEnd = new Date(monthStart.getTime() - 1);
  const prevMonthLabel = prevMonthEnd.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

  const now = new Date();

  // BASE row = "previous month ending": the previous month's latest data —
  // EPOP as of month end, plus Running Total, Actual BS Conducted and BS
  // Attendees from its LAST cut-off period.
  const prevPeriods = buildPeriods(prevMonthEnd.getUTCFullYear(), prevMonthEnd.getUTCMonth());
  const prevLast = prevPeriods[prevPeriods.length - 1];
  const [baseStats, baseRunningTotal, baseBS] = await Promise.all([
    populationAsOf(prevMonthEnd),
    prevLast ? serviceAttendance(prevLast.start, prevLast.end) : Promise.resolve(null),
    prevLast ? bibleStudyStats(prevLast.start, prevLast.end) : Promise.resolve(null),
  ]);
  const base = {
    label: `BASE: ${prevMonthLabel}`,
    firstTimerAllOfficial: null as number | null,
    runningTotal: baseRunningTotal as number | null,
    actualBSConducted: (baseBS?.conducted ?? null) as number | null,
    firstTimerBS: null as number | null,
    attendees: (baseBS?.attendees ?? null) as number | null,
    categories: baseStats.counts as Record<string, number> | null,
    totalEpop: baseStats.totalEpop as number | null,
    unassigned: baseStats.unassigned as number | null,
  };

  // Population/EPOP columns are a live snapshot of the current roster, not
  // something attendance fills in — so a period whose Sunday hasn't arrived
  // yet would otherwise show today's roster as if it were already fact.
  // Only expose the snapshot once the period has actually elapsed; carry the
  // last *elapsed* snapshot forward for the TOTAL row.
  let lastElapsedPopulation = { categories: base.categories, totalEpop: base.totalEpop, unassigned: base.unassigned };

  const periods = [];
  for (const p of periodsRaw) {
    const hasElapsed = p.end <= now;
    const [ft, bs, runningTotal, pop] = await Promise.all([
      firstTimerCounts(p.start, p.end),
      bibleStudyStats(p.start, p.end),
      serviceAttendance(p.start, p.end),
      hasElapsed ? populationAsOf(p.end) : Promise.resolve(null),
    ]);
    if (pop) lastElapsedPopulation = { categories: pop.counts, totalEpop: pop.totalEpop, unassigned: pop.unassigned };
    periods.push({
      label: p.label,
      firstTimerAllOfficial: ft.allOfficial,
      // Counts what's been recorded so far, like the Bible Study columns.
      runningTotal,
      actualBSConducted: bs.conducted,
      firstTimerBS: ft.bibleStudy,
      attendees: bs.attendees,
      attendeeDeductions: bs.attendeeDeductions,
      categories: pop?.counts ?? null,
      totalEpop: pop?.totalEpop ?? null,
      unassigned: pop?.unassigned ?? null,
    });
  }

  // The month's latest Running Total: the most recent cut-off that has ended
  // (a week in progress would show a partial count).
  const elapsedPeriods = periods.filter((_, i) => periodsRaw[i].end <= now);
  const totals = {
    label: "TOTAL",
    firstTimerAllOfficial: periods.reduce((s, p) => s + p.firstTimerAllOfficial, 0),
    runningTotal: (elapsedPeriods[elapsedPeriods.length - 1] ?? base).runningTotal,
    actualBSConducted: periods.reduce((s, p) => s + p.actualBSConducted, 0),
    firstTimerBS: periods.reduce((s, p) => s + p.firstTimerBS, 0),
    attendees: periods.reduce((s, p) => s + p.attendees, 0),
    categories: lastElapsedPopulation.categories,
    totalEpop: lastElapsedPopulation.totalEpop,
  };

  // `unassigned` is a point-in-time snapshot repeated on every row, not a
  // per-period event — take the last elapsed figure, not a sum.
  const unassignedTotal = lastElapsedPopulation.unassigned;

  return { month, monthLabel, churchName: "Oaks Community Church", pastorName, base, periods, totals, unassignedTotal };
}

export type EmpowerReport = Awaited<ReturnType<typeof computeEmpowerReport>>;
