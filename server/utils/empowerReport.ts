import { prisma } from "~~/server/utils/prisma";

// "Empower Global Statistical Report" — a standardized monthly report format
// this church submits upward to its network. Cut-off periods are fixed
// 7-day chunks from the 1st of the month (1-7, 8-14, 15-21, 22-28, 29-end),
// per the org's own template.
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
  let start = 1;
  while (start <= daysInMonth) {
    const end = Math.min(start + 6, daysInMonth);
    const startDate = new Date(Date.UTC(year, monthIndex, start, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, monthIndex, end, 23, 59, 59, 999));
    const monthAbbr = startDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    periods.push({
      start: startDate,
      end: endDate,
      label: `${monthAbbr} ${String(start).padStart(2, "0")} - ${String(end).padStart(2, "0")}`,
    });
    start = end + 1;
  }
  return periods;
}

// Cumulative population by report-column, as of `asOf` (end of day).
// `Member.joinedAt` defaults to "now" at row-creation time, so every
// bulk-imported pre-existing member shares one arbitrary seed timestamp —
// it's only a meaningful "date this person joined" for guests/first-timers
// added through the app's Guest workflow. So historical population is
// reconstructed as: everyone who *isn't* a first-timer tracked this month
// (the stable pre-existing base, regardless of their literal DB timestamp),
// plus first-timers actually added between the start of the report month
// and `asOf`. This is also how "Total EPOP" is derived — it's just the sum
// of these columns, not a separately-tracked figure.
async function populationAsOf(monthStart: Date, asOf: Date) {
  const members = await prisma.member.groupBy({
    by: ["category"],
    where: {
      OR: [
        { isFirstTimer: false },
        { joinedAt: { lt: monthStart } },
        { isFirstTimer: true, joinedAt: { gte: monthStart, lte: asOf } },
      ],
    },
    _count: { _all: true },
  });
  const counts: Record<string, number> = Object.fromEntries(CATEGORY_COLUMNS.map((c) => [c, 0]));
  let unassigned = 0;
  for (const row of members) {
    const mapped = mapCategory(row.category);
    if (mapped) counts[mapped] += row._count._all;
    else unassigned += row._count._all;
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
    include: { attendances: { where: { present: true } } },
  });
  const conducted = events.length;
  const attendeeIds = new Set<string>();
  events.forEach((e) => e.attendances.forEach((a) => attendeeIds.add(a.memberId)));
  return { conducted, attendees: attendeeIds.size };
}

export async function computeEmpowerReport(month: string, pastorName = "") {
  const [year, monthNum] = month.split("-").map(Number);
  const monthIndex = monthNum - 1;

  const periodsRaw = buildPeriods(year, monthIndex);
  const monthStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const prevMonthEnd = new Date(monthStart.getTime() - 1);
  const prevMonthLabel = prevMonthEnd.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

  const baseStats = await populationAsOf(monthStart, prevMonthEnd);
  const base = {
    label: `BASE: ${prevMonthLabel}`,
    firstTimerAllOfficial: null as number | null,
    runningTotal: baseStats.totalEpop,
    actualBSConducted: null as number | null,
    firstTimerBS: null as number | null,
    attendees: null as number | null,
    categories: baseStats.counts,
    totalEpop: baseStats.totalEpop,
    unassigned: baseStats.unassigned,
  };

  let runningTotal = base.totalEpop;
  const periods = [];
  for (const p of periodsRaw) {
    const [ft, bs, pop] = await Promise.all([
      firstTimerCounts(p.start, p.end),
      bibleStudyStats(p.start, p.end),
      populationAsOf(monthStart, p.end),
    ]);
    runningTotal += ft.allOfficial + ft.bibleStudy;
    periods.push({
      label: p.label,
      firstTimerAllOfficial: ft.allOfficial,
      runningTotal,
      actualBSConducted: bs.conducted,
      firstTimerBS: ft.bibleStudy,
      attendees: bs.attendees,
      categories: pop.counts,
      totalEpop: pop.totalEpop,
      unassigned: pop.unassigned,
    });
  }

  const last = periods[periods.length - 1] ?? base;
  const totals = {
    label: "TOTAL",
    firstTimerAllOfficial: periods.reduce((s, p) => s + p.firstTimerAllOfficial, 0),
    runningTotal: last.runningTotal,
    actualBSConducted: periods.reduce((s, p) => s + p.actualBSConducted, 0),
    firstTimerBS: periods.reduce((s, p) => s + p.firstTimerBS, 0),
    attendees: periods.reduce((s, p) => s + p.attendees, 0),
    categories: last.categories,
    totalEpop: last.totalEpop,
  };

  // `unassigned` is a point-in-time snapshot repeated on every row, not a
  // per-period event — take the current (latest) figure, not a sum.
  const unassignedTotal = last.unassigned;

  return { month, monthLabel, churchName: "Oaks Community Church", pastorName, base, periods, totals, unassignedTotal };
}

export type EmpowerReport = Awaited<ReturnType<typeof computeEmpowerReport>>;
