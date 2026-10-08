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
          <p class="text-xs text-stone-400 mb-1.5">Total attended (services)</p>
          <p class="text-2xl text-slate-800">{{ report.services.totalAttended }}</p>
        </div>
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">Morning attendance</p>
          <p class="text-2xl text-slate-800">{{ report.services.bySession.MORNING }}</p>
        </div>
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">Afternoon attendance</p>
          <p class="text-2xl text-slate-800">{{ report.services.bySession.AFTERNOON }}</p>
        </div>
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">Services held</p>
          <p class="text-2xl text-slate-800">{{ report.services.eventCount }}</p>
        </div>
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">Bible studies conducted</p>
          <p class="text-2xl text-slate-800">{{ report.bibleStudy.sessionsConducted }}</p>
        </div>
        <div class="bg-white border border-stone-200 rounded-lg p-3.5">
          <p class="text-xs text-stone-400 mb-1.5">Bible study attendance</p>
          <p class="text-2xl text-slate-800">{{ report.bibleStudy.totalAttended }}</p>
        </div>
      </section>

      <h2 class="text-lg text-slate-800 mb-2.5">Attendance by Sunday</h2>
      <div class="bg-white border border-stone-200 rounded-lg mb-5">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="text-left text-xs text-stone-400">
              <th class="p-2.5 font-medium">Date</th>
              <th class="p-2.5 font-medium">Morning</th>
              <th class="p-2.5 font-medium">Afternoon</th>
              <th class="p-2.5 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in report.services.byWeek" :key="row.date" class="border-t border-stone-100">
              <td class="p-2.5">{{ formatWeekDate(row.date) }}</td>
              <td class="p-2.5">{{ row.morning }}</td>
              <td class="p-2.5">{{ row.afternoon }}</td>
              <td class="p-2.5 font-medium">{{ row.total }}</td>
            </tr>
            <tr v-if="report.services.byWeek.length === 0">
              <td colspan="4" class="text-center py-7 text-stone-400">No services recorded this month.</td>
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
  </div>
</template>
