import { prisma } from "~~/server/utils/prisma";
import { requireAdmin } from "~~/server/utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing event id." });
  }
  await prisma.event.delete({ where: { id } });
  return { ok: true };
});
