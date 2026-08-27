// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    // The demo entry buttons link to /demo — a nitro server route (mints the demo-role
    // cookie, redirects home), so it's deliberately a plain <a> and can never appear in
    // the Vue routes the link checker validates against.
    files: ['app/pages/index.vue', 'app/pages/labs/login.vue'],
    rules: {
      'link-checker/valid-route': 'off',
      'link-checker/valid-sitemap-link': 'off'
    }
  }
)
