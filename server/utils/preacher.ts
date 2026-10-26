// Preacher isn't tracked as a Member — usually one of these two people, or a
// guest preacher whose name is typed in.
export const PREACHER_OPTIONS = ["Ptr. Rex Chris Angeles", "Rev. Mac Ortiz"];

export function cleanPreacherName(input: unknown) {
  const name = typeof input === "string" ? input.trim() : "";
  if (name.length > 100) {
    throw createError({ statusCode: 400, statusMessage: "Preacher name is too long." });
  }
  return name || null;
}

// Prayer & Fasting can have several preachers. Keep only rows with something
// filled in, and store key verses as a trimmed list.
export function normalizePreachers(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((p: any) => ({
      name: String(p?.name ?? "").trim(),
      topic: String(p?.topic ?? "").trim(),
      keyVerses: (Array.isArray(p?.keyVerses) ? p.keyVerses : String(p?.keyVerses ?? "").split(","))
        .map((v: unknown) => String(v).trim())
        .filter(Boolean),
    }))
    .filter((p) => p.name || p.topic || p.keyVerses.length);
}
