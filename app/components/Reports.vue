<script setup>
import { ref, computed, watch, onMounted } from "vue";

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

const month = ref(new Date().toISOString().slice(0, 7));
const report = ref(null);
const loading = ref(true);

async function fetchReport() {
  loading.value = true;
  report.value = await $fetch("/api/reports/monthly", { query: { month: month.value } });
  loading.value = false;
}
onMounted(fetchReport);
watch(month, fetchReport);

function monthLabel(m) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function formatWeekDate(iso) {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const categoryRows = computed(() => {
  if (!report.value) return [];
  return CATEGORY_ORDER
    .filter((c) => report.value.services.byCategory[c])
    .map((c) => ({ code: c, label: CATEGORY_LABELS[c], count: report.value.services.byCategory[c], source: "services" }));
});
const bibleStudyCategoryRows = computed(() => {
  if (!report.value) return [];
  return CATEGORY_ORDER
    .filter((c) => report.value.bibleStudy.byCategory[c])
    .map((c) => ({ code: c, label: CATEGORY_LABELS[c], count: report.value.bibleStudy.byCategory[c], source: "bibleStudy" }));
});

// --- view members modal ------------------------------------------------------------
const viewingCategory = ref(null);
const viewingMembers = computed(() => {
  if (!viewingCategory.value || !report.value) return [];
  return report.value[viewingCategory.value.source].byCategoryMembers[viewingCategory.value.code] || [];
});
function openView(row) {
  viewingCategory.value = row;
}
function closeView() {
  viewingCategory.value = null;
}

// --- view a Sunday's attendees modal -------------------------------------------
const viewingSunday = ref(null);
const sundaySearch = ref("");
const sundayFilter = ref("ALL"); // ALL | MORNING | AFTERNOON | BOTH
const sundayAttendees = computed(() => {
  if (!viewingSunday.value) return [];
  const q = sundaySearch.value.trim().toLowerCase();
  return viewingSunday.value.attendees.filter((a) => {
    if (q && !`${a.first} ${a.last}`.toLowerCase().includes(q)) return false;
    if (sundayFilter.value === "MORNING") return a.morning;
    if (sundayFilter.value === "AFTERNOON") return a.afternoon;
    if (sundayFilter.value === "BOTH") return a.morning && a.afternoon;
    return true;
  });
});
function openSunday(row) {
  viewingSunday.value = row;
  sundaySearch.value = "";
  sundayFilter.value = "ALL";
}
function closeSunday() {
  viewingSunday.value = null;
}
function personTypeLabel(a) {
  if (!a.isVisitor) return null;
  return a.guestType === "BIBLE_STUDY" ? "Bible Study" : "Visitor";
}

const btnView = "text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2 py-1";
</script>

<template>
  <div class="font-sans text-stone-800">
    <header class="flex justify-between items-end flex-wrap gap-3.5 mb-4">
      <div>
        <p class="text-xs tracking-wide text-stone-400 font-medium mb-1">Oaks Community Church</p>
        <h1 class="font-semibold text-3xl font-normal text-slate-800">Monthly Report</h1>
      </div>
      <input v-model="month" type="month" :class="inputCls" />
    </header>

    <div v-if="loading" class="text-stone-400 text-sm">Loading…</div>
    <template v-else-if="report">
      <p class="text-sm text-stone-400 mb-3.5">{{ monthLabel(report.month) }}</p>

      <section class="grid gap-3 mb-5" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">Total Attended (Services)</p>
          <p class="text-2xl text-slate-800">{{ report.services.totalAttended }}</p>
        </div>
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">Morning Attendance</p>
          <p class="text-2xl text-slate-800">{{ report.services.bySession.MORNING }}</p>
        </div>
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">Afternoon Attendance</p>
          <p class="text-2xl text-slate-800">{{ report.services.bySession.AFTERNOON }}</p>
          <!-- Highlight who came ONLY in the afternoon (not already counted in the morning) -->
          <div v-if="report.services.bySession.AFTERNOON" class="mt-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-md px-2.5 py-2">
            <p class="m-0 text-xl font-semibold leading-none">{{ report.services.bySession.AFTERNOON - report.services.afternoonAlsoMorning }}</p>
            <p class="m-0 mt-1 text-xs">afternoon only</p>
          </div>
          <p v-if="report.services.afternoonAlsoMorning" class="m-0 mt-1.5 text-xs text-stone-400">
            {{ report.services.afternoonAlsoMorning }} also attended the morning service
          </p>
        </div>
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">Services Held</p>
          <p class="text-2xl text-slate-800">{{ report.services.eventCount }}</p>
        </div>
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">Bible Studies Conducted</p>
          <p class="text-2xl text-slate-800">{{ report.bibleStudy.sessionsConducted }}</p>
        </div>
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">Bible Study Attendance</p>
          <p class="text-2xl text-slate-800">{{ report.bibleStudy.totalAttended }}</p>
          <!-- Who attended (each person counted once): Members vs. Bible Study-only people -->
          <div v-if="report.bibleStudy.totalAttended" class="mt-2.5 flex flex-col gap-1.5 text-xs">
            <div class="flex justify-between bg-sky-50 border border-sky-100 text-sky-900 rounded-md px-2.5 py-1.5">
              <span>Members</span><span class="font-semibold">{{ report.bibleStudy.membersAttended }}</span>
            </div>
            <div class="flex justify-between bg-stone-50 border border-stone-200 text-stone-700 rounded-md px-2.5 py-1.5">
              <span>Bible Study Only</span><span class="font-semibold">{{ report.bibleStudy.bibleStudyOnlyAttended }}</span>
            </div>
            <div v-if="report.bibleStudy.visitorsAttended" class="flex justify-between bg-orange-50 border border-orange-200 text-orange-900 rounded-md px-2.5 py-1.5">
              <span>Visitors</span><span class="font-semibold">{{ report.bibleStudy.visitorsAttended }}</span>
            </div>
          </div>
        </div>
        <!-- First timers added this month -->
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">First Timers</p>
          <p class="text-2xl text-slate-800">{{ report.firstTimers.total }}</p>
        </div>
      </section>

      <!-- First timers added this month, and how they found the church -->
      <h2 class="text-lg text-slate-800 mb-2.5">First timers this month</h2>
      <div class="bg-white border border-stone-200 rounded-lg mb-6">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="text-left text-xs text-stone-400">
              <th class="p-2.5 font-medium">Name</th>
              <th class="p-2.5 font-medium">Added</th>
              <th class="p-2.5 font-medium">How they found us</th>
              <th class="p-2.5 font-medium">Invited by</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in report.firstTimers.list" :key="f.id" class="border-t border-stone-100">
              <td class="p-2.5">{{ f.first }} {{ f.last }}</td>
              <td class="p-2.5">{{ new Date(f.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }}</td>
              <td class="p-2.5">
                <span v-if="f.source === 'WALK_IN'" class="text-xs font-medium bg-orange-50 text-orange-700 rounded-full px-2 py-0.5">
                  Walk-in<template v-if="f.walkInSource"> · {{ f.walkInSource }}</template>
                </span>
                <span v-else-if="f.source === 'INVITED'" class="text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">Invited</span>
                <span v-else class="text-stone-300">Not recorded</span>
              </td>
              <td class="p-2.5">
                <span v-if="f.invitedByName">{{ f.invitedByName }}</span>
                <span v-else class="text-stone-300">—</span>
              </td>
            </tr>
            <tr v-if="report.firstTimers.list.length === 0">
              <td colspan="4" class="text-center py-7 text-stone-400">No first timers added this month.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 class="text-lg text-slate-800 mb-2.5">Attendance by Sunday</h2>
      <div class="bg-white border border-stone-200 rounded-lg mb-5">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="text-left text-xs text-stone-400">
              <th class="p-2.5 font-medium">Date</th>
              <th class="p-2.5 font-medium">Morning</th>
              <th class="p-2.5 font-medium">Afternoon</th>
              <th class="p-2.5 font-medium">Total</th>
              <th class="p-2.5 font-medium text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in report.services.byWeek" :key="row.date" class="border-t border-stone-100">
              <td class="p-2.5">{{ formatWeekDate(row.date) }}</td>
              <td class="p-2.5">{{ row.morning }}</td>
              <td class="p-2.5">{{ row.afternoon }}</td>
              <td class="p-2.5 font-medium">{{ row.total }}</td>
              <td class="p-2.5 text-center">
                <button :class="btnView" @click="openSunday(row)">View</button>
              </td>
            </tr>
            <tr v-if="report.services.byWeek.length === 0">
              <td colspan="5" class="text-center py-7 text-stone-400">No services recorded this month.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 class="text-lg text-slate-800 mb-2.5">Service attendance by category</h2>
      <div class="bg-white border border-stone-200 rounded-lg mb-5">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="text-left text-xs text-stone-400">
              <th class="p-2.5 font-medium">Category</th>
              <th class="p-2.5 font-medium text-center">Attended</th>
              <th class="p-2.5 font-medium text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in categoryRows" :key="row.code" class="border-t border-stone-100">
              <td class="p-2.5">{{ row.label }}</td>
              <td class="p-2.5 text-center">{{ row.count }}</td>
              <td class="p-2.5 text-center">
                <button :class="btnView" @click="openView(row)">View</button>
              </td>
            </tr>
            <tr v-if="categoryRows.length === 0">
              <td colspan="3" class="text-center py-7 text-stone-400">No service attendance recorded this month.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 class="text-lg text-slate-800 mb-2.5">Bible study attendance by category</h2>
      <div class="bg-white border border-stone-200 rounded-lg">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="text-left text-xs text-stone-400">
              <th class="p-2.5 font-medium">Category</th>
              <th class="p-2.5 font-medium text-center">Attended</th>
              <th class="p-2.5 font-medium text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in bibleStudyCategoryRows" :key="row.code" class="border-t border-stone-100">
              <td class="p-2.5">{{ row.label }}</td>
              <td class="p-2.5 text-center">{{ row.count }}</td>
              <td class="p-2.5 text-center">
                <button :class="btnView" @click="openView(row)">View</button>
              </td>
            </tr>
            <tr v-if="bibleStudyCategoryRows.length === 0">
              <td colspan="3" class="text-center py-7 text-stone-400">No Bible study attendance recorded this month.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- View members modal -->
    <div v-if="viewingCategory" class="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-20" @click.self="closeView">
      <div class="bg-white rounded-lg max-w-lg w-full max-h-[85vh] overflow-y-auto p-5">
        <div class="flex justify-between items-start mb-3.5">
          <h2 class="text-xl text-slate-800">{{ viewingCategory.label }}</h2>
          <button class="text-stone-400 hover:text-slate-800 text-sm" @click="closeView">Close</button>
        </div>

        <p class="text-xs text-stone-400 font-medium mb-1.5">Attended ({{ viewingMembers.length }})</p>
        <div class="border border-stone-200 rounded-lg max-h-96 overflow-y-auto">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="text-left text-xs text-stone-400">
                <th class="p-2 font-medium">Name</th>
                <th class="p-2 font-medium text-center">Times attended</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in viewingMembers" :key="m.id" class="border-t border-stone-100 first:border-t-0">
                <td class="p-2">{{ m.first }} {{ m.last }}</td>
                <td class="p-2 text-center">{{ m.count }}</td>
              </tr>
              <tr v-if="viewingMembers.length === 0">
                <td colspan="2" class="text-center py-5 text-stone-400">No members recorded.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <!-- Who attended a given Sunday, and which service(s) -->
    <div v-if="viewingSunday" class="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-20" @click.self="closeSunday">
      <div class="bg-white rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5">
        <div class="flex justify-between items-start mb-3.5">
          <div>
            <p class="text-xs text-stone-400 m-0">Sunday Celebration</p>
            <h2 class="text-xl text-slate-800 m-0">{{ formatWeekDate(viewingSunday.date) }}</h2>
          </div>
          <button class="text-stone-400 hover:text-slate-800 text-sm" @click="closeSunday">Close</button>
        </div>

        <div class="grid grid-cols-4 gap-2 mb-3.5 text-center">
          <div class="border border-stone-200 rounded-md p-2">
            <p class="text-xs text-stone-400 m-0">People</p>
            <p class="text-lg text-slate-800 m-0">{{ viewingSunday.attendees.length }}</p>
          </div>
          <div class="border border-stone-200 rounded-md p-2">
            <p class="text-xs text-stone-400 m-0">Morning</p>
            <p class="text-lg text-slate-800 m-0">{{ viewingSunday.morning }}</p>
          </div>
          <div class="border border-stone-200 rounded-md p-2">
            <p class="text-xs text-stone-400 m-0">Afternoon</p>
            <p class="text-lg text-slate-800 m-0">{{ viewingSunday.afternoon }}</p>
          </div>
          <div class="border border-stone-200 rounded-md p-2">
            <p class="text-xs text-stone-400 m-0">Total</p>
            <p class="text-lg text-slate-800 m-0">{{ viewingSunday.total }}</p>
          </div>
        </div>

        <div class="flex gap-2 mb-2.5">
          <input v-model="sundaySearch" type="text" placeholder="Search by name" :class="[inputCls, 'flex-1']" />
          <select v-model="sundayFilter" :class="inputCls">
            <option value="ALL">All</option>
            <option value="MORNING">Morning</option>
            <option value="AFTERNOON">Afternoon</option>
            <option value="BOTH">Both services</option>
          </select>
        </div>

        <div class="border border-stone-200 rounded-lg max-h-96 overflow-y-auto">
          <table class="w-full border-collapse text-sm">
            <thead class="sticky top-0 bg-white">
              <tr class="text-left text-xs text-stone-400">
                <th class="p-2 font-medium">Name</th>
                <th class="p-2 font-medium">Category</th>
                <th class="p-2 font-medium text-center">Morning</th>
                <th class="p-2 font-medium text-center">Afternoon</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in sundayAttendees" :key="a.id" class="border-t border-stone-100">
                <td class="p-2">
                  {{ a.first }} {{ a.last }}
                  <span v-if="personTypeLabel(a)" class="ml-1 text-xs font-medium bg-orange-50 text-orange-700 rounded-full px-2 py-0.5">{{ personTypeLabel(a) }}</span>
                </td>
                <td class="p-2 text-stone-500">{{ CATEGORY_LABELS[a.category] || a.category }}</td>
                <td class="p-2 text-center">
                  <span v-if="a.morning" class="text-emerald-700 font-semibold">✓</span>
                  <span v-else class="text-stone-300">—</span>
                </td>
                <td class="p-2 text-center">
                  <span v-if="a.afternoon" class="text-emerald-700 font-semibold">✓</span>
                  <span v-else class="text-stone-300">—</span>
                </td>
              </tr>
              <tr v-if="sundayAttendees.length === 0">
                <td colspan="4" class="text-center py-5 text-stone-400">No one matches.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-stone-400 mt-2 mb-0">Showing {{ sundayAttendees.length }} of {{ viewingSunday.attendees.length }} people</p>
      </div>
    </div>
  </div>
</template>
