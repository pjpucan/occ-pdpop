import { prisma } from "~~/server/utils/prisma";
import { PREACHER_OPTIONS } from "~~/server/utils/preacher";

// Body: { presentMemberIds: string[], facilitatorId?, coFacilitatorId?,
// preacherName?, topic? } — the full set of members checked in for this
// event, plus BIBLE_STUDY roles or SERVICE preacher/topic. Simplest correct
// approach is replace-in-place: wipe this event's attendance rows, then
// recreate one per present member.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const body = await readBody(event);

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing event id." });
  }
  if (!Array.isArray(body.presentMemberIds)) {
    throw createError({ statusCode: 400, statusMessage: "presentMemberIds must be an array." });
  }
  if (body.preacherName && !PREACHER_OPTIONS.includes(body.preacherName)) {
    throw createError({ statusCode: 400, statusMessage: "Unrecognized preacher." });
  }

  // Nobody present means the event didn't happen (or was a mistaken
  // creation) — drop it instead of leaving a zero-attendance record behind.
  if (body.presentMemberIds.length === 0) {
    await prisma.event.delete({ where: { id } });
    return { ok: true, count: 0, deleted: true };
  }

  await prisma.$transaction([
    prisma.attendance.deleteMany({ where: { eventId: id } }),
    prisma.attendance.createMany({
      data: body.presentMemberIds.map((memberId: string) => ({
        memberId,
        eventId: id,
        present: true,
        role: memberId === body.facilitatorId ? "FACILITATOR" : memberId === body.coFacilitatorId ? "CO_FACILITATOR" : null,
      })),
    }),
  ]);

  if (body.preacherName !== undefined || body.topic !== undefined || body.keyVerses !== undefined) {
    await prisma.event.update({
      where: { id },
      data: {
        preacherName: body.preacherName || null,
        topic: body.topic || null,
        keyVerses: Array.isArray(body.keyVerses) ? body.keyVerses : [],
      },
    });
  }

  return { ok: true, count: body.presentMemberIds.length };
});
