<script setup>
import { ref, onMounted, watch } from "vue";

const CATEGORY_COLUMNS = ["KIDS", "TWEENS", "YTH", "NXT", "SOLO", "SENIOR_ADULT", "COUPLES", "LEGACY"];
const CATEGORY_COLUMN_LABELS = {
  KIDS: "Kids (0-8)", TWEENS: "Tweens (9-12)", YTH: "YTH (13-22)", NXT: "NXT (23-39)",
  SOLO: "Solo Parent", SENIOR_ADULT: "Senior Adult (40-59)", COUPLES: "Couples", LEGACY: "Legacy (60+)",
};

const inputCls = "border border-stone-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-800/20";
const btnPrimary = "bg-slate-800 text-stone-50 rounded-md px-4 py-2.5 text-sm font-medium hover:bg-slate-700";

const month = ref(new Date().toISOString().slice(0, 7));
const pastorName = ref("");
const report = ref(null);
const loading = ref(true);
const exporting = ref(false);

async function fetchReport() {
  loading.value = true;
  report.value = await $fetch("/api/reports/empower", { query: { month: month.value, pastorName: pastorName.value } });
  loading.value = false;
}
onMounted(fetchReport);
watch(month, fetchReport);

async function exportReport() {
  exporting.value = true;
  try {
    const params = new URLSearchParams({ month: month.value, pastorName: pastorName.value });
    const res = await fetch(`/api/reports/empower-export?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Empower-Statistical-Report-${month.value}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    exporting.value = false;
  }
}

function fmt(v) {
  return v === null || v === undefined ? "—" : v;
}
</script>

<template>
  <div class="font-sans text-stone-800">
    <header class="flex justify-between items-end flex-wrap gap-3.5 mb-4">
      <div>
        <p class="text-xs tracking-wide text-stone-400 font-medium mb-1">Oaks Community Church</p>
        <h1 class="font-medium text-3xl font-normal text-slate-800">Empower PDPOP Report</h1>
      </div>
      <div class="flex gap-2.5 items-center">
        <input v-model="month" type="month" :class="inputCls" />
        <button :class="btnPrimary" :disabled="exporting || loading" @click="exportReport">
          {{ exporting ? "Exporting…" : "Export to Excel" }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="text-stone-400 text-sm">Loading…</div>
    <template v-else-if="report">
      <div class="bg-white border border-stone-200 rounded-lg p-4 mb-4 grid gap-3" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <div>
          <p class="text-xs text-stone-400 font-medium mb-1">For The Month Of</p>
          <p class="text-sm font-medium">{{ report.monthLabel }}</p>
        </div>
        <div>
          <p class="text-xs text-stone-400 font-medium mb-1">Name of Local Church</p>
          <p class="text-sm font-medium">{{ report.churchName }}</p>
        </div>
        <div>
          <label class="block text-xs text-stone-400 font-medium mb-1">Name of Pastor</label>
          <input v-model="pastorName" placeholder="Pastor's name…" :class="[inputCls, 'w-full']" @change="fetchReport" />
        </div>
      </div>

      <div class="bg-white border border-stone-200 rounded-lg overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="bg-slate-800 text-white text-xs">
              <th rowspan="2" class="p-2 border border-slate-700 align-middle">Cut-off Period</th>
              <th colspan="2" class="p-2 border border-slate-700">All Official Activities Except Bible Study</th>
              <th colspan="3" class="p-2 border border-slate-700">Bible Study</th>
              <th :colspan="CATEGORY_COLUMNS.length" class="p-2 border border-slate-700">Empower Population</th>
              <th rowspan="2" class="p-2 border border-slate-700 align-middle">Total EPOP</th>
            </tr>
            <tr class="bg-slate-800 text-white text-xs">
              <th class="p-2 border border-slate-700 font-normal">First Timer</th>
              <th class="p-2 border border-slate-700 font-normal">Running Total</th>
              <th class="p-2 border border-slate-700 font-normal">Actual BS Conducted</th>
              <th class="p-2 border border-slate-700 font-normal">First Timer</th>
              <th class="p-2 border border-slate-700 font-normal">Attendees</th>
              <th v-for="c in CATEGORY_COLUMNS" :key="c" class="p-2 border border-slate-700 font-normal">{{ CATEGORY_COLUMN_LABELS[c] }}</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-t border-stone-100">
              <td class="p-2 border border-stone-200 font-medium whitespace-nowrap">{{ report.base.label }}</td>
              <td class="p-2 border border-stone-200 text-center">{{ fmt(report.base.firstTimerAllOfficial) }}</td>
              <td class="p-2 border border-stone-200 text-center">{{ fmt(report.base.runningTotal) }}</td>
              <td class="p-2 border border-stone-200 text-center">{{ fmt(report.base.actualBSConducted) }}</td>
              <td class="p-2 border border-stone-200 text-center">{{ fmt(report.base.firstTimerBS) }}</td>
              <td class="p-2 border border-stone-200 text-center">{{ fmt(report.base.attendees) }}</td>
              <td v-for="c in CATEGORY_COLUMNS" :key="c" class="p-2 border border-stone-200 text-center">{{ fmt(report.base.categories?.[c]) }}</td>
              <td class="p-2 border border-stone-200 text-center font-semibold italic">{{ fmt(report.base.totalEpop) }}</td>
            </tr>
            <tr v-for="p in report.periods" :key="p.label" class="border-t border-stone-100">
              <td class="p-2 border border-stone-200 font-medium whitespace-nowrap">{{ p.label }}</td>
              <td class="p-2 border border-stone-200 text-center">{{ p.firstTimerAllOfficial }}</td>
              <td class="p-2 border border-stone-200 text-center">{{ fmt(p.runningTotal) }}</td>
              <td class="p-2 border border-stone-200 text-center">{{ p.actualBSConducted }}</td>
              <td class="p-2 border border-stone-200 text-center">{{ p.firstTimerBS }}</td>
              <td class="p-2 border border-stone-200 text-center">{{ p.attendees }}</td>
              <td v-for="c in CATEGORY_COLUMNS" :key="c" class="p-2 border border-stone-200 text-center">{{ fmt(p.categories?.[c]) }}</td>
              <td class="p-2 border border-stone-200 text-center font-semibold italic">{{ fmt(p.totalEpop) }}</td>
            </tr>
            <tr class="bg-slate-800 text-white font-medium">
              <td class="p-2 border border-slate-700">{{ report.totals.label }}</td>
              <td class="p-2 border border-slate-700 text-center">{{ report.totals.firstTimerAllOfficial }}</td>
              <td class="p-2 border border-slate-700 text-center">{{ fmt(report.totals.runningTotal) }}</td>
              <td class="p-2 border border-slate-700 text-center">{{ report.totals.actualBSConducted }}</td>
              <td class="p-2 border border-slate-700 text-center">{{ report.totals.firstTimerBS }}</td>
              <td class="p-2 border border-slate-700 text-center">{{ report.totals.attendees }}</td>
              <td v-for="c in CATEGORY_COLUMNS" :key="c" class="p-2 border border-slate-700 text-center">{{ fmt(report.totals.categories?.[c]) }}</td>
              <td class="p-2 border border-slate-700 text-center">{{ fmt(report.totals.totalEpop) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Info only: who the once-per-week leader rule took off Attendees -->
      <div v-if="report.periods.some((p) => p.attendeeDeductions?.length)" class="flex gap-2 items-start bg-amber-50 border border-amber-200 text-amber-900 rounded-md px-3.5 py-3 text-xs leading-relaxed mt-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="shrink-0 mt-px" viewBox="0 0 16 16"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.469l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/></svg>
        <div>
        <p class="m-0 font-semibold">Note on Attendees: leaders counted once per week</p>
        <p class="m-0 mt-0.5 mb-1">
          Facilitators and co-facilitators count as 1 for the week, however many sessions they led or attended. Taken off:
        </p>
        <ul class="m-0 pl-4 list-disc">
          <li v-for="p in report.periods.filter((p) => p.attendeeDeductions?.length)" :key="p.label">
            <span class="font-semibold">{{ p.label }}</span>
            (−{{ p.attendeeDeductions.reduce((n, d) => n + d.removed, 0) }}):
            {{ p.attendeeDeductions.map((d) => `${d.name} ${d.checkIns} → 1 (−${d.removed})`).join(", ") }}
          </li>
        </ul>
        </div>
      </div>

      <p v-if="report.unassignedTotal > 0" class="text-orange-700 text-xs mt-2.5">
        Note: {{ report.unassignedTotal }} member(s) have no category assigned ("Unassigned") and are excluded from the population columns above.
      </p>
    </template>
  </div>
</template>
