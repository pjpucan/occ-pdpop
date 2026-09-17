import { prisma } from "~~/server/utils/prisma";
import { PREACHER_OPTIONS } from "~~/server/utils/preacher";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body.name || !body.date || !body.type) {
    throw createError({ statusCode: 400, statusMessage: "Name, date, and type are required." });
  }
  if (body.type === "BIBLE_STUDY" && body.session) {
    throw createError({ statusCode: 400, statusMessage: "Bible study sessions aren't tagged morning/afternoon." });
  }
  if (body.type === "SERVICE" && !body.session) {
    throw createError({ statusCode: 400, statusMessage: "Services need a morning/afternoon session." });
  }
  if (body.preacherName && !PREACHER_OPTIONS.includes(body.preacherName)) {
    throw createError({ statusCode: 400, statusMessage: "Unrecognized preacher." });
  }

  return prisma.event.create({
    data: {
      name: body.name,
      date: new Date(body.date),
      type: body.type,
      session: body.type === "SERVICE" ? body.session : null,
      preacherName: body.type === "SERVICE" ? (body.preacherName || null) : null,
      topic: body.type === "SERVICE" ? (body.topic || null) : null,
      keyVerses: body.type === "SERVICE" && Array.isArray(body.keyVerses) ? body.keyVerses : [],
    },
  });
});
