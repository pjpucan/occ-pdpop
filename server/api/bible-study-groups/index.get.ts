import { prisma } from "~~/server/utils/prisma";

// The list of Bible study leaders/groups members can be assigned to —
// same underlying table the "Bible study group" field on Member connects to.
export default defineEventHandler(async () => {
  const groups = await prisma.bibleStudyGroup.findMany({
    include: { _count: { select: { members: true } } },
    orderBy: { name: "asc" },
  });

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    memberCount: g._count.members,
  }));
});
