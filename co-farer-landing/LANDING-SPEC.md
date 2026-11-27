# Co-farer: landing page and redirects (addendum to SPEC.md)

Live check, Nov 27 2026:
- `/trips` already uses the new design (theme-color #111111).
- `/` still serves the old landing page ("Plan the group trip without the group chat chaos"). Its only button, "Sign in to plan a trip", links to `/trips`.
- The canonical and `og:url` on `/` still point to `https://co-farer.app.space/`.

All the ground rules from SPEC.md still apply. In particular: no auth changes, no secrets, and never run `npx deepspace push`.

## 1. Redirect rules

| Visitor | Goes to | Result |
| --- | --- | --- |
| Signed in | `/` | Redirected to `/trips` with a replace, so Back doesn't loop. |
| Signed out | `/` | Sees the landing page. |
| Signed out | `/trips` or any app route | Existing behaviour: sent to sign-in, then back to the route they asked for. Confirm this still works; don't rebuild it. |
| Anyone | Landing "Sign in" | The existing sign-in route, returning to `/trips`. |
| Anyone | Landing "Plan a trip" | `/trips` (signed-out visitors pass through sign-in first). If the app has a create-trip route or query param, link straight to it instead. |
| Anyone | Landing "I have an invite" | The existing sign-in route. Invite links (`/invite/...` or whatever the app uses) must keep working unchanged. |
| Signing out | Anywhere | Lands on `/`, not on the sign-in form. |

**How to redirect:**

1. First find out how `/` is served today: a static or prerendered HTML file from the Worker, or a route in the React app.
2. If the Worker can see the session (a cookie it already reads), do a server-side `302` from `/` to `/trips` for signed-in requests. That gives no flash of the landing page.
3. If the session only lives on the client (for example in the SDK's storage), add a tiny inline script in the landing page `<head>` that checks for the session the same way the app does and calls `location.replace('/trips')`.
4. Either way, keep `/` as real HTML for signed-out visitors, so search engines and link previews still read it.
5. Never put a session token in a URL.

## 2. Landing page design

Reference: `design-reference/landing.dc.html` (the "Final · Landing page" frame on the canvas). Use the SPEC.md tokens, fonts and logo mark. It's a static page: no data queries.

- **Header:** logo mark and wordmark on the left. On the right, an outline "Sign in" button and a primary "Plan a trip" button.
- **Hero:** a 560px photo panel (a bundled static image, radius 24px) with a dark fade from the left. On top of it:
  - an eyebrow, "GROUP TRIP PLANNER";
  - the h1 "PLAN THE TRIP, NOT THE GROUP CHAT." at 96px, with the period in `--cf-accent-ink`;
  - one line of 17px copy;
  - two buttons, "Plan a trip, it's free" (primary) and "I have an invite" (outline).

  At the bottom right sits a decorative preview card showing the housing VoterSegments, with `aria-hidden`. On mobile the h1 drops to 56px and the preview card is hidden.
- **How it works:** three cards numbered 01–03 (number in `--cf-accent-ink`, title at 28px, muted body text, and a small decorative illustration at the bottom of each):
  1. Pick the dates: date bars.
  2. Vote on where to stay: two option rows, one with VoterSegments and one with an "over budget" flag.
  3. Keep it in budget: two budget bars. The copy must say a budget can be shared or kept private, which matches the current setting.
- **CTA band:** a `--cf-surface` panel with "GOT A TRIP IN MIND?" at 52px, a subline, and a primary "Plan a trip" button.
- **Footer:** © line, then Terms, Privacy and Sign in links. Link Terms and Privacy only if those pages exist; otherwise leave them out.

The copy above replaces the old copy. If you'd rather keep the old headline, it fits the same h1 slot.

## 3. Meta tags on `/`

- Change `<link rel="canonical">` and `og:url` to `https://co-farer.duckdns.org/`. Take the origin from config if the app has one; don't hard-code it in more than one place.
- Title: "Co-farer | Group trip planner". Description: one sentence based on the hero copy. Keep the existing OG and Twitter card tags, and update their text to match.
- Add the favicon links and `<meta name="theme-color" content="#111111">`, same as the app.

## 4. Acceptance

- [ ] Signed in: opening `/` lands on `/trips` with no visible flash, and Back doesn't bounce to `/`.
- [ ] Signed out: `/` shows the new landing page, and both CTAs lead through sign-in to `/trips`.
- [ ] Invite links work signed out and signed in.
- [ ] Signing out lands on `/`.
- [ ] Viewing the source of `/` shows the canonical and `og:url` as `https://co-farer.duckdns.org/`, and no `co-farer.app.space` remains anywhere in the repo, unless the old domain is still meant to redirect.
- [ ] The landing page passes the SPEC.md accessibility rules and holds at 1280px, 900px and 390px.
- [ ] Typecheck and tests pass. Changes are on a branch with a PR and screenshots. Nothing deployed.
