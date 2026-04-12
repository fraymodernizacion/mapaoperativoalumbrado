<script setup lang="ts">
const route = useRoute();

const navItems = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Alumbrado', to: '/alumbrado' },
  { label: 'Medidores', to: '/medidores' },
  { label: 'Calidad', to: '/calidad' },
  { label: 'Reportes', to: '/reportes' },
  { label: 'Admin', to: '/admin' }
];
</script>

<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/88 backdrop-blur-xl">
      <div class="mx-auto flex max-w-[1680px] flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-500">Municipalidad de Fray Mamerto Esquiú</p>
          <h1 class="mt-1 text-xl font-semibold tracking-tight text-slate-950">
            Visor operativo de alumbrado e infraestructura eléctrica
          </h1>
        </div>

        <nav class="flex flex-wrap gap-2">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="rounded-full border px-4 py-2 text-sm font-medium transition"
            :class="
              route.path === item.to
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            "
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-[1680px] px-5 py-6">
      <slot />
    </main>
  </div>
</template>
