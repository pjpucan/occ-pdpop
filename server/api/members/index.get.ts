import { prisma } from "~~/server/utils/prisma";
import { inactiveCutoff, isInactive, lastServiceDates } from "~~/server/utils/activity";

// Returns the same flat shape PDP.vue already renders, so switching
// from the static members.json array to this endpoint is a one-line change.
export default defineEventHandler(async () => {
  const [members, lastService] = await Promise.all([prisma.member.findMany({
    include: {
      bibleStudy: { include: { group: true } },
      volunteer: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  }), lastServiceDates()]);
  const cutoff = inactiveCutoff();

  return members.map((m) => ({
    id: m.id,
    first: m.firstName,
    last: m.lastName,
    category: m.category,
    activeLeader: m.leaderStatus === "ACTIVE" ? m.leaderName : null,
    potentialLeader: m.leaderStatus === "POTENTIAL" ? m.leaderName : null,
    isVisitor: m.isVisitor,
    guestType: m.guestType,
    isFirstTimer: m.isFirstTimer,
    invitedByName: m.invitedByName,
    isWalkIn: m.isWalkIn,
    walkInSource: m.walkInSource,
    birthday: m.birthday,
    bibleStudyGroup: m.bibleStudy?.group.name ?? null,
    volunteer: !!m.volunteer,
    ministry: m.volunteer?.ministry ?? null,
    lastServiceDate: lastService.get(m.id) ?? null,
    isInactive: isInactive(m, lastService.get(m.id), cutoff),
  }));
});
