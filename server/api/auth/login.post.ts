import { checkCredentials, makeSessionCookie } from "~~/server/utils/auth";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const role = checkCredentials(body.username, body.password);

  if (!role) {
    throw createError({ statusCode: 401, statusMessage: "Wrong username or password." });
  }

  setCookie(event, "occ_session", makeSessionCookie(role), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return { role };
});
