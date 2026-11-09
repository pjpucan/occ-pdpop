<script setup>
import { ref, computed, onMounted, reactive, watch } from "vue";

const isAdmin = useIsAdmin();

const CATEGORY_ORDER = [
  "KIDS", "TWEENS", "YTH", "NXT", "SOLO", "SENIOR_ADULT",
  "YOUNG_COUPLES", "COUPLES", "LEGACY", "UNASSIGNED",
];
const CATEGORY_LABELS = {
  KIDS: "Kids", TWEENS: "Tweens", YTH: "YTH", NXT: "NXT", SOLO: "Solo",
  SENIOR_ADULT: "Senior Adult", YOUNG_COUPLES: "Young Couples", COUPLES: "Couples",
  LEGACY: "Legacy", UNASSIGNED: "Unassigned",
};

const inputCls = "border border-stone-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-800/20";
const btnPrimary = "bg-slate-800 text-stone-50 rounded-md px-4 py-2.5 text-sm font-medium hover:bg-slate-700";
const btnSecondary = "bg-white text-slate-800 border border-stone-300 rounded-md px-4 py-2.5 text-sm font-medium hover:bg-stone-50";
const btnView = "text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2 py-1 ml-2.5";
const btnEdit = "text-xs text-white bg-slate-800 hover:bg-slate-700 rounded px-2 py-1 ml-2.5";
const btnDelete = "text-xs text-white bg-red-600 hover:bg-red-700 rounded px-2 py-1 ml-2.5";

// --- event list ------------------------------------------------------------
const events = ref([]);
const loadingEvents = ref(true);
const eventsMonth = ref(new Date().toISOString().slice(0, 7));

async function fetchEvents() {
  loadingEvents.value = true;
  events.value = await $fetch("/api/events", { query: { month: eventsMonth.value } });
  loadingEvents.value = false;
}
const leaders = ref([]);
async function fetchLeaders() {
  leaders.value = await $fetch("/api/bible-study-groups");
}
onMounted(() => {
  fetchEvents();
  fetchLeaders();
});
watch(eventsMonth, fetchEvents);
// "Couples" and "NXT" are legacy topical group names from before groups were
// tracked by leader — not people, so they're excluded from the leader search.
const LEGACY_GROUP_NAMES = ["Couples", "NXT"];
const leaderNames = computed(() => leaders.value
  .map((g) => g.name)
  .filter((name) => !LEGACY_GROUP_NAMES.includes(name)));

// Other gatherings: everything that isn't Sunday Celebration or Bible Study.
// They count toward the Empower report's Running Total.
const GATHERING_TYPES = ["MIDWEEK_SERVICE", "PRAYER_MEETING", "PRAYER_AND_FASTING", "KIDS_SERVICE", "YOUTH_SERVICE"];
// Which events-list table an event belongs in.
function sectionOf(type) {
  return GATHERING_TYPES.includes(type) ? "GATHERING" : type;
}
const eventTypeFilter = ref("All");
const sessionFilter = ref("All");
// The session dropdown only shows for Sunday Celebration — reset it when it
// hides so it can't keep filtering out of sight.
watch(eventTypeFilter, (type) => { if (type !== "SERVICE") sessionFilter.value = "All"; });
const filteredEvents = computed(() => events.value.filter((e) => {
  if (eventTypeFilter.value !== "All" && sectionOf(e.type) !== eventTypeFilter.value) return false;
  // Morning/Afternoon only applies to services — don't let it hide Bible studies.
  if (e.type === "SERVICE" && sessionFilter.value !== "All" && e.session !== sessionFilter.value) return false;
  return true;
}));
// The events list is split into one table per section. A section is hidden
// only when the type filter picks a different one.
const eventSections = computed(() => [
  { type: "SERVICE", title: "Sunday Celebration" },
  { type: "BIBLE_STUDY", title: "Bible Study" },
  { type: "GATHERING", title: "Other Gatherings" },
]
  .filter((sec) => eventTypeFilter.value === "All" || eventTypeFilter.value === sec.type)
  .filter((sec) => sec.type !== "GATHERING" || filteredEvents.value.some((e) => sectionOf(e.type) === "GATHERING"))
  .map((sec) => {
    const list = filteredEvents.value.filter((e) => sectionOf(e.type) === sec.type);
    const weeks = groupByWeek(list);
    return { ...sec, events: list, weeks, totalPresent: weeks.reduce((n, w) => n + w.totalPresent, 0) };
  }));

// Monday–Sunday weeks, the same cut-off periods as the Empower report.
// Event dates are stored as UTC midnight, so the math stays in UTC.
function weekStartOf(iso) {
  const d = new Date(iso);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}
function weekLabel(start) {
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d, opts) => d.toLocaleDateString(undefined, { timeZone: "UTC", ...opts });
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  return `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(end, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" })}`;
}
function groupByWeek(list) {
  const weeks = new Map();
  for (const e of list) {
    const start = weekStartOf(e.date);
    const key = start.toISOString();
    if (!weeks.has(key)) weeks.set(key, { key, label: weekLabel(start), events: [], totalPresent: 0 });
    const w = weeks.get(key);
    w.events.push(e);
  }
  // Events arrive newest-first, so the weeks already come out newest-first.
  return [...weeks.values()].map((w) => ({ ...w, totalPresent: weekPresent(w.events), deductions: weekDeductions(w.events) }));
}

