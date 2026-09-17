import { createHmac, timingSafeEqual } from "node:crypto";

export type Role = "admin" | "user";

// Two shared logins, not per-person accounts — good enough for a small
// internal tool. Only this server file ever sees the passwords.
const CREDENTIALS: Record<string, { password: string; role: Role }> = {
  user: { password: "occ-user_07", role: "user" },
  admin: { password: "occ-admin!7!", role: "admin" },
};

// Signs the session cookie so editing it in devtools (e.g. "user" -> "admin")
// doesn't work — httpOnly only blocks JS access, not manual cookie editing.
const SECRET = "occ-pdpop-session-v1";

function sign(value: string) {
  return createHmac("sha256", SECRET).update(value).digest("hex");
}

export function checkCredentials(username: string, password: string): Role | null {
  const entry = CREDENTIALS[username];
  if (!entry || entry.password !== password) return null;
  return entry.role;
}

export function makeSessionCookie(role: Role) {
  return `${role}.${sign(role)}`;
}

export function readSessionCookie(value: string | undefined): Role | null {
  if (!value) return null;
  const [role, sig] = value.split(".");
  if (!role || !sig || (role !== "admin" && role !== "user")) return null;
  const expected = sign(role);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return role;
}

export function getSessionRole(event: any): Role | null {
  return readSessionCookie(getCookie(event, "occ_session"));
}

export function requireAdmin(event: any) {
  if (getSessionRole(event) !== "admin") {
    throw createError({ statusCode: 403, statusMessage: "Admins only." });
  }
}
