<template>
  <div class="min-h-screen flex flex-col bg-bg">
    <AppHeader />
    <StatusLine />

    <main class="flex-1 min-w-0">
      <slot />
    </main>

    <FooterStatus />
    <DigestPanel />
    <CommandPalette />
  </div>
</template>
