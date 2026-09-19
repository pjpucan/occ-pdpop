<script setup>
const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);
const role = useAuthRole();

const inputCls = "border border-stone-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-800/20 w-full";
const btnPrimary = "bg-gradient-to-r from-lime-400 to-emerald-500 text-white rounded-full px-4 py-3 text-sm font-bold hover:opacity-90 w-full shadow-md";

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
  <div
    class="min-h-screen bg-cover bg-center flex items-center justify-center px-6"
    style="background-image: url('/oak-tree.webp')"
  >
    <form class="w-full max-w-sm bg-white/30 backdrop-blur-sm border border-white/50 rounded-3xl p-7 font-sans shadow-2xl" @submit.prevent="submit">
      <div class="flex flex-col items-center text-center mb-5">
        <div class="w-12 h-12 rounded-full bg-white text-slate-900 flex items-center justify-center mb-2.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-person-circle" viewBox="0 0 16 16">
            <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/>
            <path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1"/>
          </svg>
        </div>
        <p class="text-xs tracking-wide text-white font-semibold mb-1">Oaks Community Church</p>
        <h1 class="font-sans font-semibold text-xl text-white uppercase">PDPop Database</h1>
      </div>

      <label class="block text-xs text-white font-semibold mb-1.5">Username</label>
      <input v-model="username" type="text" autocomplete="username" :class="[inputCls, 'mb-3.5']" />

      <label class="block text-xs text-white font-semibold mb-1.5">Password</label>
      <input v-model="password" type="password" autocomplete="current-password" :class="[inputCls, 'mb-3.5']" />

      <p v-if="error" class="text-orange-700 text-sm mb-3.5">{{ error }}</p>

      <button type="submit" :class="btnPrimary" :disabled="loading">
        {{ loading ? "Logging in…" : "Log in" }}
      </button>
    </form>
  </div>
</template>
