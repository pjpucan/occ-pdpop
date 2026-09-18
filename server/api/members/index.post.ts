import { prisma } from "~~/server/utils/prisma";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body.first || !body.last || !body.category) {
    throw createError({ statusCode: 400, statusMessage: "First name, last name, and category are required." });
  }

  const member = await prisma.member.create({
    data: {
      firstName: body.first,
      lastName: body.last,
      category: body.category,
      leaderStatus: body.activeLeader ? "ACTIVE" : body.potentialLeader ? "POTENTIAL" : "NONE",
      leaderName: body.activeLeader || body.potentialLeader || null,
      isVisitor: !!body.isVisitor,
      guestType: body.isVisitor ? body.guestType || "MEMBER" : null,
      isFirstTimer: !!body.isFirstTimer,
      isWalkIn: !!body.isFirstTimer && !!body.isWalkIn,
      invitedByName: body.isFirstTimer && !body.isWalkIn ? body.invitedByName || null : null,
      birthday: body.birthday ? new Date(body.birthday) : null,
      ...(body.bibleStudyGroup && {
        bibleStudy: {
          create: {
            group: {
              connectOrCreate: {
                where: { name: body.bibleStudyGroup },
                create: { name: body.bibleStudyGroup },
              },
            },
          },
        },
      }),
      ...(body.volunteer && {
        volunteer: { create: { ministry: body.ministry || null } },
      }),
    },
  });

  return member;
});
