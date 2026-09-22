<script setup>
import { ref, computed, onMounted, onUnmounted, reactive } from "vue";
import * as XLSX from "xlsx";

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
// Tailwind scans for literal class strings at build time, so a dynamically
// built class name (`bg-${color}-700`) would get purged. Mapping to a fixed
// set of full class names, like this, is the standard workaround.
const CATEGORY_DOT = {
  KIDS: "bg-orange-700", TWEENS: "bg-orange-700", YTH: "bg-purple-600", NXT: "bg-purple-600",
  SOLO: "bg-sky-700", SENIOR_ADULT: "bg-emerald-700", YOUNG_COUPLES: "bg-amber-600",
  COUPLES: "bg-amber-600", LEGACY: "bg-emerald-700", UNASSIGNED: "bg-stone-400",
};

// --- data: loaded from the API ---------------------------------------
const members = ref([]);
const loading = ref(true);
const errorMsg = ref("");
const leaders = ref([]);

// Teleported + fixed-position so it isn't clipped by the table's
// overflow-y-auto scroll container.
const leaderTooltip = ref(null);
function toggleLeaderTooltip(m, event) {
  if (leaderTooltip.value?.id === m.id) {
    leaderTooltip.value = null;
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  leaderTooltip.value = { id: m.id, name: m.bibleStudyGroup, x: rect.left, y: rect.top - 4 };
}
function closeLeaderTooltip() {
  leaderTooltip.value = null;
}

async function fetchMembers() {
  loading.value = true;
  try {
    members.value = await $fetch("/api/members");
    errorMsg.value = "";
  } catch (e) {
    errorMsg.value = "Couldn't load members. Is the database running?";
  } finally {
    loading.value = false;
  }
}
async function fetchLeaders() {
  leaders.value = await $fetch("/api/bible-study-groups");
}
onMounted(() => {
  fetchMembers();
  fetchLeaders();
  window.addEventListener("click", closeLeaderTooltip);
});
onUnmounted(() => {
  window.removeEventListener("click", closeLeaderTooltip);
});

// Ministry dropdown is sourced from whatever ministries are already in use —
// "General" was retired and is deliberately excluded.
const ministryOptions = computed(() => {
  const set = new Set();
  members.value.forEach((m) => { if (m.ministry && m.ministry !== "General") set.add(m.ministry); });
  return [...set].sort();
});
const memberFullNames = computed(() => members.value.map((m) => `${m.first} ${m.last}`));
// "Couples" and "NXT" are legacy topical group names from before groups were
// tracked by leader — not people, so they're excluded from the leader search.
const LEGACY_GROUP_NAMES = ["Couples", "NXT"];
const leaderNames = computed(() => leaders.value
  .map((g) => g.name)
  .filter((name) => !LEGACY_GROUP_NAMES.includes(name)));

// --- filters -----------------------------------------------------------
const query = ref("");
const category = ref("All");
const bibleStudy = ref("All");
const ministryFilter = ref("All");
const guestFilter = ref("All");

const categories = computed(() => {
  const present = new Set(members.value.map((m) => m.category));
  return CATEGORY_ORDER.filter((c) => present.has(c));
});

const filtered = computed(() => members.value.filter((m) => {
  const fullName = `${m.first} ${m.last}`.toLowerCase();
  if (query.value && !fullName.includes(query.value.toLowerCase())) return false;
  if (category.value !== "All" && m.category !== category.value) return false;
  if (bibleStudy.value === "In a group" && !m.bibleStudyGroup) return false;
  if (bibleStudy.value === "Not in a group" && m.bibleStudyGroup) return false;
  if (ministryFilter.value !== "All" && m.ministry !== ministryFilter.value) return false;
  if (guestFilter.value === "Guest" && !m.isVisitor) return false;
  if (guestFilter.value === "Member" && m.isVisitor) return false;
  return true;
}));

const stats = computed(() => ({
  total: members.value.length,
  regular: members.value.filter((m) => !m.isVisitor).length,
  inBibleStudy: members.value.filter((m) => m.bibleStudyGroup).length,
  guests: members.value.filter((m) => m.isVisitor).length,
}));

const hasFilters = computed(
  () => query.value || category.value !== "All" || bibleStudy.value !== "All"
    || ministryFilter.value !== "All" || guestFilter.value !== "All"
);
function clearFilters() {
  query.value = ""; category.value = "All"; bibleStudy.value = "All";
  ministryFilter.value = "All"; guestFilter.value = "All";
}

// --- add member ----------------------------------------------------------
const showAddForm = ref(false);
const addForm = reactive(blankForm());
const addError = ref("");

function blankForm() {
  return {
    first: "", last: "", category: "KIDS", birthday: "",
    inBibleStudy: false, bibleStudyGroup: "", volunteer: false, ministry: "",
    isVisitor: false, guestType: "MEMBER",
    isFirstTimer: false, isWalkIn: false, invitedByName: "",
    activeLeader: "", potentialLeader: "",
  };
}

// A Bible-study-only guest doesn't need the full member profile.
function isBibleStudyGuest(form) {
  return form.isVisitor && form.guestType === "BIBLE_STUDY";
}

// Fields hidden for a Bible-study-only guest aren't meaningful, so they're
// normalized before hitting the API rather than sent as whatever was left
// over in the form.
function buildPayload(form) {
  const bsGuest = isBibleStudyGuest(form);
  return {
    ...form,
    volunteer: bsGuest ? false : form.volunteer,
    ministry: bsGuest ? "" : form.ministry,
    bibleStudyGroup: (bsGuest || !form.inBibleStudy) ? "" : form.bibleStudyGroup,
  };
}

function resetGuestFields(form) {
  form.guestType = "MEMBER";
  form.isFirstTimer = false;
  form.isWalkIn = false;
  form.invitedByName = "";
}

function formatBirthday(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function submitAdd() {
  if (!addForm.first.trim() || !addForm.last.trim()) {
    addError.value = "First and last name are required.";
    return;
  }
  addError.value = "";
  try {
    await $fetch("/api/members", { method: "POST", body: buildPayload(addForm) });
    Object.assign(addForm, blankForm());
    showAddForm.value = false;
    await fetchMembers();
  } catch (e) {
    addError.value = "Couldn't save that member. Try again.";
  }
}

// --- inline edit -----------------------------------------------------------
const editingId = ref(null);
const editForm = reactive(blankForm());

function startEdit(m) {
  editingId.value = m.id;
  Object.assign(editForm, {
    first: m.first, last: m.last, category: m.category,
    birthday: m.birthday ? m.birthday.slice(0, 10) : "",
    inBibleStudy: !!m.bibleStudyGroup, bibleStudyGroup: m.bibleStudyGroup || "",
    volunteer: m.volunteer, ministry: m.ministry || "",
    isVisitor: m.isVisitor, guestType: m.guestType || "MEMBER",
    isFirstTimer: m.isFirstTimer || false, isWalkIn: m.isWalkIn || false, invitedByName: m.invitedByName || "",
    activeLeader: m.activeLeader || "", potentialLeader: m.potentialLeader || "",
  });
}
function cancelEdit() {
  editingId.value = null;
}
async function saveEdit(id) {
  try {
    await $fetch(`/api/members/${id}`, { method: "PATCH", body: buildPayload(editForm) });
    editingId.value = null;
    await fetchMembers();
  } catch (e) {
    alert("Couldn't save changes. Try again.");
  }
}

// --- delete -------------------------------------------------------------------
async function deleteMember(m) {
  if (!confirm(`Remove ${m.first} ${m.last} from PDP? This can't be undone.`)) return;
  try {
    await $fetch(`/api/members/${m.id}`, { method: "DELETE" });
    await fetchMembers();
  } catch (e) {
    alert("Couldn't delete that member. Try again.");
  }
}

// --- export ---------------------------------------------------------------------
function exportToExcel() {
  const rows = filtered.value.map((m) => ({
    "First Name": m.first, "Last Name": m.last, Birthday: formatBirthday(m.birthday),
    Category: CATEGORY_LABELS[m.category] || m.category,
    "Bible Study Group": m.bibleStudyGroup || "", Volunteer: m.volunteer ? "Yes" : "No",
    Ministry: m.ministry || "",
    "Leader Status": m.activeLeader ? `Active (${m.activeLeader})` : (m.potentialLeader ? `Potential (${m.potentialLeader})` : ""),
    Guest: m.isVisitor ? "Yes" : "No",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{wch:16},{wch:16},{wch:11},{wch:14},{wch:18},{wch:11},{wch:14},{wch:18},{wch:9}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, category.value === "All" ? "PDP Export" : (CATEGORY_LABELS[category.value] || "Export"));
  XLSX.writeFile(wb, `PDP-export-${new Date().toISOString().slice(0,10)}.xlsx`);
}

// shared utility strings, kept as constants so the template stays readable
const inputCls = "border border-stone-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-800/20";
const btnPrimary = "bg-slate-800 text-stone-50 rounded-md px-4 py-2.5 text-sm font-medium hover:bg-slate-700";
const btnSecondary = "bg-white text-slate-800 border border-stone-300 rounded-md px-4 py-2.5 text-sm font-medium hover:bg-stone-50";
const btnEdit = "text-xs text-white bg-slate-800 hover:bg-slate-700 rounded px-2 py-1 ml-2.5";
const btnDelete = "text-xs text-white bg-red-600 hover:bg-red-700 rounded px-2 py-1 ml-2.5";
</script>

<template>
  <div class="font-sans text-stone-800">
    <datalist id="member-names">
      <option v-for="name in memberFullNames" :key="name" :value="name" />
    </datalist>
    <datalist id="leader-names">
      <option v-for="name in leaderNames" :key="name" :value="name" />
    </datalist>

    <header class="flex justify-between items-end flex-wrap gap-3.5 mb-4">
      <div>
        <p class="text-xs tracking-wide text-stone-400 font-medium mb-1">Oaks Community Church</p>
        <h1 class="font-semibold text-3xl font-normal text-slate-800">PDPop Database</h1>
      </div>
      <div class="flex gap-2.5">
        <button :class="btnSecondary" @click="showAddForm = !showAddForm">
          {{ showAddForm ? "Cancel" : "Add member" }}
        </button>
        <button :class="btnPrimary" @click="exportToExcel">
          Export {{ hasFilters ? `${filtered.length} filtered` : "all" }} to Excel
        </button>
      </div>
    </header>

    <p v-if="errorMsg" class="bg-orange-50 text-orange-800 px-3.5 py-2.5 rounded-md text-sm mb-3.5">
      {{ errorMsg }}
    </p>

    <form v-if="showAddForm" class="flex flex-col gap-3.5 bg-white border border-stone-200 rounded-lg p-3.5 mb-4" @submit.prevent="submitAdd">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="block text-xs text-stone-400 font-medium mb-1.5">First name</label>
          <input v-model="addForm.first" :class="[inputCls, 'w-full']" />
        </div>
        <div>
          <label class="block text-xs text-stone-400 font-medium mb-1.5">Last name</label>
          <input v-model="addForm.last" :class="[inputCls, 'w-full']" />
        </div>
        <div>
          <label class="block text-xs text-stone-400 font-medium mb-1.5">Birthday</label>
          <input v-model="addForm.birthday" type="date" :class="[inputCls, 'w-full']" />
        </div>
        <div>
          <label class="block text-xs text-stone-400 font-medium mb-1.5">Category</label>
          <select v-model="addForm.category" :class="[inputCls, 'w-full']">
            <option v-for="c in CATEGORY_ORDER" :key="c" :value="c">{{ CATEGORY_LABELS[c] }}</option>
          </select>
        </div>
        <template v-if="!isBibleStudyGuest(addForm)">
          <div>
            <label class="block text-xs text-stone-400 font-medium mb-1.5">In Bible study?</label>
            <select v-model="addForm.inBibleStudy" :class="[inputCls, 'w-full']">
              <option :value="false">No</option>
              <option :value="true">Yes</option>
            </select>
          </div>
          <div v-if="addForm.inBibleStudy">
            <label class="block text-xs text-stone-400 font-medium mb-1.5">Bible study leader</label>
            <input
              v-model="addForm.bibleStudyGroup"
              list="leader-names"
              placeholder="Search leader…"
              :class="[inputCls, 'w-full']"
            />
          </div>
          <div>
            <label class="block text-xs text-stone-400 font-medium mb-1.5">Volunteer?</label>
            <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
              <input type="checkbox" v-model="addForm.volunteer" /> Volunteer
            </label>
          </div>
          <div>
            <label class="block text-xs text-stone-400 font-medium mb-1.5">Ministry</label>
            <select v-model="addForm.ministry" :disabled="!addForm.volunteer" :class="[inputCls, 'w-full disabled:bg-stone-100 disabled:text-stone-400']">
              <option value="">Ministry</option>
              <option v-for="m in ministryOptions" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
        </template>
        <div>
          <label class="block text-xs text-stone-400 font-medium mb-1.5">Guest?</label>
          <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
            <input type="checkbox" v-model="addForm.isVisitor" @change="!addForm.isVisitor && resetGuestFields(addForm)" /> Guest
          </label>
        </div>
        <div v-if="addForm.isVisitor">
          <label class="block text-xs text-stone-400 font-medium mb-1.5">Guest type</label>
          <select v-model="addForm.guestType" :class="[inputCls, 'w-full']">
            <option value="MEMBER">Member</option>
            <option value="BIBLE_STUDY">Bible Study</option>
            <option value="VISITOR">Visitor</option>
          </select>
        </div>
        <template v-if="addForm.isVisitor && !isBibleStudyGuest(addForm)">
          <div>
            <label class="block text-xs text-stone-400 font-medium mb-1.5">First timer?</label>
            <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
              <input type="checkbox" v-model="addForm.isFirstTimer" /> First Timer
            </label>
          </div>
          <template v-if="addForm.isFirstTimer">
            <div>
              <label class="block text-xs text-stone-400 font-medium mb-1.5">Walk-in?</label>
              <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
                <input type="checkbox" v-model="addForm.isWalkIn" /> Walk-in
              </label>
            </div>
            <div v-if="!addForm.isWalkIn">
              <label class="block text-xs text-stone-400 font-medium mb-1.5">Invited by</label>
              <input
                v-model="addForm.invitedByName"
                list="member-names"
                placeholder="Invited by…"
                :class="[inputCls, 'w-full']"
              />
            </div>
          </template>
        </template>
      </div>
      <p v-if="addError" class="text-orange-700 text-sm m-0">{{ addError }}</p>
      <button type="submit" :class="[btnPrimary, 'self-start']">Save member</button>
    </form>

    <section class="grid gap-3 mb-5" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
      <div class="bg-white border border-stone-200 rounded-lg p-3.5">
        <p class="text-xs text-stone-400 mb-1.5">Total population</p>
        <p class="text-2xl text-slate-800">{{ stats.total }}</p>
      </div>
      <div class="bg-white border border-stone-200 rounded-lg p-3.5">
        <p class="text-xs text-stone-400 mb-1.5">Regular gathering</p>
        <p class="text-2xl text-slate-800">{{ stats.regular }}</p>
      </div>
      <div class="bg-white border border-stone-200 rounded-lg p-3.5">
        <p class="text-xs text-stone-400 mb-1.5">In Bible study</p>
        <p class="text-2xl text-slate-800">{{ stats.inBibleStudy }}</p>
      </div>
      <div class="bg-white border border-stone-200 rounded-lg p-3.5">
        <p class="text-xs text-stone-400 mb-1.5">Guests</p>
        <p class="text-2xl text-slate-800">{{ stats.guests }}</p>
      </div>
    </section>

    <div class="flex gap-2.5 flex-wrap items-center mb-3.5">
      <input v-model="query" type="text" placeholder="Search by name" :class="[inputCls, 'flex-1 min-w-[180px]']" />
      <select v-model="category" :class="inputCls">
        <option value="All">Category</option>
        <option v-for="c in categories" :key="c" :value="c">{{ CATEGORY_LABELS[c] }}</option>
      </select>
      <select v-model="bibleStudy" :class="inputCls">
        <option value="All">Bible study</option>
        <option>In a group</option>
        <option>Not in a group</option>
      </select>
      <select v-model="ministryFilter" :class="inputCls">
        <option value="All">Ministry</option>
        <option v-for="m in ministryOptions" :key="m" :value="m">{{ m }}</option>
      </select>
      <select v-model="guestFilter" :class="inputCls">
        <option value="All">Guest</option>
        <option value="Guest">Guest</option>
        <option value="Member">Member</option>
      </select>
      <span class="ml-auto flex items-center text-sm text-stone-400 flex flex-col w-[135px]">
        <button v-if="hasFilters" class="text-orange-700 hover:underline" @click="clearFilters">
          Clear filters
        </button>
        {{ loading ? "Loading…" : `${filtered.length} of ${members.length} members` }}
      </span>
    </div>

    <div class="bg-white border border-stone-200 rounded-lg max-h-[480px] overflow-y-auto">
      <table class="w-full border-collapse text-sm">
        <thead class="sticky top-0 z-10 bg-white shadow-[0_1px_0_theme(colors.stone.200)]">
          <tr class="text-left text-xs text-stone-400">
            <th class="p-2.5 font-medium">Name</th>
            <th class="p-2.5 font-medium">Birthday</th>
            <th class="p-2.5 font-medium">Category</th>
            <th class="p-2.5 font-medium">Bible study</th>
            <th class="p-2.5 font-medium">Ministry</th>
            <th class="p-2.5 font-medium">Guest</th>
            <th class="p-2.5 font-medium text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="m in filtered" :key="m.id">
            <tr v-if="editingId !== m.id" class="border-t border-stone-100">
              <td class="p-2.5">{{ m.first }} {{ m.last }}</td>
              <td class="p-2.5">
                <span v-if="m.birthday">{{ formatBirthday(m.birthday) }}</span>
                <span v-else class="text-stone-300">—</span>
              </td>
              <td class="p-2.5">
                <span class="inline-block w-1.5 h-1.5 rounded-full mr-1.5" :class="CATEGORY_DOT[m.category]"></span>
                {{ CATEGORY_LABELS[m.category] }}
              </td>
              <td class="p-2.5">
                <button
                  v-if="m.bibleStudyGroup"
                  type="button"
                  class="inline-flex items-center gap-1 text-emerald-700 font-medium"
                  @click.stop="toggleLeaderTooltip(m, $event)"
                >
                  Yes
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" class="bi bi-info-circle-fill" viewBox="0 0 16 16">
                    <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.469l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/>
                  </svg>
                </button>
                <span v-else class="text-stone-300">—</span>
              </td>
              <td class="p-2.5">
                <span v-if="m.volunteer">{{ m.ministry }}</span>
                <span v-else class="text-stone-300">—</span>
              </td>
              <td class="p-2.5">
                <span v-if="m.isVisitor" class="text-xs font-medium bg-orange-50 text-orange-700 rounded-full px-2 py-0.5">Guest</span>
                <span v-else class="text-stone-300">Member</span>
              </td>
              <td class="p-2.5 text-center whitespace-nowrap">
                <template v-if="isAdmin">
                  <button :class="btnEdit" @click="startEdit(m)">Edit</button>
                  <button :class="btnDelete" @click="deleteMember(m)">Delete</button>
                </template>
              </td>
            </tr>
            <tr v-else class="bg-stone-50">
              <td colspan="7" class="p-2.5">
                <div class="flex flex-col gap-2.5">
                  <div class="flex gap-2.5 flex-wrap items-center">
                    <input v-model="editForm.first" placeholder="First name" :class="inputCls" />
                    <input v-model="editForm.last" placeholder="Last name" :class="inputCls" />
                    <input v-model="editForm.birthday" type="date" title="Birthday" :class="inputCls" />
                    <select v-model="editForm.category" :class="inputCls">
                      <option v-for="c in CATEGORY_ORDER" :key="c" :value="c">{{ CATEGORY_LABELS[c] }}</option>
                    </select>
                  </div>
                  <div v-if="!isBibleStudyGuest(editForm)" class="flex gap-2.5 flex-wrap items-center">
                    <label class="text-xs text-stone-400 font-medium">In Bible study?</label>
                    <select v-model="editForm.inBibleStudy" :class="inputCls">
                      <option :value="false">No</option>
                      <option :value="true">Yes</option>
                    </select>
                    <input
                      v-if="editForm.inBibleStudy"
                      v-model="editForm.bibleStudyGroup"
                      list="leader-names"
                      placeholder="Search leader…"
                      :class="[inputCls, 'flex-1 min-w-[180px]']"
                    />
                    <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
                      <input type="checkbox" v-model="editForm.volunteer" /> Volunteer
                    </label>
                    <select v-model="editForm.ministry" :disabled="!editForm.volunteer" :class="[inputCls, 'disabled:bg-stone-100 disabled:text-stone-400']">
                      <option value="">Ministry</option>
                      <option v-for="mn in ministryOptions" :key="mn" :value="mn">{{ mn }}</option>
                    </select>
                  </div>
                  <div class="flex gap-2.5 flex-wrap items-center">
                    <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
                      <input type="checkbox" v-model="editForm.isVisitor" @change="!editForm.isVisitor && resetGuestFields(editForm)" /> Guest
                    </label>
                    <select v-if="editForm.isVisitor" v-model="editForm.guestType" :class="inputCls">
                      <option value="MEMBER">Member</option>
                      <option value="BIBLE_STUDY">Bible Study</option>
                      <option value="VISITOR">Visitor</option>
                    </select>
                    <template v-if="editForm.isVisitor && !isBibleStudyGuest(editForm)">
                      <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
                        <input type="checkbox" v-model="editForm.isFirstTimer" /> First Timer
                      </label>
                      <template v-if="editForm.isFirstTimer">
                        <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
                          <input type="checkbox" v-model="editForm.isWalkIn" /> Walk-in
                        </label>
                        <input
                          v-if="!editForm.isWalkIn"
                          v-model="editForm.invitedByName"
                          list="member-names"
                          placeholder="Invited by…"
                          :class="[inputCls, 'flex-1 min-w-[180px]']"
                        />
                      </template>
                    </template>
                  </div>
                  <div class="flex gap-2.5">
                    <button :class="btnPrimary" @click="saveEdit(m.id)">Save</button>
                    <button :class="btnSecondary" @click="cancelEdit">Cancel</button>
                  </div>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="!loading && filtered.length === 0">
            <td colspan="7" class="text-center py-7 text-stone-400">No members match these filters.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Teleport to="body">
      <div
        v-if="leaderTooltip"
        class="fixed z-50 -translate-y-full whitespace-nowrap flex flex-col items-center"
        :style="{ left: `${leaderTooltip.x}px`, top: `${leaderTooltip.y}px` }"
      >
        <div class="bg-slate-900 text-white text-xs font-bold rounded-lg px-3 py-2">
          Leader: {{ leaderTooltip.name }}
        </div>
        <div class="w-2.5 h-2.5 bg-slate-900 rotate-45 -mt-1.5"></div>
      </div>
    </Teleport>
  </div>
</template>
