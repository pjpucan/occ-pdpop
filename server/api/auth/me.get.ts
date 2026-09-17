import { getSessionRole } from "~~/server/utils/auth";

export default defineEventHandler(async (event) => {
  return { role: getSessionRole(event) };
});
