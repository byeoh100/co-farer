# Redesign decisions (2026-11-27)

Agreed with the human after reading SPEC.md against the code. SPEC.md still
wins on anything not listed here.

| Topic | Decision |
| --- | --- |
| Branch | `redesign`, off **`self-host`** (not `main`: main is still the DeepSpace version; self-host is the live AWS app and becomes main at the switchover). The PR targets `self-host`. Pushing `redesign` doesn't deploy; merging the PR does (Phase 4 auto-deploy), so merging is the human's call. |
| Sign-in | A full `/sign-in` page in the new design that **hands off to Cognito**: "Continue with Google" (Google is configured) and an Email field with "Send me a code", which opens Cognito's page pre-filled with that address where Cognito supports it. **No password field** (Cognito sign-in is by email code). Cognito's own code screen keeps Cognito's look. Redirects and session handling (`src/server/cognito-auth.ts`) don't change. |
| Trip "occasion", departure time | Don't exist: the eyebrow shows only the member count; the departure chip shows "From <meeting point>" when one is set, else it's hidden. No schema changes. |
| Join order (person colours) | `team_members` has no join-time column: use each row's built-in `createdAt`. |
| Activities / Food split | The existing `options.module` field (`activities` / `food`). |
| Themes | Today: two light themes (`cofarer`, `paper`) via `data-theme`. Replace with the single dark theme. |
| Type check | `npm run type-check` (or `npm run validate`, which also runs the unit tests); there's no `npm run typecheck`. |
| Photo fallback | Replace `Thumb`'s letter tile with the type icon tile. |
| Profile pictures | On hold (migration 2c): avatars stay initials. |
| `deepspace secrets` / `deepspace push` rules | Don't apply on this branch (no DeepSpace); the "don't deploy" rule still holds. |

## Built (2026-11-27)

The whole redesign, in one commit on `redesign` (the human asked for one
commit, not one per build step). Notes on how the spec met the code:

- **Cards with their own buttons.** Each overview card used to *be* one
  button, which can't hold "Claim seat" or "+ Suggest". ExpandableSection now
  hands each card an `open` control; the grow animation starts from the card
  that was clicked (`data-section-card`). Test hooks kept: `section-housing`
  (Open housing), `dates-bar` (Open calendar), `members-stack`.
- **The header.** The trip page portals its name, avatar stack and Invite
  into the app header (`HeaderPortal`), so trip presence (online/offline)
  still works. Invite opens the members panel, which has the invite link;
  like before, only the organizer sees it.
- **Activities and Food** are two cards over one Full view (Additional);
  "+ Suggest" opens it, where both lists' add flows already are.
- **Notes board:** delete works in place (same confirmation and actions);
  edit opens the Notes view.
- **Travel** got an "Open travel" button (the spec's header has none, but
  every card keeps its Full view).
- **Sign-in:** `/sign-in`, and signed-out protected pages show the same
  screen in place. The typed email pre-fills Cognito (`login_hint`, validated
  server-side); "Create account" opens Cognito's sign-up page. Not shown, as
  the spec allows: the password field (codes only), Terms and Privacy (no
  such pages exist), and the invite banner (the invite endpoint needs sign-in,
  so a signed-out visitor has no trip name to show).
- **Homepage:** "Waiting on you" covers unvoted housing, missing free days and
  a missing budget; there is no pending-invite data, so that row type never
  appears. "Join with a code" goes to the existing `/join/<code>` page.
- **Left out on purpose:** "occasion" and departure time (no such fields).
- **Tests changed** only where the spec changed what's on screen: the
  homepage heading ("Where to next?"), "Picking dates" and the dates footer,
  the photo fallback icon, every leaderboard row instead of a top 3, and
  two-letter initials. One test parks the pointer, since hovering a new card
  marks it seen.
