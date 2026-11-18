<template>
  <div
    class="min-h-screen flex flex-col bg-bg"
    data-app-shell
  >
    <!-- data-app-shell: on paper only <main> is printed (main.css, `@media print`). -->
    <AppHeader />
    <DemoBanner />
    <StatusLine />

    <main class="flex-1 min-w-0">
      <slot />
    </main>

    <FooterStatus />
    <DigestPanel />
    <CommandPalette />
    <DemoTour />
  </div>
</template>
