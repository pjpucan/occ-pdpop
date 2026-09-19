import { prisma } from "~~/server/utils/prisma";
import { requireAdmin } from "~~/server/utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id");

  await prisma.$transaction([
    prisma.bibleStudyMembership.deleteMany({ where: { groupId: id } }),
    prisma.bibleStudyGroup.delete({ where: { id } }),
  ]);

  return { ok: true };
});
