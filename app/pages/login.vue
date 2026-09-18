<script setup>
const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);
const role = useAuthRole();

const inputCls = "border border-stone-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-800/20 w-full";
const btnPrimary = "bg-slate-800 text-stone-50 rounded-md px-4 py-2.5 text-sm font-medium hover:bg-slate-700 w-full";

async function submit() {
  error.value = "";
  loading.value = true;
  try {
    const data = await $fetch("/api/auth/login", {
      method: "POST",
      body: { username: username.value.trim(), password: password.value },
    });
    role.value = data.role;
    await navigateTo("/");
  } catch (e) {
    error.value = e?.data?.statusMessage || "Couldn't log in.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-stone-50 flex justify-center px-6 pt-[50px]">
    <form class="w-full max-w-sm bg-white border border-stone-200 rounded-lg p-6 font-sans" @submit.prevent="submit">
      <p class="text-xs tracking-wide text-stone-400 font-medium mb-1">Oaks Community Church</p>
      <h1 class="font-serif text-2xl text-slate-800 mb-5">PDPop Database</h1>

      <label class="block text-xs text-stone-400 font-medium mb-1.5">Username</label>
      <input v-model="username" type="text" autocomplete="username" :class="[inputCls, 'mb-3.5']" />

      <label class="block text-xs text-stone-400 font-medium mb-1.5">Password</label>
      <input v-model="password" type="password" autocomplete="current-password" :class="[inputCls, 'mb-3.5']" />

      <p v-if="error" class="text-orange-700 text-sm mb-3.5">{{ error }}</p>

      <button type="submit" :class="btnPrimary" :disabled="loading">
        {{ loading ? "Logging in…" : "Log in" }}
      </button>
    </form>
  </div>
</template>
