export default defineNuxtConfig({
  compatibilityDate: '2026-04-11',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['leaflet/dist/leaflet.css', '~/assets/css/main.css'],
  app: {
    head: {
      title: 'Municipalidad de Fray Mamerto Esquiú',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Visor operativo de alumbrado público e infraestructura eléctrica municipal.' }
      ]
    }
  },
  nitro: {
    preset: 'vercel'
  }
});
