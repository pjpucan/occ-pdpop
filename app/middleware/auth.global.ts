export default defineNuxtRouteMiddleware(async (to) => {
  const role = useAuthRole();

  // Plain $fetch doesn't forward the incoming request's cookies during SSR,
  // so it would always see an unauthenticated session server-side even when
  // the browser has a valid one — useRequestFetch() carries those headers
  // through on the server while behaving like normal $fetch on the client.
  const requestFetch = useRequestFetch();
  const { role: fetchedRole } = await requestFetch("/api/auth/me");
  role.value = fetchedRole;

  if (!fetchedRole && to.path !== "/login") {
    return navigateTo("/login");
  }
  if (fetchedRole && to.path === "/login") {
    return navigateTo("/");
  }
});
