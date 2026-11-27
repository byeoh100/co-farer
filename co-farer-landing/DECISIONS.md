# Landing page: how it was built (2026-11-27)

On branch `landing`, off `self-host` (like the redesign: `main` is still the
DeepSpace version). LANDING-SPEC.md wins on anything not listed here.

| Topic | What was done |
| --- | --- |
| How `/` is served | The prerendered static page (`src/pages/index.tsx` → `dist/client/index.html`), served by the worker's static routes. |
| Redirect | Server-side, as the spec prefers: the worker can read the HttpOnly session cookie, so a signed-in GET `/` gets a `302` to `/trips` (`Cache-Control: no-store`, `Vary: Cookie`) before the static page (`src/server/landing.ts`). No flash, no token in a URL; signed-out visitors and crawlers get the real HTML. Client-side links to `/` inside the app don't exist (the logo goes to `/trips`). |
| "Plan a trip" | `/trips?new=1`, which opens the existing "Plan a trip" form (through sign-in when signed out). |
| "I have an invite" | The sign-in page, returning to `/trips?join=1`, which opens "Join with a code". Invite links (`/join/<code>`) are unchanged and tested signed in and out. |
| Signing out | Already lands on `/` (Cognito's logout URL is the app root); now tested. |
| Origin | One place: `PUBLIC_ORIGIN` in `prerender.ts` (`https://co-farer.duckdns.org`, or `SITE_ORIGIN` at build time). Canonical, `og:url` and the sitemap follow it. |
| `co-farer.app.space` | Removed from code, config, tests, the README link and the old mockup. Kept on purpose: the `PLAN.md` log history, `docs/BUILD_GUIDE.md` (a copy of an external doc), and the vendored DeepSpace CLI docs (`AGENTS.md`, `.agents/skills/deepspace`): the DeepSpace app still runs there until the Phase 5 switchover. |
| Hero photo | A bundled static illustration (`src/assets/landing-lake.svg`), a wide version of the sign-in scene. |
| Footer | © year, and Sign in. Terms and Privacy are left out: those pages don't exist. |
| Header | "Plan a trip" hides under 420px wide (the hero has the same button). |
