import { prisma } from "~~/server/utils/prisma";
import { inactiveCutoff, isInactive, serviceAttendeesBetween } from "~~/server/utils/activity";

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
//
// Guests (isVisitor) are never part of the population — they're still
// counted in the First Timer columns, just not in EPOP. Neither are members
// who were Inactive as of `asOf` (no Sunday service in the 3 months before
// it — see server/utils/activity.ts).
async function populationAsOf(monthStart: Date, asOf: Date) {
  const cutoff = inactiveCutoff(asOf);
  const [candidates, attended] = await Promise.all([
    prisma.member.findMany({
      where: {
        isVisitor: false,
        OR: [
          { isFirstTimer: false },
          { joinedAt: { lt: monthStart } },
          { isFirstTimer: true, joinedAt: { gte: monthStart, lte: asOf } },
        ],
      },
      select: { id: true, category: true, isVisitor: true, joinedAt: true, reactivatedAt: true },
    }),
    serviceAttendeesBetween(cutoff, asOf),
  ]);
  // Any service inside the window is enough to keep them active, so `asOf`
  // stands in for "their last service" when they attended one.
  const members = candidates.filter((m) => !isInactive(m, attended.has(m.id) ? asOf : undefined, cutoff, asOf));

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
    include: { attendances: { where: { present: true } } },
  });
  const conducted = events.length;
  const attendeeIds = new Set<string>();
  events.forEach((e) => e.attendances.forEach((a) => attendeeIds.add(a.memberId)));
  return { conducted, attendees: attendeeIds.size, attendeeIds };
}

// Members who attended BOTH a Sunday service (SERVICE event) and Bible Study
// in the same cut-off week — the Running Total formula treats this overlap
// as the only thing to deduct from that week's EPOP, since a Bible Study
// attendee who never made it to Sunday is still only counted once in EPOP.
async function bothActivitiesCount(start: Date, end: Date, bsAttendeeIds: Set<string>) {
  if (bsAttendeeIds.size === 0) return 0;
  const serviceAttendances = await prisma.attendance.findMany({
    where: { present: true, memberId: { in: [...bsAttendeeIds] }, event: { type: "SERVICE", date: { gte: start, lte: end } } },
    select: { memberId: true },
    distinct: ["memberId"],
  });
  return serviceAttendances.length;
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

  const baseStats = await populationAsOf(monthStart, prevMonthEnd);
  const base = {
    label: `BASE: ${prevMonthLabel}`,
    firstTimerAllOfficial: null as number | null,
    runningTotal: baseStats.totalEpop,
    actualBSConducted: null as number | null,
    firstTimerBS: null as number | null,
    attendees: null as number | null,
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
    const [ft, bs, pop] = await Promise.all([
      firstTimerCounts(p.start, p.end),
      bibleStudyStats(p.start, p.end),
      hasElapsed ? populationAsOf(monthStart, p.end) : Promise.resolve(null),
    ]);
    const bothCount = hasElapsed ? await bothActivitiesCount(p.start, p.end, bs.attendeeIds) : 0;
    if (pop) lastElapsedPopulation = { categories: pop.counts, totalEpop: pop.totalEpop, unassigned: pop.unassigned };
    periods.push({
      label: p.label,
      firstTimerAllOfficial: ft.allOfficial,
      runningTotal: pop ? pop.totalEpop - bothCount : null,
      actualBSConducted: bs.conducted,
      firstTimerBS: ft.bibleStudy,
      attendees: bs.attendees,
      categories: pop?.counts ?? null,
      totalEpop: pop?.totalEpop ?? null,
      unassigned: pop?.unassigned ?? null,
    });
  }

  const totals = {
    label: "TOTAL",
    firstTimerAllOfficial: periods.reduce((s, p) => s + p.firstTimerAllOfficial, 0),
    runningTotal: (periods[periods.length - 1] ?? base).runningTotal,
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
