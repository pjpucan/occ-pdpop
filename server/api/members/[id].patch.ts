import { prisma } from "~~/server/utils/prisma";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const body = await readBody(event);

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing member id." });
  }

  // Bible study membership: simplest correct approach is replace-in-place —
  // drop whatever group they were in, then reattach if one was given.
  await prisma.bibleStudyMembership.deleteMany({ where: { memberId: id } });
  if (body.bibleStudyGroup) {
    await prisma.bibleStudyMembership.create({
      data: {
        memberId: id,
        group: {
          connectOrCreate: {
            where: { name: body.bibleStudyGroup },
            create: { name: body.bibleStudyGroup },
          },
        },
      },
    });
  }

  // Volunteer record: upsert if they're volunteering, remove if not.
  if (body.volunteer) {
    await prisma.volunteerRecord.upsert({
      where: { memberId: id },
      update: { ministry: body.ministry || null },
      create: { memberId: id, ministry: body.ministry || null },
    });
  } else {
    await prisma.volunteerRecord.deleteMany({ where: { memberId: id } });
  }

  const member = await prisma.member.update({
    where: { id },
    data: {
      firstName: body.first,
      lastName: body.last,
      category: body.category,
      leaderStatus: body.activeLeader ? "ACTIVE" : body.potentialLeader ? "POTENTIAL" : "NONE",
      leaderName: body.activeLeader || body.potentialLeader || null,
      isVisitor: !!body.isVisitor,
      birthday: body.birthday ? new Date(body.birthday) : null,
    },
  });

  return member;
});
