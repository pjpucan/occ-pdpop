import { prisma } from "~~/server/utils/prisma";

// A member is "Inactive" once they've gone 3 months without attending a
// single Sunday service. Nothing is deleted or stored as a status — it's
// worked out on every read, so attending a service again makes them active
// automatically. Guests are never flagged (Bible-study-only guests don't
// attend Sunday service by definition).
//
// The 3 months count from the latest of: their last service, when they were
// added (joinedAt), or when an admin last re-enabled them (reactivatedAt).
// Counting from joinedAt means a newly added person — or the bulk-imported
// roster, from before attendance was tracked — isn't flagged on day one.
export const INACTIVE_MONTHS = 3;

export function inactiveCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - INACTIVE_MONTHS);
  return cutoff;
}

// Latest Sunday service each member was marked present at.
export async function lastServiceDates() {
  const rows = await prisma.attendance.findMany({
    where: { present: true, event: { type: "SERVICE" } },
    select: { memberId: true, event: { select: { date: true } } },
  });
  const last = new Map<string, Date>();
  for (const r of rows) {
    const prev = last.get(r.memberId);
    if (!prev || r.event.date > prev) last.set(r.memberId, r.event.date);
  }
  return last;
}

// `asOf` lets reports ask "was this member inactive at the end of that
// week?" — a re-enable that happened after `asOf` doesn't count yet.
// joinedAt is deliberately *not* limited by `asOf`: for the bulk-imported
// roster it's just the import time, and the Empower report treats those
// members as the pre-existing base for earlier months too.
export function isInactive(
  m: { isVisitor: boolean; joinedAt: Date; reactivatedAt: Date | null },
  lastService: Date | undefined,
  cutoff: Date,
  asOf?: Date,
) {
  if (m.isVisitor) return false;
  const reactivatedAt = m.reactivatedAt && (!asOf || m.reactivatedAt <= asOf) ? m.reactivatedAt : undefined;
  const lastActivity = [lastService, m.joinedAt, reactivatedAt]
    .filter((d): d is Date => !!d)
    .reduce((a, b) => (a > b ? a : b));
  return lastActivity < cutoff;
}

// Ids of members marked present at any Sunday service in (cutoff, asOf].
export async function serviceAttendeesBetween(cutoff: Date, asOf: Date) {
  const rows = await prisma.attendance.findMany({
    where: { present: true, event: { type: "SERVICE", date: { gte: cutoff, lte: asOf } } },
    select: { memberId: true },
    distinct: ["memberId"],
  });
  return new Set(rows.map((r) => r.memberId));
}
