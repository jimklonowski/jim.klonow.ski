// Registers the site's service worker (public/sw.js), whose one job is the offline page: a page
// asked for with no network gets /offline.html instead of the browser's dead end. It caches
// nothing else and touches no other request, so there is nothing here for the app to manage.
//
// Not in dev: the worker would sit between the browser and Vite's reloads for no gain. Registered
// after `load`, so it costs the first paint nothing; `updateViaCache: 'none'` makes the browser
// ask the server for sw.js itself on every update check, whatever the HTTP cache holds.
export default defineNuxtPlugin(() => {
  if (import.meta.dev || !('serviceWorker' in navigator)) return
  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => { /* a browser that refuses (a private window) simply has no offline page */ })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
})
