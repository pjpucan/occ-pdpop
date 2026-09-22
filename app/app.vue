<script setup>
const links = [
  { to: "/", label: "Members" },
  { to: "/attendance", label: "Attendance" },
  { to: "/bible-study", label: "Bible Study" },
  { to: "/reports", label: "Reports" },
  { to: "/empower-report", label: "Empower Report" },
];

const route = useRoute();
const role = useAuthRole();
const loggingOut = ref(false);

async function logout() {
  loggingOut.value = true;
  try {
    await $fetch("/api/auth/logout", { method: "POST" });
    role.value = null;
    await navigateTo("/login");
  } finally {
    loggingOut.value = false;
  }
}
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <nav v-if="route.path !== '/login'" class="bg-white border-b border-stone-200 px-6">
      <div class="max-w-[1080px] mx-auto flex gap-5 items-center w-full">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="text-sm py-3.5 border-b-2 border-transparent text-stone-500 hover:text-slate-800"
          active-class="!border-slate-800 !text-slate-800 font-medium"
        >
          {{ link.label }}
        </NuxtLink>
        <div class="ml-auto flex items-center gap-3 text-sm text-stone-400">
          <span v-if="role" class="flex items-center gap-1.5 capitalize">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-person-circle" viewBox="0 0 16 16">
              <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/>
              <path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1"/>
            </svg>
            {{ role }}
          </span>
          <button class="hover:text-slate-800" :disabled="loggingOut" @click="logout">Log out</button>
        </div>
      </div>
    </nav>
    <NuxtPage />
  </div>
</template>
