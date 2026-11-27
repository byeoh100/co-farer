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
