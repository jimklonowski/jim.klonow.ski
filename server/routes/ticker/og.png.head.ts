// HEAD for the OG card. `curl -I`, link checkers and some unfurlers ask with HEAD before they
// GET, and h3's router (1.x) matches a HEAD only against a HEAD handler: a route without one
// falls through to the Nuxt page renderer, which answered this URL with a JSON 404 while the
// image itself was fine. The GET handler is method-agnostic (its cache key is a fixed GET
// request, the memo is shared because this is the same module instance), and the runtime drops
// the body of a HEAD response, so one handler answers both.
export { default } from './og.png.get'
