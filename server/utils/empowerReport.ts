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
  // Who is actually inside Total EPOP — the Running Total deducts from these.
  const epopIds = new Set<string>();
  for (const m of members) {
    const mapped = mapCategory(m.category);
    if (mapped) {
      counts[mapped]++;
      epopIds.add(m.id);
    } else unassigned++;
  }
  const totalEpop = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, totalEpop, unassigned, epopIds };
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

// Running Total = that week's Total EPOP minus every member in EPOP who was
// checked in to at least one Bible Study that week (each counted once, however
// many sessions they attended). Bible Study-type people and visitors aren't in
// EPOP, so there's nothing to deduct for them.
function bibleStudyDeduction(epopIds: Set<string>, bsAttendeeIds: Set<string>) {
  let n = 0;
  for (const id of bsAttendeeIds) if (epopIds.has(id)) n++;
  return n;
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
    if (pop) lastElapsedPopulation = { categories: pop.counts, totalEpop: pop.totalEpop, unassigned: pop.unassigned };
    periods.push({
      label: p.label,
      firstTimerAllOfficial: ft.allOfficial,
      runningTotal: pop ? pop.totalEpop - bibleStudyDeduction(pop.epopIds, bs.attendeeIds) : null,
      actualBSConducted: bs.conducted,
      firstTimerBS: ft.bibleStudy,
      attendees: bs.attendees,
      attendeeDeductions: bs.attendeeDeductions,
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
