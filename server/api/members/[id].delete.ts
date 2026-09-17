import { prisma } from "~~/server/utils/prisma";
import { requireAdmin } from "~~/server/utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing member id." });
  }

  // schema.prisma has onDelete: Cascade on BibleStudyMembership,
  // VolunteerRecord, and Attendance, so this one call also cleans
  // up every related row for this member.
  await prisma.member.delete({ where: { id } });

  return { success: true };
});
