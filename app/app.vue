<script setup>
const links = [
  { to: "/", label: "Members" },
  { to: "/attendance", label: "Attendance" },
  { to: "/reports", label: "Reports" },
];
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <nav class="bg-white border-b border-stone-200 px-6">
      <div class="max-w-[1080px] mx-auto flex gap-5">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="text-sm py-3.5 border-b-2 border-transparent text-stone-500 hover:text-slate-800"
          active-class="!border-slate-800 !text-slate-800 font-medium"
        >
          {{ link.label }}
        </NuxtLink>
      </div>
    </nav>
    <NuxtPage />
  </div>
</template>
