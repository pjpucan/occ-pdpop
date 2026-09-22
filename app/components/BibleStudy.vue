<script setup>
import { ref, computed, onMounted } from "vue";

const isAdmin = useIsAdmin();

const CATEGORY_LABELS = {
  KIDS: "Kids", TWEENS: "Tweens", YTH: "YTH", NXT: "NXT", SOLO: "Solo",
  SENIOR_ADULT: "Senior Adult", YOUNG_COUPLES: "Young Couples", COUPLES: "Couples",
  LEGACY: "Legacy", UNASSIGNED: "Unassigned",
};

const groups = ref([]);
const members = ref([]);
const loading = ref(true);
const newLeaderName = ref("");
const adding = ref(false);
const addError = ref("");

async function fetchGroups() {
  loading.value = true;
  groups.value = await $fetch("/api/bible-study-groups");
  loading.value = false;
}
async function fetchMembers() {
  members.value = await $fetch("/api/members");
}
onMounted(() => {
  fetchGroups();
  fetchMembers();
});

async function addLeader() {
  if (!newLeaderName.value.trim()) return;
  adding.value = true;
  addError.value = "";
  try {
    await $fetch("/api/bible-study-groups", { method: "POST", body: { name: newLeaderName.value.trim() } });
    newLeaderName.value = "";
    await fetchGroups();
  } catch (e) {
    addError.value = e?.data?.statusMessage || "Couldn't add that leader.";
  } finally {
    adding.value = false;
  }
}

async function removeLeader(g) {
  const warning = g.memberCount > 0
    ? ` This will unassign ${g.memberCount} member(s) currently under this leader.`
    : "";
  if (!confirm(`Delete leader "${g.name}"?${warning}`)) return;
  await $fetch(`/api/bible-study-groups/${g.id}`, { method: "DELETE" });
  await fetchGroups();
}

// --- inline edit (rename) ------------------------------------------------------------
const editingId = ref(null);
const editName = ref("");
const editError = ref("");
const savingEdit = ref(false);

function startEdit(g) {
  editingId.value = g.id;
  editName.value = g.name;
  editError.value = "";
}
function cancelEdit() {
  editingId.value = null;
}
async function saveEdit(g) {
  if (!editName.value.trim()) return;
  savingEdit.value = true;
  editError.value = "";
  try {
    await $fetch(`/api/bible-study-groups/${g.id}`, { method: "PATCH", body: { name: editName.value.trim() } });
    editingId.value = null;
    await fetchGroups();
  } catch (e) {
    editError.value = e?.data?.statusMessage || "Couldn't rename that leader.";
  } finally {
    savingEdit.value = false;
  }
}

// --- view members modal ------------------------------------------------------------
const viewingGroup = ref(null);
const groupMembers = computed(() => {
  if (!viewingGroup.value) return [];
  return members.value.filter((m) => m.bibleStudyGroup === viewingGroup.value.name);
});
function openView(g) {
  viewingGroup.value = g;
}
function closeView() {
  viewingGroup.value = null;
}

const inputCls = "border border-stone-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-800/20";
const btnPrimary = "bg-slate-800 text-stone-50 rounded-md px-4 py-2.5 text-sm font-medium hover:bg-slate-700";
const btnView = "text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2 py-1";
const btnDelete = "text-xs text-white bg-red-600 hover:bg-red-700 rounded px-2 py-1 ml-2.5";
const btnEdit = "text-xs text-white bg-slate-800 hover:bg-slate-700 rounded px-2 py-1 ml-2.5";
const btnSave = "text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2 py-1";
const btnCancel = "text-xs text-slate-800 bg-white border border-stone-300 hover:bg-stone-50 rounded px-2 py-1 ml-2.5";
</script>

<template>
  <div class="font-sans text-stone-800">
    <header class="mb-4">
      <p class="text-xs tracking-wide text-stone-400 font-medium mb-1">Oaks Community Church</p>
      <h1 class="text-3xl font-normal text-slate-800">Bible Study</h1>
    </header>

    <form v-if="isAdmin" class="flex gap-2.5 items-center bg-white border border-stone-200 rounded-lg p-3.5 mb-4" @submit.prevent="addLeader">
      <input v-model="newLeaderName" placeholder="Leader name" :class="[inputCls, 'flex-1 min-w-[180px]']" />
      <button type="submit" :class="btnPrimary" :disabled="adding">{{ adding ? "Adding…" : "Add leader" }}</button>
      <p v-if="addError" class="text-orange-700 text-sm m-0">{{ addError }}</p>
    </form>

    <div class="bg-white border border-stone-200 rounded-lg max-h-[480px] overflow-y-auto">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="text-left text-xs text-stone-400">
            <th class="p-2.5 font-medium">Leader</th>
            <th class="p-2.5 font-medium text-center">Members</th>
            <th class="p-2.5 font-medium text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in groups" :key="g.id" class="border-t border-stone-100">
            <td class="p-2.5">
              <template v-if="editingId === g.id">
                <input
                  v-model="editName"
                  :class="[inputCls, 'w-full']"
                  @keyup.enter="saveEdit(g)"
                  @keyup.esc="cancelEdit"
                />
                <p v-if="editError" class="text-orange-700 text-xs mt-1 mb-0">{{ editError }}</p>
              </template>
              <template v-else>{{ g.name }}</template>
            </td>
            <td class="p-2.5 text-center">{{ g.memberCount }}</td>
            <td class="p-2.5 text-center">
              <template v-if="editingId === g.id">
                <button :class="btnSave" :disabled="savingEdit" @click="saveEdit(g)">
                  {{ savingEdit ? "Saving…" : "Save" }}
                </button>
                <button :class="btnCancel" @click="cancelEdit">Cancel</button>
              </template>
              <template v-else>
                <button :class="btnView" @click="openView(g)">View</button>
                <button v-if="isAdmin" :class="btnEdit" @click="startEdit(g)">Edit</button>
                <button v-if="isAdmin" :class="btnDelete" @click="removeLeader(g)">Delete</button>
              </template>
            </td>
          </tr>
          <tr v-if="!loading && groups.length === 0">
            <td colspan="3" class="text-center py-7 text-stone-400">No leaders yet.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- View members modal -->
    <div v-if="viewingGroup" class="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-20" @click.self="closeView">
      <div class="bg-white rounded-lg max-w-lg w-full max-h-[85vh] overflow-y-auto p-5">
        <div class="flex justify-between items-start mb-3.5">
          <h2 class="text-xl text-slate-800">{{ viewingGroup.name }}</h2>
          <button class="text-stone-400 hover:text-slate-800 text-sm" @click="closeView">Close</button>
        </div>

        <p class="text-xs text-stone-400 font-medium mb-1.5">Members ({{ groupMembers.length }})</p>
        <div class="border border-stone-200 rounded-lg max-h-96 overflow-y-auto">
          <table class="w-full border-collapse text-sm">
            <tbody>
              <tr v-for="m in groupMembers" :key="m.id" class="border-t border-stone-100 first:border-t-0">
                <td class="p-2">{{ m.first }} {{ m.last }}</td>
                <td class="p-2 text-stone-400">{{ CATEGORY_LABELS[m.category] }}</td>
              </tr>
              <tr v-if="groupMembers.length === 0">
                <td colspan="2" class="text-center py-5 text-stone-400">No members in this group.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
