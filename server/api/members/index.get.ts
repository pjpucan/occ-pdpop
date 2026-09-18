import { prisma } from "~~/server/utils/prisma";

// Returns the same flat shape PDP.vue already renders, so switching
// from the static members.json array to this endpoint is a one-line change.
export default defineEventHandler(async () => {
  const members = await prisma.member.findMany({
    include: {
      bibleStudy: { include: { group: true } },
      volunteer: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

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
    birthday: m.birthday,
    bibleStudyGroup: m.bibleStudy?.group.name ?? null,
    volunteer: !!m.volunteer,
    ministry: m.volunteer?.ministry ?? null,
  }));
});
