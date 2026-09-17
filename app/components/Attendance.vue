<script setup>
import { ref, computed, onMounted, reactive } from "vue";

const CATEGORY_LABELS = {
  KIDS: "Kids", TWEENS: "Tweens", YTH: "YTH", NXT: "NXT", SOLO: "Solo",
  SENIOR_ADULT: "Senior Adult", YOUNG_COUPLES: "Young Couples", COUPLES: "Couples",
  LEGACY: "Legacy", UNASSIGNED: "Unassigned",
};

const inputCls = "border border-stone-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-800/20";
const btnPrimary = "bg-slate-800 text-stone-50 rounded-md px-4 py-2.5 text-sm font-medium hover:bg-slate-700";
const btnSecondary = "bg-white text-slate-800 border border-stone-300 rounded-md px-4 py-2.5 text-sm font-medium hover:bg-stone-50";

// --- event list ------------------------------------------------------------
const events = ref([]);
const loadingEvents = ref(true);

async function fetchEvents() {
  loadingEvents.value = true;
  events.value = await $fetch("/api/events");
  loadingEvents.value = false;
}
onMounted(fetchEvents);

const eventTypeFilter = ref("All");
const sessionFilter = ref("All");
const filteredEvents = computed(() => events.value.filter((e) => {
  if (eventTypeFilter.value !== "All" && e.type !== eventTypeFilter.value) return false;
  if (sessionFilter.value !== "All" && e.session !== sessionFilter.value) return false;
  return true;
}));

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
const EVENT_TYPE_LABELS = { SERVICE: "Sunday Celebration", BIBLE_STUDY: "Bible Study" };
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
const preacherName = ref("");
const topic = ref("");
const keyVersesInput = ref(""); // comma-separated in the UI, array in the API
// BIBLE_STUDY-only — member ids, one facilitator and one co-facilitator max
const facilitatorId = ref(null);
const coFacilitatorId = ref(null);

