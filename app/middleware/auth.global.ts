export default defineNuxtRouteMiddleware(async (to) => {
  const role = useAuthRole();

  // /api/auth/me is the only source of truth (session cookie is httpOnly).
  const { role: fetchedRole } = await $fetch("/api/auth/me");
  role.value = fetchedRole;

  if (!fetchedRole && to.path !== "/login") {
    return navigateTo("/login");
  }
  if (fetchedRole && to.path === "/login") {
    return navigateTo("/");
  }
});
