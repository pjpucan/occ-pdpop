import { prisma } from "~~/server/utils/prisma";
import { requireAdmin } from "~~/server/utils/auth";

// Re-enables an Inactive member by restarting their 3-month window from now.
export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing member id." });
  }

  return prisma.member.update({
    where: { id },
    data: { reactivatedAt: new Date() },
  });
});