const categories = computed(() => {
  const present = new Set(roster.value.map((m) => m.category));
  return Object.keys(CATEGORY_LABELS).filter((c) => present.has(c));
});

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
  preacherName.value = "";
  topic.value = "";
  keyVersesInput.value = "";
  facilitatorId.value = null;
  coFacilitatorId.value = null;
  loadingRoster.value = true;
  try {
    const members = await $fetch("/api/members");
    roster.value = members.map((m) => ({ id: m.id, first: m.first, last: m.last, category: m.category, present: false }));
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
  try {
    const data = await $fetch(`/api/events/${id}/attendance`);
    activeEvent.value = data.event;
    roster.value = data.members;
    preacherName.value = data.event.preacherName || "";
    topic.value = data.event.topic || "";
    keyVersesInput.value = (data.event.keyVerses || []).join(", ");
    facilitatorId.value = data.members.find((m) => m.role === "FACILITATOR")?.id ?? null;
    coFacilitatorId.value = data.members.find((m) => m.role === "CO_FACILITATOR")?.id ?? null;
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
}

function setFacilitator(id) {
  facilitatorId.value = id;
  if (coFacilitatorId.value === id) coFacilitatorId.value = null;
  const m = roster.value.find((r) => r.id === id);
  if (m) m.present = true;
}
function setCoFacilitator(id) {
  coFacilitatorId.value = id;
  if (facilitatorId.value === id) facilitatorId.value = null;
  const m = roster.value.find((r) => r.id === id);
  if (m) m.present = true;
}

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
    const isService = activeEvent.value.type === "SERVICE";
    const keyVerses = keyVersesInput.value.split(",").map((v) => v.trim()).filter(Boolean);
    const attendanceBody = {
      presentMemberIds,
      ...(isService
        ? { preacherName: preacherName.value || null, topic: topic.value || null, keyVerses }
        : { facilitatorId: facilitatorId.value, coFacilitatorId: coFacilitatorId.value }),
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
            topic: isService ? topic.value || undefined : undefined,
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

async function openView(id) {
  viewingEvent.value = id;
  loadingView.value = true;
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
    <header class="mb-4">
      <p class="text-xs tracking-wide text-stone-400 font-medium mb-1">Oaks Community Church</p>
      <h1 class="font-serif text-3xl font-normal text-slate-800">Attendance</h1>
    </header>

    <!-- Check-in screen for one event -->
    <div v-if="checkInMode">
      <div class="flex justify-between items-center flex-wrap gap-2.5 mb-3.5">
        <div>
          <p class="text-xs text-stone-400">{{ activeEvent ? formatDate(activeEvent.date) : "" }}</p>
          <h2 class="font-serif text-xl text-slate-800">{{ activeEvent?.name }}</h2>
        </div>
        <button :class="btnSecondary" @click="closeCheckIn">Back to events</button>
      </div>

      <div v-if="loadingRoster" class="text-stone-400 text-sm">Loading roster…</div>
      <template v-else>
        <div v-if="activeEvent.type === 'SERVICE'" class="flex gap-2.5 flex-wrap items-center mb-3.5 bg-white border border-stone-200 rounded-lg p-3.5">
          <label class="text-xs text-stone-400 font-medium">Preacher</label>
          <select v-model="preacherName" :class="inputCls">
            <option value="">—</option>
            <option v-for="p in PREACHER_OPTIONS" :key="p" :value="p">{{ p }}</option>
          </select>
          <label class="text-xs text-stone-400 font-medium">Sermon / Topic</label>
          <input v-model="topic" type="text" placeholder="Title of sermon or topic" :class="[inputCls, 'flex-1 min-w-[200px]']" />
          <label class="text-xs text-stone-400 font-medium">Key Verses</label>
          <input v-model="keyVersesInput" type="text" placeholder="e.g. John 3:16, Romans 8:28" :class="[inputCls, 'flex-1 min-w-[220px]']" />
        </div>

        <div class="flex gap-2.5 flex-wrap items-center mb-3.5">
          <input v-model="query" type="text" placeholder="Search by name" :class="[inputCls, 'flex-1 min-w-[180px]']" />
          <select v-model="category" :class="inputCls">
            <option>All</option>
            <option v-for="c in categories" :key="c" :value="c">{{ CATEGORY_LABELS[c] }}</option>
          </select>
          <button class="text-xs text-slate-800 hover:underline" @click="selectAllVisible">Select all shown</button>
          <button class="text-xs text-orange-700 hover:underline" @click="clearAllVisible">Clear all shown</button>
          <span class="ml-auto text-sm text-stone-400">{{ presentCount }} of {{ roster.length }} present</span>
        </div>

        <div class="bg-white border border-stone-200 rounded-lg max-h-[480px] overflow-y-auto mb-3.5">
          <table class="w-full border-collapse text-sm">
            <thead v-if="activeEvent.type === 'BIBLE_STUDY'">
              <tr class="text-left text-xs text-stone-400">
                <th class="p-2.5 font-medium" colspan="2"></th>
                <th class="p-2.5 font-medium text-center">Facilitator</th>
                <th class="p-2.5 font-medium text-center">Co-Facilitator</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in filteredRoster" :key="m.id" class="border-t border-stone-100 first:border-t-0">
                <td class="p-2.5 w-10">
                  <input type="checkbox" v-model="m.present" />
                </td>
                <td class="p-2.5">
                  {{ m.first }} {{ m.last }}
                  <span class="text-stone-400">— {{ CATEGORY_LABELS[m.category] }}</span>
                </td>
                <template v-if="activeEvent.type === 'BIBLE_STUDY'">
                  <td class="p-2.5 text-center">
                    <input type="radio" name="facilitator" :checked="facilitatorId === m.id" @change="setFacilitator(m.id)" />
                  </td>
                  <td class="p-2.5 text-center">
                    <input type="radio" name="co-facilitator" :checked="coFacilitatorId === m.id" @change="setCoFacilitator(m.id)" />
                  </td>
                </template>
              </tr>
              <tr v-if="filteredRoster.length === 0">
                <td :colspan="activeEvent.type === 'BIBLE_STUDY' ? 4 : 2" class="text-center py-7 text-stone-400">No members match these filters.</td>
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
            <option value="SERVICE">Sunday Celebration</option>
            <option value="BIBLE_STUDY">Bible Study</option>
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
        <select v-model="eventTypeFilter" :class="inputCls">
          <option value="All">All events</option>
          <option value="SERVICE">Sunday Celebration</option>
          <option value="BIBLE_STUDY">Bible Study</option>
        </select>
        <select v-model="sessionFilter" :class="inputCls">
          <option value="All">All sessions</option>
          <option value="MORNING">Morning</option>
          <option value="AFTERNOON">Afternoon</option>
        </select>
      </div>

      <div class="bg-white border border-stone-200 rounded-lg max-h-[480px] overflow-y-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="text-left text-xs text-stone-400">
              <th class="p-2.5 font-medium">Date</th>
              <th class="p-2.5 font-medium">Event</th>
              <th class="p-2.5 font-medium">Session</th>
              <th class="p-2.5 font-medium">Present</th>
              <th class="p-2.5"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in filteredEvents" :key="e.id" class="border-t border-stone-100">
              <td class="p-2.5">{{ formatDate(e.date) }}</td>
              <td class="p-2.5">{{ e.name }}</td>
              <td class="p-2.5 text-stone-400">
                {{ e.type === "BIBLE_STUDY" ? "—" : (e.session === "AFTERNOON" ? "Afternoon" : "Morning") }}
              </td>
              <td class="p-2.5">{{ e.presentCount }}</td>
              <td class="p-2.5 text-right whitespace-nowrap">
                <button class="text-xs text-slate-800 ml-2.5 hover:underline" @click="openView(e.id)">View</button>
                <button class="text-xs text-slate-800 ml-2.5 hover:underline" @click="openCheckIn(e.id)">
                  {{ e.presentCount > 0 ? "Edit" : "Take attendance" }}
                </button>
                <button class="text-xs text-orange-700 ml-2.5 hover:underline" @click="removeEvent(e)">Delete</button>
              </td>
            </tr>
            <tr v-if="!loadingEvents && filteredEvents.length === 0">
              <td colspan="5" class="text-center py-7 text-stone-400">No events match these filters.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- View details modal -->
    <div v-if="viewingEvent" class="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-20" @click.self="closeView">
      <div class="bg-white rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5">
        <div v-if="loadingView" class="text-stone-400 text-sm">Loading…</div>
        <template v-else-if="viewDetail">
          <div class="flex justify-between items-start mb-3.5">
            <div>
              <p class="text-xs text-stone-400">{{ formatDate(viewDetail.event.date) }}</p>
              <h2 class="font-serif text-xl text-slate-800">{{ viewDetail.event.name }}</h2>
            </div>
            <button class="text-stone-400 hover:text-slate-800 text-sm" @click="closeView">Close</button>
          </div>

          <dl class="grid gap-1.5 text-sm mb-3.5">
            <div v-if="viewDetail.event.type === 'SERVICE'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Session</dt>
              <dd>{{ viewDetail.event.session === "AFTERNOON" ? "Afternoon" : "Morning" }}</dd>
            </div>
            <div v-if="viewDetail.event.type === 'SERVICE'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Preacher</dt>
              <dd>{{ viewDetail.event.preacherName || "—" }}</dd>
            </div>
            <div v-if="viewDetail.event.type === 'SERVICE'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Sermon / Topic</dt>
              <dd>{{ viewDetail.event.topic || "—" }}</dd>
            </div>
            <div v-if="viewDetail.event.type === 'SERVICE'" class="flex gap-2">
              <dt class="text-stone-400 w-28 shrink-0">Key Verses</dt>
              <dd>{{ viewDetail.event.keyVerses?.length ? viewDetail.event.keyVerses.join(", ") : "—" }}</dd>
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

          <p class="text-xs text-stone-400 font-medium mb-1.5">
            Attendees ({{ viewDetail.members.filter((m) => m.present).length }})
          </p>
          <div class="border border-stone-200 rounded-lg max-h-64 overflow-y-auto">
            <table class="w-full border-collapse text-sm">
              <tbody>
                <tr v-for="m in viewDetail.members.filter((m) => m.present)" :key="m.id" class="border-t border-stone-100 first:border-t-0">
                  <td class="p-2">{{ m.first }} {{ m.last }}</td>
                  <td class="p-2 text-stone-400">{{ CATEGORY_LABELS[m.category] }}</td>
                  <td class="p-2 text-right">
                    <span v-if="m.role === 'FACILITATOR'" class="text-xs font-medium bg-slate-100 text-slate-800 rounded-full px-2 py-0.5">Facilitator</span>
                    <span v-else-if="m.role === 'CO_FACILITATOR'" class="text-xs font-medium bg-slate-100 text-slate-800 rounded-full px-2 py-0.5">Co-Facilitator</span>
                  </td>
                </tr>
                <tr v-if="viewDetail.members.filter((m) => m.present).length === 0">
                  <td colspan="3" class="text-center py-5 text-stone-400">No attendees recorded.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
