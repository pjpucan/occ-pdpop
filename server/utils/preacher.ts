// Preacher isn't tracked as a Member — it's always one of these two people.
export const PREACHER_OPTIONS = ["Ptr. Rex Chris Angeles", "Rev. Mac Ortiz"];

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
