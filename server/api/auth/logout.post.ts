export default defineEventHandler(async (event) => {
  deleteCookie(event, "occ_session", { path: "/" });
  return { ok: true };
});