// Who weekPresent() counted once (Bible Study only), for the note under the
// week total. Mirrors leaderDeductions() in server/utils/empowerReport.ts.
function weekDeductions(list) {
  if (list[0]?.type !== "BIBLE_STUDY") return [];
  const checkIns = list.flatMap((e) => e.checkIns || []);
  const leaders = new Set(checkIns.filter((a) => a.role === "FACILITATOR" || a.role === "CO_FACILITATOR").map((a) => a.memberId));
  const byLeader = new Map();
  for (const a of checkIns) {
    if (!leaders.has(a.memberId)) continue;
    const v = byLeader.get(a.memberId) ?? { name: a.name, checkIns: 0 };
    v.checkIns++;
    byLeader.set(a.memberId, v);
  }
  return [...byLeader.values()]
    .filter((v) => v.checkIns > 1)
    .map((v) => ({ ...v, removed: v.checkIns - 1 }))
    .sort((a, b) => b.removed - a.removed || a.name.localeCompare(b.name));
}

// Week total. Services: just the sum. Bible Study: anyone who facilitated or
// co-facilitated that week counts once for the whole week; everyone else
// counts every session. Mirrors weeklyBibleStudyAttendees() in
// server/utils/empowerReport.ts so this matches the Empower report.
function weekPresent(list) {
  if (list[0]?.type !== "BIBLE_STUDY") return list.reduce((n, e) => n + e.presentCount, 0);
  const checkIns = list.flatMap((e) => e.checkIns || []);
  const leaders = new Set(checkIns.filter((a) => a.role === "FACILITATOR" || a.role === "CO_FACILITATOR").map((a) => a.memberId));
  return checkIns.filter((a) => !leaders.has(a.memberId)).length + leaders.size;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function formatFullName(member) {
  return member ? `${member.first} ${member.last}` : "—";
}

// --- create event ------------------------------------------------------------
// Event rows aren't created up front — an event with nobody marked present
// isn't a real event. Instead "Create & take attendance" opens the check-in
// screen against a draft (never persisted), and the Event row is only
// POSTed at Save time, and only if at least one person is checked.
// Where a walk-in first timer heard about Oaks.
const WALK_IN_SOURCES = ["Facebook", "Instagram", "YouTube", "Other"];
const EVENT_TYPE_LABELS = {
  SERVICE: "Sunday Celebration",
  BIBLE_STUDY: "Bible Study",
  MIDWEEK_SERVICE: "Midweek Service",
  PRAYER_MEETING: "Prayer Meeting",
  PRAYER_AND_FASTING: "Prayer & Fasting",
  KIDS_SERVICE: "Kids Service",
  YOUTH_SERVICE: "Youth Service",
};
const PREACHER_OPTIONS = ["Ptr. Rex Chris Angeles", "Rev. Mac Ortiz"];

function blankNewEvent() {
  return { date: new Date().toISOString().slice(0, 10), type: "SERVICE", session: "MORNING" };
}
const newEvent = reactive(blankNewEvent());
const startingDraft = ref(false);

async function removeEvent(e) {
  if (!confirm(`Delete "${e.name}" (${formatDate(e.date)})? This removes its attendance record too.`)) return;
  await $fetch(`/api/events/${e.id}`, { method: "DELETE" });
  await fetchEvents();
}

// --- check-in screen ------------------------------------------------------------
const checkInMode = ref(null); // null | "draft" | "edit"
const activeEventId = ref(null);
const activeEvent = ref(null);
const roster = ref([]);
const loadingRoster = ref(false);
const query = ref("");
const category = ref("All");
const saving = ref(false);

// SERVICE-only
// Preacher dropdown: one of PREACHER_OPTIONS, or "GUEST" to type in a guest
// preacher's name. `preacherName` is what gets saved.
const GUEST_PREACHER = "GUEST";
const preacherChoice = ref("");
const guestPreacher = ref("");
const preacherName = computed(() => (preacherChoice.value === GUEST_PREACHER ? guestPreacher.value.trim() : preacherChoice.value));
function setPreacherFromSaved(name) {
  if (!name || PREACHER_OPTIONS.includes(name)) {
    preacherChoice.value = name || "";
    guestPreacher.value = "";
  } else {
    preacherChoice.value = GUEST_PREACHER;
    guestPreacher.value = name;
  }
}
const topic = ref("");
const keyVersesInput = ref(""); // comma-separated in the UI, array in the API
// PRAYER_AND_FASTING-only: several preachers, each with their own topic and
// key verses (comma-separated in the UI).
const blankPreacherRow = () => ({ name: "", topic: "", keyVerses: "" });
const preacherRows = ref([blankPreacherRow()]);
function addPreacherRow() {
  preacherRows.value.push(blankPreacherRow());
}
function removePreacherRow(i) {
  preacherRows.value.splice(i, 1);
  if (preacherRows.value.length === 0) preacherRows.value.push(blankPreacherRow());
}
// Pastors first, then everyone on the roster — a Prayer & Fasting speaker can be anyone.
const preacherNameOptions = computed(() => [...new Set([...PREACHER_OPTIONS, ...memberFullNames.value])]);
// BIBLE_STUDY-only — member ids, one facilitator and one co-facilitator max
const facilitatorId = ref(null);
const coFacilitatorId = ref(null);

const categories = computed(() => {
  const present = new Set(roster.value.map((m) => m.category));
  return Object.keys(CATEGORY_LABELS).filter((c) => present.has(c));
});
const memberFullNames = computed(() => roster.value.map((m) => `${m.first} ${m.last}`));
const ministryOptions = computed(() => {
  const set = new Set();
  roster.value.forEach((m) => { if (m.ministry && m.ministry !== "General") set.add(m.ministry); });
  return [...set].sort();
});

// --- add new person (walk-in during check-in) ------------------------------
const showAddPerson = ref(false);
const addingPerson = ref(false);
const addPersonError = ref("");

function blankAddPersonForm() {
  return {
    first: "", last: "", category: "KIDS", birthday: "",
    inBibleStudy: false, bibleStudyGroup: "", volunteer: false, ministry: "",
    personType: "MEMBER", isVisitor: false, guestType: "MEMBER",
    isFirstTimer: false, isWalkIn: false, walkInSource: "", invitedByName: "",
    activeLeader: "", potentialLeader: "",
  };
}
const addPersonForm = reactive(blankAddPersonForm());

function isBibleStudyGuest(form) {
  return form.isVisitor && form.guestType === "BIBLE_STUDY";
}
function buildAddPersonPayload(form) {
  const bsGuest = isBibleStudyGuest(form);
  return {
    ...form,
    volunteer: bsGuest ? false : form.volunteer,
    ministry: bsGuest ? "" : form.ministry,
    bibleStudyGroup: (bsGuest || form.inBibleStudy) ? form.bibleStudyGroup : "",
  };
}
// One "Type" dropdown drives the two stored fields: Member = not a guest,
// Visitor = attends services but isn't a member, Bible Study = Bible-study-only,
// Youth Service = Youth-Service-only (otherwise treated like a Visitor).
// First timer applies to Visitors and Bible Study people — and, when adding
// someone from a Bible Study check-in, to any type, so the Empower report can
// count them as a Bible Study first timer.
function canMarkFirstTimer(form) {
  return activeEvent.value?.type === "BIBLE_STUDY" || form.isVisitor;
}
function applyPersonType(form) {
  form.isVisitor = form.personType !== "MEMBER";
  form.guestType = form.isVisitor ? form.personType : "MEMBER";
  if (!canMarkFirstTimer(form)) {
    form.isFirstTimer = false;
    form.isWalkIn = false;
    form.walkInSource = "";
    form.invitedByName = "";
  }
}
function closeAddPerson() {
  showAddPerson.value = false;
  addPersonError.value = "";
  Object.assign(addPersonForm, blankAddPersonForm());
}
async function submitAddPerson() {
  if (!addPersonForm.first.trim() || !addPersonForm.last.trim()) {
    addPersonError.value = "First and last name are required.";
    return;
  }
  addPersonError.value = "";
  addingPerson.value = true;
  try {
    const created = await $fetch("/api/members", { method: "POST", body: buildAddPersonPayload(addPersonForm) });
    const members = await $fetch("/api/members");
    const presentIds = new Set(roster.value.filter((m) => m.present).map((m) => m.id));
    presentIds.add(created.id);
    roster.value = members.map((m) => ({
      id: m.id, first: m.first, last: m.last, category: m.category, ministry: m.ministry,
      present: presentIds.has(m.id),
    }));
    closeAddPerson();
  } catch (e) {
    addPersonError.value = "Couldn't save that person. Try again.";
  } finally {
    addingPerson.value = false;
  }
}

const filteredRoster = computed(() => roster.value.filter((m) => {
  const fullName = `${m.first} ${m.last}`.toLowerCase();
  if (query.value && !fullName.includes(query.value.toLowerCase())) return false;
  if (category.value !== "All" && m.category !== category.value) return false;
  return true;
}));

const presentCount = computed(() => roster.value.filter((m) => m.present).length);


async function startDraft() {
  startingDraft.value = true;
  checkInMode.value = "draft";
  activeEventId.value = null;
  activeEvent.value = {
    name: EVENT_TYPE_LABELS[newEvent.type],
    date: newEvent.date,
    type: newEvent.type,
    session: newEvent.type === "SERVICE" ? newEvent.session : null,
  };
  query.value = "";
  category.value = "All";
  setPreacherFromSaved("");
  topic.value = "";
  keyVersesInput.value = "";
  preacherRows.value = [blankPreacherRow()];
  facilitatorId.value = null;
  coFacilitatorId.value = null;
  facilitatorText.value = "";
  coFacilitatorText.value = "";
  closeAddPerson();
  loadingRoster.value = true;
  try {
    const members = await $fetch("/api/members");
    roster.value = members.map((m) => ({ id: m.id, first: m.first, last: m.last, category: m.category, ministry: m.ministry, present: false }));
  } finally {
    loadingRoster.value = false;
    startingDraft.value = false;
  }
}

async function openCheckIn(id) {
  checkInMode.value = "edit";
  activeEventId.value = id;
  loadingRoster.value = true;
  query.value = "";
  category.value = "All";
  closeAddPerson();
  try {
    const data = await $fetch(`/api/events/${id}/attendance`);
    activeEvent.value = data.event;
    roster.value = data.members;
    setPreacherFromSaved(data.event.preacherName);
    topic.value = data.event.topic || "";
    keyVersesInput.value = (data.event.keyVerses || []).join(", ");
    preacherRows.value = (data.event.preachers || []).length
      ? data.event.preachers.map((p) => ({ name: p.name || "", topic: p.topic || "", keyVerses: (p.keyVerses || []).join(", ") }))
      : [blankPreacherRow()];
    facilitatorId.value = data.members.find((m) => m.role === "FACILITATOR")?.id ?? null;
    coFacilitatorId.value = data.members.find((m) => m.role === "CO_FACILITATOR")?.id ?? null;
    facilitatorText.value = nameOf(facilitatorId.value);
    coFacilitatorText.value = nameOf(coFacilitatorId.value);
  } finally {
    loadingRoster.value = false;
  }
}
function closeCheckIn() {
  checkInMode.value = null;
  activeEventId.value = null;
  activeEvent.value = null;
  roster.value = [];
  facilitatorId.value = null;
  coFacilitatorId.value = null;
  facilitatorText.value = "";
  coFacilitatorText.value = "";
  closeAddPerson();
}

function setFacilitator(id) {
  facilitatorId.value = id || null;
  if (id && coFacilitatorId.value === id) coFacilitatorId.value = null;
  const m = roster.value.find((r) => r.id === id);
  if (m) m.present = true;
}
function setCoFacilitator(id) {
  coFacilitatorId.value = id || null;
  if (id && facilitatorId.value === id) facilitatorId.value = null;
  const m = roster.value.find((r) => r.id === id);
  if (m) m.present = true;
}

// Facilitator / Co-Facilitator are typed in (with name suggestions from the
// roster) and matched to a person by full name. The typed text is kept on its
// own so a half-typed name isn't wiped while typing.
const facilitatorText = ref("");
const coFacilitatorText = ref("");
function nameOf(id) {
  const m = roster.value.find((r) => r.id === id);
  return m ? `${m.first} ${m.last}` : "";
}
function findByName(text) {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  return roster.value.find((r) => `${r.first} ${r.last}`.toLowerCase() === t) ?? null;
}
// Picking the same person for both roles moves them; clear the other box.
function onFacilitatorInput(text) {
  facilitatorText.value = text;
  setFacilitator(findByName(text)?.id ?? null);
  if (!coFacilitatorId.value && findByName(coFacilitatorText.value)) coFacilitatorText.value = "";
}
function onCoFacilitatorInput(text) {
  coFacilitatorText.value = text;
  setCoFacilitator(findByName(text)?.id ?? null);
  if (!facilitatorId.value && findByName(facilitatorText.value)) facilitatorText.value = "";
}
const facilitatorUnmatched = computed(() => !!facilitatorText.value.trim() && !facilitatorId.value);
const coFacilitatorUnmatched = computed(() => !!coFacilitatorText.value.trim() && !coFacilitatorId.value);

function selectAllVisible() {
  const visibleIds = new Set(filteredRoster.value.map((m) => m.id));
  roster.value.forEach((m) => { if (visibleIds.has(m.id)) m.present = true; });
}
function clearAllVisible() {
  const visibleIds = new Set(filteredRoster.value.map((m) => m.id));
  roster.value.forEach((m) => { if (visibleIds.has(m.id)) m.present = false; });
}

async function saveAttendance() {
  saving.value = true;
  try {
    const presentMemberIds = roster.value.filter((m) => m.present).map((m) => m.id);
    // Preacher / topic / key verses: every gathering except Bible Study.
    const isService = activeEvent.value.type !== "BIBLE_STUDY";
    const keyVerses = keyVersesInput.value.split(",").map((v) => v.trim()).filter(Boolean);
    const isPrayerAndFasting = activeEvent.value.type === "PRAYER_AND_FASTING";
    const attendanceBody = {
      presentMemberIds,
      ...(isPrayerAndFasting
        ? { preachers: preacherRows.value }
        : isService
          ? { preacherName: preacherName.value || null, topic: topic.value || null, keyVerses }
          : { facilitatorId: facilitatorId.value, coFacilitatorId: coFacilitatorId.value, topic: topic.value || null }),
    };
    if (checkInMode.value === "draft") {
      // Nobody checked on a brand-new draft means there's nothing to save —
      // skip creating the event entirely rather than leaving a 0 record.
      if (presentMemberIds.length > 0) {
        const created = await $fetch("/api/events", {
          method: "POST",
          body: {
            ...activeEvent.value,
            session: activeEvent.value.session || undefined,
            preacherName: isService ? preacherName.value || undefined : undefined,
            // SERVICE: sermon topic. BIBLE_STUDY: the session title (e.g. the group).
            topic: topic.value || undefined,
            keyVerses: isService ? keyVerses : undefined,
          },
        });
        await $fetch(`/api/events/${created.id}/attendance`, { method: "POST", body: attendanceBody });
        Object.assign(newEvent, blankNewEvent());
      }
    } else {
      await $fetch(`/api/events/${activeEventId.value}/attendance`, { method: "POST", body: attendanceBody });
    }
    await fetchEvents();
    closeCheckIn();
  } catch (e) {
    alert("Couldn't save attendance. Try again.");
  } finally {
    saving.value = false;
  }
}

// --- view details modal ------------------------------------------------------------
const viewingEvent = ref(null);
const viewDetail = ref(null);
const loadingView = ref(false);
const attendeeSearch = ref("");

const viewAttendees = computed(() => {
  const present = viewDetail.value?.members.filter((m) => m.present) ?? [];
  const q = attendeeSearch.value.trim().toLowerCase();
  if (!q) return present;
  return present.filter((m) => `${m.first} ${m.last}`.toLowerCase().includes(q));
});

async function openView(id) {
  viewingEvent.value = id;
  loadingView.value = true;
  attendeeSearch.value = "";
  try {
    viewDetail.value = await $fetch(`/api/events/${id}/attendance`);
  } finally {
    loadingView.value = false;
  }
}
function closeView() {
  viewingEvent.value = null;
  viewDetail.value = null;
}
</script>

<template>
  <div class="font-sans text-stone-800">
    <datalist id="attendance-member-names">
      <option v-for="name in memberFullNames" :key="name" :value="name" />
    </datalist>
    <datalist id="attendance-leader-names">
      <option v-for="name in leaderNames" :key="name" :value="name" />
    </datalist>

    <header class="mb-4">
      <p class="text-xs tracking-wide text-stone-400 font-medium mb-1">Oaks Community Church</p>
      <h1 class="font-semibold text-3xl font-normal text-slate-800">Attendance</h1>
    </header>

    <!-- Check-in screen for one event -->
    <div v-if="checkInMode">
      <div class="flex justify-between items-center flex-wrap gap-2.5 mb-3.5">
        <div>
          <p class="text-xs text-stone-400">{{ activeEvent ? formatDate(activeEvent.date) : "" }}</p>
          <h2 class="font-semibold text-xl text-slate-800">{{ activeEvent?.name }}</h2>
        </div>
        <button :class="btnSecondary" @click="closeCheckIn">Back to events</button>
      </div>

      <div v-if="loadingRoster" class="text-stone-400 text-sm">Loading roster…</div>
      <template v-else>
        <!-- Prayer & Fasting: several preachers, one row each -->
        <div v-if="activeEvent.type === 'PRAYER_AND_FASTING'" class="flex flex-col gap-2.5 mb-3.5 bg-white border border-stone-200 rounded-lg p-3.5">
          <datalist id="preacher-name-options">
            <option v-for="name in preacherNameOptions" :key="name" :value="name" />
          </datalist>
          <div v-for="(row, i) in preacherRows" :key="i" class="flex gap-2.5 flex-wrap items-center">
            <label class="text-xs text-stone-400 font-medium w-[70px]">Preacher {{ preacherRows.length > 1 ? i + 1 : "" }}</label>
            <input v-model="row.name" list="preacher-name-options" placeholder="Search name…" :class="[inputCls, 'w-[220px]']" />
            <label class="text-xs text-stone-400 font-medium">Sermon / Topic</label>
            <input v-model="row.topic" type="text" placeholder="Title of sermon or topic" :class="[inputCls, 'flex-1 min-w-[180px]']" />
            <label class="text-xs text-stone-400 font-medium">Key Verses</label>
            <input v-model="row.keyVerses" type="text" placeholder="e.g. John 3:16, Romans 8:28" :class="[inputCls, 'flex-1 min-w-[180px]']" />
            <button
              type="button"
              class="text-stone-400 hover:text-red-600 text-sm px-1"
              title="Remove this preacher"
              @click="removePreacherRow(i)"
            >✕</button>
          </div>
          <button type="button" class="self-start text-sm text-slate-800 border border-stone-300 rounded-md px-3 py-1.5 hover:bg-stone-50" @click="addPreacherRow">
            + Add preacher
          </button>
        </div>

        <div v-else-if="activeEvent.type !== 'BIBLE_STUDY'" class="flex gap-2.5 flex-wrap items-center mb-3.5 bg-white border border-stone-200 rounded-lg p-3.5">
          <label class="text-xs text-stone-400 font-medium">Preacher</label>
          <select v-model="preacherChoice" :class="inputCls">
            <option value="">—</option>
            <option v-for="p in PREACHER_OPTIONS" :key="p" :value="p">{{ p }}</option>
            <option :value="GUEST_PREACHER">Guest preacher…</option>
          </select>
          <input
            v-if="preacherChoice === GUEST_PREACHER"
            v-model="guestPreacher"
            type="text"
            maxlength="100"
            placeholder="Guest preacher's name"
            :class="[inputCls, 'min-w-[200px]']"
          />
          <label class="text-xs text-stone-400 font-medium">Sermon / Topic</label>
          <input v-model="topic" type="text" placeholder="Title of sermon or topic" :class="[inputCls, 'flex-1 min-w-[200px]']" />
          <label class="text-xs text-stone-400 font-medium">Key Verses</label>
          <input v-model="keyVersesInput" type="text" placeholder="e.g. John 3:16, Romans 8:28" :class="[inputCls, 'flex-1 min-w-[220px]']" />
        </div>

        <div v-if="activeEvent.type === 'BIBLE_STUDY'" class="flex gap-2.5 flex-wrap items-center mb-3.5 bg-white border border-stone-200 rounded-lg p-3.5">
          <label class="text-xs text-stone-400 font-medium">Facilitator</label>
          <input
            :value="facilitatorText"
            list="attendance-member-names"
            placeholder="Type a name…"
            :class="[inputCls, 'min-w-[200px]', facilitatorUnmatched && 'border-orange-400']"
            @input="onFacilitatorInput($event.target.value)"
          />
          <label class="text-xs text-stone-400 font-medium">Co-Facilitator</label>
          <input
            :value="coFacilitatorText"
            list="attendance-member-names"
            placeholder="Type a name…"
            :class="[inputCls, 'min-w-[200px]', coFacilitatorUnmatched && 'border-orange-400']"
            @input="onCoFacilitatorInput($event.target.value)"
          />
          <label class="text-xs text-stone-400 font-medium">Session</label>
          <input v-model="topic" type="text" placeholder="Group or session title" :class="[inputCls, 'flex-1 min-w-[200px]']" />
          <p v-if="facilitatorUnmatched || coFacilitatorUnmatched" class="w-full text-xs text-orange-700 m-0">
            Pick a name from the suggestions. Someone new? Add them with "+ Add new person" first.
          </p>
        </div>

        <div class="flex gap-2.5 flex-wrap items-center mb-3.5">
          <input v-model="query" type="text" placeholder="Search by name" :class="[inputCls, 'flex-1 min-w-[180px]']" />
          <select v-model="category" :class="inputCls">
            <option>All</option>
            <option v-for="c in categories" :key="c" :value="c">{{ CATEGORY_LABELS[c] }}</option>
          </select>
          <button class="text-xs text-slate-800 hover:underline" @click="selectAllVisible">Select all shown</button>
          <button class="text-xs text-orange-700 hover:underline" @click="clearAllVisible">Clear all shown</button>
          <button :class="btnSecondary" @click="showAddPerson ? closeAddPerson() : (showAddPerson = true)">
            {{ showAddPerson ? "Cancel" : "+ Add new person" }}
          </button>
          <span class="ml-auto text-sm text-stone-400">{{ presentCount }} of {{ roster.length }} present</span>
        </div>

        <form v-if="showAddPerson" class="flex flex-col gap-3.5 bg-white border border-stone-200 rounded-lg p-3.5 mb-3.5" @submit.prevent="submitAddPerson">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs text-stone-400 font-medium mb-1.5">First name</label>
              <input v-model="addPersonForm.first" :class="[inputCls, 'w-full']" />
            </div>
            <div>
              <label class="block text-xs text-stone-400 font-medium mb-1.5">Last name</label>
              <input v-model="addPersonForm.last" :class="[inputCls, 'w-full']" />
            </div>
            <div>
              <label class="block text-xs text-stone-400 font-medium mb-1.5">Birthday</label>
              <input v-model="addPersonForm.birthday" type="date" :class="[inputCls, 'w-full']" />
            </div>
            <div>
              <label class="block text-xs text-stone-400 font-medium mb-1.5">Category</label>
              <select v-model="addPersonForm.category" :class="[inputCls, 'w-full']">
                <option v-for="c in CATEGORY_ORDER" :key="c" :value="c">{{ CATEGORY_LABELS[c] }}</option>
              </select>
            </div>
            <div v-if="!isBibleStudyGuest(addPersonForm)">
              <label class="block text-xs text-stone-400 font-medium mb-1.5">In Bible study?</label>
              <select v-model="addPersonForm.inBibleStudy" :class="[inputCls, 'w-full']">
                <option :value="false">No</option>
                <option :value="true">Yes</option>
              </select>
            </div>
            <div v-if="addPersonForm.inBibleStudy && !isBibleStudyGuest(addPersonForm)">
              <label class="block text-xs text-stone-400 font-medium mb-1.5">Bible study leader</label>
              <input
                v-model="addPersonForm.bibleStudyGroup"
                list="attendance-leader-names"
                placeholder="Search leader…"
                :class="[inputCls, 'w-full']"
              />
            </div>
            <template v-if="!isBibleStudyGuest(addPersonForm)">
              <div>
                <label class="block text-xs text-stone-400 font-medium mb-1.5">Volunteer?</label>
                <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
                  <input type="checkbox" v-model="addPersonForm.volunteer" /> Volunteer
                </label>
              </div>
              <div>
                <label class="block text-xs text-stone-400 font-medium mb-1.5">Ministry</label>
                <select v-model="addPersonForm.ministry" :disabled="!addPersonForm.volunteer" :class="[inputCls, 'w-full disabled:bg-stone-100 disabled:text-stone-400']">
                  <option value="">Ministry</option>
                  <option v-for="m in ministryOptions" :key="m" :value="m">{{ m }}</option>
                </select>
              </div>
            </template>
            <div>
              <label class="block text-xs text-stone-400 font-medium mb-1.5">Type</label>
              <select v-model="addPersonForm.personType" :class="[inputCls, 'w-full']" @change="applyPersonType(addPersonForm)">
                <option value="MEMBER">Member</option>
                <option value="VISITOR">Visitor</option>
                <option value="BIBLE_STUDY">Bible Study</option>
                <option value="YOUTH_SERVICE">Youth Service</option>
              </select>
            </div>
            <div v-if="isBibleStudyGuest(addPersonForm)">
              <label class="block text-xs text-stone-400 font-medium mb-1.5">Leader</label>
              <select v-model="addPersonForm.bibleStudyGroup" :class="[inputCls, 'w-full']">
                <option value="">Select leader…</option>
                <option v-if="addPersonForm.bibleStudyGroup && !leaderNames.includes(addPersonForm.bibleStudyGroup)" :value="addPersonForm.bibleStudyGroup">{{ addPersonForm.bibleStudyGroup }}</option>
                <option v-for="name in leaderNames" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>
            <template v-if="canMarkFirstTimer(addPersonForm)">
              <div>
                <label class="block text-xs text-stone-400 font-medium mb-1.5">First timer?</label>
                <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
                  <input type="checkbox" v-model="addPersonForm.isFirstTimer" /> First Timer
                </label>
              </div>
              <template v-if="addPersonForm.isFirstTimer">
                <div>
                  <label class="block text-xs text-stone-400 font-medium mb-1.5">Walk-in?</label>
                  <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
                    <input type="checkbox" v-model="addPersonForm.isWalkIn" /> Walk-in
                  </label>
                </div>
                <div v-if="addPersonForm.isWalkIn">
                  <label class="block text-xs text-stone-400 font-medium mb-1.5">Heard about us from</label>
                  <select v-model="addPersonForm.walkInSource" :class="[inputCls, 'w-full']">
                    <option value="">Where did they hear about us?</option>
                    <option v-for="src in WALK_IN_SOURCES" :key="src" :value="src">{{ src }}</option>
                  </select>
                </div>
                <div v-if="!addPersonForm.isWalkIn">
                  <label class="block text-xs text-stone-400 font-medium mb-1.5">Invited by</label>
                  <input
                    v-model="addPersonForm.invitedByName"
                    list="attendance-member-names"
                    placeholder="Invited by…"
                    :class="[inputCls, 'w-full']"
                  />
                </div>
              </template>
            </template>
          </div>
          <p v-if="addPersonError" class="text-orange-700 text-sm m-0">{{ addPersonError }}</p>
          <button type="submit" :class="[btnPrimary, 'self-start']" :disabled="addingPerson">
            {{ addingPerson ? "Saving…" : "Save" }}
          </button>
        </form>

        <div class="bg-white border border-stone-200 rounded-lg max-h-[480px] overflow-y-auto mb-3.5">
          <table class="w-full border-collapse text-sm">
            <tbody>
              <tr v-for="m in filteredRoster" :key="m.id" class="border-t border-stone-100 first:border-t-0">
                <td class="p-2.5 w-10">
                  <input type="checkbox" v-model="m.present" />
                </td>
                <td class="p-2.5">
                  {{ m.first }} {{ m.last }}
                  <span class="text-stone-400">— {{ CATEGORY_LABELS[m.category] }}</span>
                </td>
                <td v-if="isAdmin" class="p-2.5 text-right">
                  <a :href="`/?edit=${m.id}`" target="_blank" :class="[btnEdit, 'inline-block no-underline']">Edit</a>
                </td>
              </tr>
              <tr v-if="filteredRoster.length === 0">
                <td :colspan="isAdmin ? 3 : 2" class="text-center py-7 text-stone-400">No members match these filters.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <button :class="btnPrimary" :disabled="saving" @click="saveAttendance">
          {{ saving ? "Saving…" : "Save attendance" }}
        </button>
      </template>
    </div>

    <!-- Event list + create form -->
    <div v-else>
      <form class="flex flex-col gap-2.5 bg-white border border-stone-200 rounded-lg p-3.5 mb-4" @submit.prevent="startDraft">
        <p class="text-xs text-stone-400 font-medium">New event</p>
        <div class="flex gap-2.5 flex-wrap items-center">
          <select v-model="newEvent.type" :class="inputCls">
            <option v-for="(label, type) in EVENT_TYPE_LABELS" :key="type" :value="type">{{ label }}</option>
          </select>
          <input v-model="newEvent.date" type="date" :class="inputCls" />
          <select v-if="newEvent.type === 'SERVICE'" v-model="newEvent.session" :class="inputCls">
            <option value="MORNING">Morning</option>
            <option value="AFTERNOON">Afternoon</option>
          </select>
        </div>
        <button type="submit" :class="[btnPrimary, 'self-start']" :disabled="startingDraft">
          {{ startingDraft ? "Loading…" : "Create & take attendance" }}
        </button>
      </form>

      <div class="flex gap-2.5 flex-wrap items-center mb-3.5">
        <input v-model="eventsMonth" type="month" :class="inputCls" />
        <select v-model="eventTypeFilter" :class="inputCls">
          <option value="All">All events</option>
          <option value="SERVICE">Sunday Celebration</option>
          <option value="BIBLE_STUDY">Bible Study</option>
          <option value="GATHERING">Other Gatherings</option>
        </select>
        <select v-if="eventTypeFilter === 'SERVICE'" v-model="sessionFilter" :class="inputCls">
          <option value="All">All sessions</option>
          <option value="MORNING">Morning</option>
          <option value="AFTERNOON">Afternoon</option>
        </select>
      </div>

      <!-- Sunday services and Bible studies listed separately -->
      <section v-for="sec in eventSections" :key="sec.type" class="mb-6">
        <div class="flex items-baseline justify-between mb-2">
          <h2 class="text-lg text-slate-800">{{ sec.title }}</h2>
          <span class="text-sm text-stone-400">
            {{ sec.events.length }} {{ sec.events.length === 1 ? "event" : "Events" }} · {{ sec.totalPresent }} Present
          </span>
        </div>
        <div class="bg-white border border-stone-200 rounded-lg max-h-[480px] overflow-y-auto">
          <table class="w-full border-collapse text-sm table-fixed">
            <thead>
              <tr class="text-left text-xs text-stone-400">
                <th class="p-2.5 font-medium w-[18%]">Date</th>
                <th class="p-2.5 font-medium">{{ sec.type === "SERVICE" ? "Session" : sec.type === "BIBLE_STUDY" ? "Session / Group" : "Gathering" }}</th>
                <th class="p-2.5 font-medium w-[12%]">Present</th>
                <th class="p-2.5 font-medium text-center w-[260px]">Action</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="w in sec.weeks" :key="w.key">
              <tr class="bg-stone-50 border-t border-stone-200">
                <td colspan="4" class="px-2.5 py-1.5 text-xs font-medium text-slate-700">Week of {{ w.label }}</td>
              </tr>
              <tr v-for="e in w.events" :key="e.id" class="border-t border-stone-100">
                <td class="p-2.5">{{ formatDate(e.date) }}</td>
                <td class="p-2.5 text-stone-500">
                  <template v-if="e.type === 'BIBLE_STUDY'">{{ e.topic || "—" }}</template>
                  <template v-else-if="e.type === 'SERVICE'">{{ e.session === "AFTERNOON" ? "Afternoon" : "Morning" }}</template>
                  <template v-else>
                    <span class="text-slate-800">{{ EVENT_TYPE_LABELS[e.type] }}</span><template v-if="e.topic"> · {{ e.topic }}</template>
                  </template>
                </td>
                <td class="p-2.5">{{ e.presentCount }}</td>
                <td class="p-2.5 text-center whitespace-nowrap">
                  <button :class="btnView" @click="openView(e.id)">View</button>
                  <button
                    v-if="isAdmin || e.presentCount === 0"
                    :class="btnEdit"
                    @click="openCheckIn(e.id)"
                  >
                    {{ e.presentCount > 0 ? "Edit" : "Take attendance" }}
                  </button>
                  <button v-if="isAdmin" :class="btnDelete" @click="removeEvent(e)">Delete</button>
                </td>
              </tr>
              <!-- Week subtotal, with the count lined up under Present -->
              <tr class="border-t border-stone-100 text-xs text-stone-500">
                <td colspan="2" class="px-2.5 py-1.5 text-right">
                  Week total · {{ w.events.length }} {{ w.events.length === 1 ? "event" : "Events" }}
                </td>
                <td class="px-2.5 py-1.5 font-semibold text-slate-800">{{ w.totalPresent }} Present</td>
                <td></td>
              </tr>
              <!-- Info only: who the once-per-week leader rule took off the week total -->
              <tr v-if="w.deductions.length">
                <td colspan="4" class="px-3 pt-1 pb-4">
                  <div class="flex gap-2 items-start bg-amber-50 border border-amber-200 text-amber-900 rounded-md px-3.5 py-2.5 text-xs leading-relaxed">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="shrink-0 mt-px" viewBox="0 0 16 16"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.469l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/></svg>
                    <div>
                      <p class="m-0 font-semibold">Note: leaders counted once this week</p>
                      <p class="m-0 mt-0.5">
                        Facilitators and co-facilitators count as 1 for the week, however many sessions they led or attended.
                        Taken off the week total:
                        {{ w.deductions.map((d) => `${d.name} ${d.checkIns} → 1 (−${d.removed})`).join(", ") }}
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
              </template>
              <tr v-if="!loadingEvents && sec.events.length === 0">
                <td colspan="4" class="text-center py-7 text-stone-400">No {{ sec.title.toLowerCase() }} events match these filters.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- View details modal -->
    <div v-if="viewingEvent" class="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-20" @click.self="closeView">
      <div class="bg-white rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5">
        <div v-if="loadingView" class="text-stone-400 text-sm">Loading…</div>
        <template v-else-if="viewDetail">
          <div class="flex justify-between items-start mb-3.5">
            <div>
              <p class="text-xs text-stone-400">{{ formatDate(viewDetail.event.date) }}</p>
              <h2 class="font-semibold text-xl text-slate-800">{{ viewDetail.event.name }}</h2>
            </div>
            <button class="text-stone-400 hover:text-slate-800 text-sm" @click="closeView">Close</button>
          </div>

          <dl class="grid gap-1.5 text-sm mb-3.5">
            <div v-if="viewDetail.event.type === 'SERVICE'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Session</dt>
              <dd>{{ viewDetail.event.session === "AFTERNOON" ? "Afternoon" : "Morning" }}</dd>
            </div>
            <div v-if="viewDetail.event.type === 'PRAYER_AND_FASTING'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Preachers</dt>
              <dd class="m-0">
                <template v-if="viewDetail.event.preachers?.length">
                  <div v-for="(p, i) in viewDetail.event.preachers" :key="i" class="mb-1">
                    <span class="font-medium">{{ p.name || "—" }}</span>
                    <span v-if="p.topic" class="text-stone-500"> · {{ p.topic }}</span>
                    <span v-if="p.keyVerses?.length" class="text-stone-400"> ({{ p.keyVerses.join(", ") }})</span>
                  </div>
                </template>
                <template v-else>—</template>
              </dd>
            </div>
            <div v-if="viewDetail.event.type !== 'BIBLE_STUDY' && viewDetail.event.type !== 'PRAYER_AND_FASTING'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Preacher</dt>
              <dd>{{ viewDetail.event.preacherName || "—" }}</dd>
            </div>
            <div v-if="viewDetail.event.type !== 'BIBLE_STUDY' && viewDetail.event.type !== 'PRAYER_AND_FASTING'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Sermon / Topic</dt>
              <dd>{{ viewDetail.event.topic || "—" }}</dd>
            </div>
            <div v-if="viewDetail.event.type !== 'BIBLE_STUDY' && viewDetail.event.type !== 'PRAYER_AND_FASTING'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Key Verses</dt>
              <dd>{{ viewDetail.event.keyVerses?.length ? viewDetail.event.keyVerses.join(", ") : "—" }}</dd>
            </div>
            <div v-if="viewDetail.event.type === 'BIBLE_STUDY'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Session</dt>
              <dd>{{ viewDetail.event.topic || "—" }}</dd>
            </div>
            <div v-if="viewDetail.event.type === 'BIBLE_STUDY'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Facilitator</dt>
              <dd>{{ formatFullName(viewDetail.members.find((m) => m.role === "FACILITATOR")) }}</dd>
            </div>
            <div v-if="viewDetail.event.type === 'BIBLE_STUDY'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Co-Facilitator</dt>
              <dd>{{ formatFullName(viewDetail.members.find((m) => m.role === "CO_FACILITATOR")) }}</dd>
            </div>
          </dl>

          <div class="flex justify-between items-center mb-1.5 gap-2">
            <p class="text-xs text-stone-400 font-medium">
              Attendees ({{ viewDetail.members.filter((m) => m.present).length }})
            </p>
            <input
              v-model="attendeeSearch"
              type="text"
              placeholder="Search attendees…"
              class="border border-stone-300 rounded-md px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-800/20 w-48"
            />
          </div>
          <div class="border border-stone-200 rounded-lg max-h-64 overflow-y-auto">
            <table class="w-full border-collapse text-sm">
              <tbody>
                <tr v-for="m in viewAttendees" :key="m.id" class="border-t border-stone-100 first:border-t-0">
                  <td class="p-2">{{ m.first }} {{ m.last }}</td>
                  <td class="p-2 text-stone-400">{{ CATEGORY_LABELS[m.category] }}</td>
                  <td class="p-2 text-right">
                    <span v-if="m.role === 'FACILITATOR'" class="text-xs font-medium bg-slate-100 text-slate-800 rounded-full px-2 py-0.5">Facilitator</span>
                    <span v-else-if="m.role === 'CO_FACILITATOR'" class="text-xs font-medium bg-slate-100 text-slate-800 rounded-full px-2 py-0.5">Co-Facilitator</span>
                  </td>
                </tr>
                <tr v-if="viewAttendees.length === 0">
                  <td colspan="3" class="text-center py-5 text-stone-400">
                    {{ attendeeSearch ? "No attendees match your search." : "No attendees recorded." }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
