import { getSessionRole } from "~~/server/utils/auth";

// Every /api route needs a valid session except the auth endpoints
// themselves — otherwise the login page is just cosmetic.
export default defineEventHandler((event) => {
  const path = event.path || "";
  if (!path.startsWith("/api/")) return;
  if (path.startsWith("/api/auth/")) return;

  if (!getSessionRole(event)) {
    throw createError({ statusCode: 401, statusMessage: "Please log in." });
  }
});
