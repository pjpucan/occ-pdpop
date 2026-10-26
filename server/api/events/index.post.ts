import { prisma } from "~~/server/utils/prisma";
import { cleanPreacherName, normalizePreachers } from "~~/server/utils/preacher";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body.name || !body.date || !body.type) {
    throw createError({ statusCode: 400, statusMessage: "Name, date, and type are required." });
  }
  if (body.type !== "SERVICE" && body.session) {
    throw createError({ statusCode: 400, statusMessage: "Only Sunday Celebration is tagged morning/afternoon." });
  }
  if (body.type === "SERVICE" && !body.session) {
    throw createError({ statusCode: 400, statusMessage: "Services need a morning/afternoon session." });
  }
  const preacherName = cleanPreacherName(body.preacherName);

  return prisma.event.create({
    data: {
      name: body.name,
      date: new Date(body.date),
      type: body.type,
      session: body.type === "SERVICE" ? body.session : null,
      // Preacher and key verses apply to every gathering except Bible Study.
      preacherName: body.type !== "BIBLE_STUDY" ? preacherName : null,
      // SERVICE: sermon topic. BIBLE_STUDY: session title (e.g. the group).
      topic: body.topic || null,
      keyVerses: body.type !== "BIBLE_STUDY" && Array.isArray(body.keyVerses) ? body.keyVerses : [],
      preachers: body.type === "PRAYER_AND_FASTING" ? normalizePreachers(body.preachers) : [],
    },
  });
});
