import { prisma } from "~~/server/utils/prisma";
import { requireAdmin } from "~~/server/utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody(event);
  const name = (body.name || "").trim();

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: "Leader name is required." });
  }

  const existing = await prisma.bibleStudyGroup.findUnique({ where: { name } });
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: "That leader already exists." });
  }

  return prisma.bibleStudyGroup.create({ data: { name } });
});
