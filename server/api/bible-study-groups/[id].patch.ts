import { prisma } from "~~/server/utils/prisma";
import { requireAdmin } from "~~/server/utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id");
  const body = await readBody(event);
  const name = (body.name || "").trim();

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: "Leader name is required." });
  }

  const existing = await prisma.bibleStudyGroup.findUnique({ where: { name } });
  if (existing && existing.id !== id) {
    throw createError({ statusCode: 409, statusMessage: "That leader already exists." });
  }

  return prisma.bibleStudyGroup.update({ where: { id }, data: { name } });
});
