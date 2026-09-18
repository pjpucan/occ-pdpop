import { prisma } from "~~/server/utils/prisma";

// Every member, joined with whether they're marked present at this event —
// what the check-in screen ticks through.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing event id." });
  }

  const [eventRecord, members] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id } }),
    prisma.member.findMany({
      include: { attendances: { where: { eventId: id } }, volunteer: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  return {
    event: eventRecord,
    members: members.map((m) => ({
      id: m.id,
      first: m.firstName,
      last: m.lastName,
      category: m.category,
      present: m.attendances[0]?.present ?? false,
      role: m.attendances[0]?.role ?? null,
      ministry: m.volunteer?.ministry ?? null,
    })),
  };
});
