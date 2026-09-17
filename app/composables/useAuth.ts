// Shared client-side copy of the session role, populated by the auth
// middleware so components can cheaply check `isAdmin` without refetching.
export function useAuthRole() {
  return useState<"admin" | "user" | null>("authRole", () => null);
}

export function useIsAdmin() {
  const role = useAuthRole();
  return computed(() => role.value === "admin");
}
