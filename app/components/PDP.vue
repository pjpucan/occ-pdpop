<script setup>
import { ref, computed, onMounted, reactive } from "vue";
import * as XLSX from "xlsx";

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
onMounted(fetchMembers);

// --- filters -----------------------------------------------------------
const query = ref("");
const category = ref("All");
const bibleStudy = ref("All");
const volunteerOnly = ref(false);

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
  if (volunteerOnly.value && !m.volunteer) return false;
  return true;
}));

const stats = computed(() => ({
  total: members.value.length,
  regular: members.value.filter((m) => !m.isVisitor).length,
  inBibleStudy: members.value.filter((m) => m.bibleStudyGroup).length,
  visitors: members.value.filter((m) => m.isVisitor).length,
}));

const hasFilters = computed(
  () => query.value || category.value !== "All" || bibleStudy.value !== "All" || volunteerOnly.value
);
function clearFilters() {
  query.value = ""; category.value = "All"; bibleStudy.value = "All"; volunteerOnly.value = false;
}

// --- add member ----------------------------------------------------------
const showAddForm = ref(false);
const addForm = reactive(blankForm());
const addError = ref("");

function blankForm() {
  return {
    first: "", last: "", category: "KIDS", birthday: "",
    bibleStudyGroup: "", volunteer: false, ministry: "",
    isVisitor: false, activeLeader: "", potentialLeader: "",
  };
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
    await $fetch("/api/members", { method: "POST", body: addForm });
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
    bibleStudyGroup: m.bibleStudyGroup || "", volunteer: m.volunteer, ministry: m.ministry || "",
    isVisitor: m.isVisitor, activeLeader: m.activeLeader || "", potentialLeader: m.potentialLeader || "",
  });
}
function cancelEdit() {
  editingId.value = null;
}
async function saveEdit(id) {
  try {
    await $fetch(`/api/members/${id}`, { method: "PATCH", body: editForm });
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
    Visitor: m.isVisitor ? "Yes" : "No",
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
</script>

<template>
  <div class="font-sans text-stone-800">
    <header class="flex justify-between items-end flex-wrap gap-3.5 mb-4">
      <div>
        <p class="text-xs tracking-wide text-stone-400 font-medium mb-1">Oaks Community Church</p>
        <h1 class="font-serif text-3xl font-normal text-slate-800">PDPop Database</h1>
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

    <form v-if="showAddForm" class="flex flex-col gap-2.5 bg-white border border-stone-200 rounded-lg p-3.5 mb-4" @submit.prevent="submitAdd">
      <div class="flex gap-2.5 flex-wrap items-center">
        <input v-model="addForm.first" placeholder="First name" :class="inputCls" />
        <input v-model="addForm.last" placeholder="Last name" :class="inputCls" />
        <select v-model="addForm.category" :class="inputCls">
          <option v-for="c in CATEGORY_ORDER" :key="c" :value="c">{{ CATEGORY_LABELS[c] }}</option>
        </select>
        <input v-model="addForm.birthday" type="date" title="Birthday" :class="inputCls" />
      </div>
      <div class="flex gap-2.5 flex-wrap items-center">
        <input v-model="addForm.bibleStudyGroup" placeholder="Bible study group (optional)" :class="inputCls" />
        <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
          <input type="checkbox" v-model="addForm.volunteer" /> Volunteer
        </label>
        <input v-model="addForm.ministry" placeholder="Ministry" :disabled="!addForm.volunteer" :class="[inputCls, 'disabled:bg-stone-100 disabled:text-stone-400']" />
        <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
          <input type="checkbox" v-model="addForm.isVisitor" /> Visitor
        </label>
      </div>
      <p v-if="addError" class="text-orange-700 text-sm m-0">{{ addError }}</p>
      <button type="submit" :class="[btnPrimary, 'self-start']">Save member</button>
    </form>

    <section class="grid gap-3 mb-5" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
      <div class="bg-white border border-stone-200 rounded-lg p-3.5">
        <p class="text-xs text-stone-400 mb-1.5">Total population</p>
        <p class="font-serif text-2xl text-slate-800">{{ stats.total }}</p>
      </div>
      <div class="bg-white border border-stone-200 rounded-lg p-3.5">
        <p class="text-xs text-stone-400 mb-1.5">Regular gathering</p>
        <p class="font-serif text-2xl text-slate-800">{{ stats.regular }}</p>
      </div>
      <div class="bg-white border border-stone-200 rounded-lg p-3.5">
        <p class="text-xs text-stone-400 mb-1.5">In Bible study</p>
        <p class="font-serif text-2xl text-slate-800">{{ stats.inBibleStudy }}</p>
      </div>
      <div class="bg-white border border-stone-200 rounded-lg p-3.5">
        <p class="text-xs text-stone-400 mb-1.5">Visitors</p>
        <p class="font-serif text-2xl text-slate-800">{{ stats.visitors }}</p>
      </div>
    </section>

    <div class="flex gap-2.5 flex-wrap items-center mb-3.5">
      <input v-model="query" type="text" placeholder="Search by name" :class="[inputCls, 'flex-1 min-w-[180px]']" />
      <select v-model="category" :class="inputCls">
        <option>All</option>
        <option v-for="c in categories" :key="c" :value="c">{{ CATEGORY_LABELS[c] }}</option>
      </select>
      <select v-model="bibleStudy" :class="inputCls">
        <option>All</option>
        <option>In a group</option>
        <option>Not in a group</option>
      </select>
      <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
        <input v-model="volunteerOnly" type="checkbox" /> Volunteers only
      </label>
      <button v-if="hasFilters" class="text-orange-700 text-sm hover:underline" @click="clearFilters">
        Clear filters
      </button>
      <span class="ml-auto text-sm text-stone-400">
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
            <th class="p-2.5 font-medium">Visitor</th>
            <th class="p-2.5"></th>
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
                <span v-if="m.bibleStudyGroup" class="text-emerald-700">{{ m.bibleStudyGroup }}</span>
                <span v-else class="text-stone-300">—</span>
              </td>
              <td class="p-2.5">
                <span v-if="m.volunteer">{{ m.ministry }}</span>
                <span v-else class="text-stone-300">—</span>
              </td>
              <td class="p-2.5">
                <span v-if="m.isVisitor" class="text-xs font-medium bg-orange-50 text-orange-700 rounded-full px-2 py-0.5">Visitor</span>
                <span v-else class="text-stone-300">Member</span>
              </td>
              <td class="p-2.5 text-right whitespace-nowrap">
                <button class="text-xs text-slate-800 ml-2.5 hover:underline" @click="startEdit(m)">Edit</button>
                <button class="text-xs text-orange-700 ml-2.5 hover:underline" @click="deleteMember(m)">Delete</button>
              </td>
            </tr>
            <tr v-else class="bg-stone-50">
              <td colspan="7" class="p-2.5">
                <div class="flex gap-2.5 flex-wrap items-center">
                  <input v-model="editForm.first" placeholder="First name" :class="inputCls" />
                  <input v-model="editForm.last" placeholder="Last name" :class="inputCls" />
                  <select v-model="editForm.category" :class="inputCls">
                    <option v-for="c in CATEGORY_ORDER" :key="c" :value="c">{{ CATEGORY_LABELS[c] }}</option>
                  </select>
                  <input v-model="editForm.birthday" type="date" title="Birthday" :class="inputCls" />
                  <input v-model="editForm.bibleStudyGroup" placeholder="Bible study group" :class="inputCls" />
                  <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
                    <input type="checkbox" v-model="editForm.volunteer" /> Volunteer
                  </label>
                  <input v-model="editForm.ministry" placeholder="Ministry" :disabled="!editForm.volunteer" :class="[inputCls, 'disabled:bg-stone-100 disabled:text-stone-400']" />
                  <label class="flex items-center gap-1.5 text-sm border border-stone-300 rounded-md px-3 py-2 bg-white">
                    <input type="checkbox" v-model="editForm.isVisitor" /> Visitor
                  </label>
                  <button :class="btnPrimary" @click="saveEdit(m.id)">Save</button>
                  <button :class="btnSecondary" @click="cancelEdit">Cancel</button>
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
  </div>
</template>
