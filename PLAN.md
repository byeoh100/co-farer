# Co-farer: build plan

This is the code plan for the
[Co-farer Master Spec](https://claude.ai/artifact/GvLauMNkadF9e9mYWSecsH)
(copy in `docs/SPEC.md`). How to work through it is in `docs/BUILD_GUIDE.md`.
**The spec decides what the app does; this file decides how it's built.** If
they disagree, the spec wins. Fix this file to match it.

Co-farer is a group trip planner where friends decide on dates, where to
stay, and how to get there together. Budgets are shared with the trip by
default; anyone can switch theirs to private, and it still counts.

---

## 0. Build rule: one module at a time

Build in this order. Each module must work end to end, be tested with at
least two users, and be **deployed** before the next one starts. If time runs
out, stop at the last finished module and write up the rest as next steps.

| # | Module | Priority | Rough target |
|---|---|---|---|
| 1 | Core: trips, invites, roles, budgets | Must | Day 1 |
| 2 | Dates | Must | Day 2 |
| 3 | Housing (builds the shared suggest-research-vote engine) | Must | Day 3 |
| 4 | Transportation | Should | Day 4 |
| 5 | Notes | Should | Day 4 |
| 6 | Activities (reuses engine) | Nice | Day 5 if time |
| 7 | Food (reuses engine) | Nice | Day 5 if time |

Stretch, only after the module it belongs to is deployed: gas estimates (4),
the best-window helper (2), and automatic deadline locking with email
reminders (3).

Day 5 is reserved for the two-user test pass, a real dry run, the writeup and
the final deploy, whatever else is unfinished.

**How to direct the coding agent:** give it one module section at a time
(for example "Build §4.2 Dates, nothing else"), plus §2 and §3. Don't hand it
the whole spec and ask for the app.

---

## 1. What is already in the repo

- DeepSpace scaffold (create-deepspace 0.44.2).
- `src/schemas/trip-schemas.ts`: Core schemas only (§4.1).
- `src/actions/trip-access.ts`: `requireMember` and `requireOrganizer`
  guards, written in full.
- `src/actions/index.ts`: Core action stubs.
- `src/lib/budget-fit.ts`: the per-category fit counts, the group price
  (the average of every set budget), and the person's own budget summary
  (essentials-only total), all written in full. Its tests check that fit
  output holds only counts. (Updated by the Planned Changes Spec, Change 1.)
- `src/schemas.test.ts`: pins the access rules and runs the SDK's
  `lintSchemas`.
- **Status:** `tsc`, `eslint` and 14 unit tests pass (11 for Co-farer, 3 from the template). Registered, deployed
  empty at https://co-farer.app.space, code on GitHub (byeoh100/co-farer); see §8.

---

## 2. Access model (applies to every module)

- **A trip is a "team".** Membership is stored in `team_members` (`teamId`,
  `userId`, `status`). DeepSpace's `'team'` read rule shows a row only to
  members of that row's trip. Every trip-scoped collection uses
  `read: 'team'` with `teamField: 'tripId'`.
- **All trip writes go through server actions.** In DeepSpace, permission to
  create a row doesn't check trip membership, so a direct client write could
  insert rows into someone else's trip. Every collection therefore sets
  `create/update/delete: false`. Actions run with record permissions off, so
  **every action starts with `requireMember` or `requireOrganizer`**. The
  caller is `ctx.userId`, never a parameter.
- **Budgets:**
  - The owner-only `budgets` collection (`read: 'own'`) holds all figures
    and one `isPublic` switch (public by default).
  - `public_budgets` (`read: 'team'`) has a row for every category a person
    has set while their budget is public, and none while it's private.
    `setMyBudgets` keeps the two in sync.
  - Fit counts and the AI's group price are computed in actions, which can
    read all budgets, public or private; only counts and the average leave.
- **Food preferences are public** (spec decision), so Module 7 stores them in
  a `team`-read collection. They're never mixed into budgets.
- **Admins get no extra read rights on trip data.**
- **Leaving a trip:**
  - Membership is set to `status: 'left'`; the row isn't deleted, so the
    notes board can gray out that person's notes.
  - `leaveTrip` calls a cleanup function for each module that has been built:
    remove votes, seat claims and availability. Each new module adds its
    cleanup there. (The spec names only votes and seat claims. Removing
    availability is an assumption: confirm it with the human when building
    Module 2.)
  - Fit counts and price bands only include active members.
  - The organizer can't leave in v1.

**Known DeepSpace behaviors, found by reading the SDK 0.44.2 source:**
- The team read rule is `tripId IN (my trips) OR _created_by = me`. Rows an
  action creates list the caller as creator, so someone who leaves still sees
  rows they created. Acceptable; mention it in the writeup.
- When someone joins, DeepSpace is supposed to refresh their live data, but
  the code that triggers that reads `record.data.UserId` (capital U), while
  the column is named `userId`. So after `joinTrip`, the joiner's page
  probably won't update by itself. **Workaround:** remount the `RecordScope`
  (change its `key`) after joining. **Verify in Module 1** with two browsers,
  and report it to DeepSpace if confirmed.
- **Confirmed in Module 1:** the join-refresh bug is real; the remount
  workaround is in `src/lib/scope-refresh.ts`.
- **Found in Module 2:** with `teamField: '_rowId'`, a team member who didn't
  create the row gets it on load but **never gets live updates to it** (only
  the creator does). `trips` now has a real `tripId` column, which is the team
  field, set equal to the row id by `createTrip`. Trips created before this
  change have no `tripId`, so only their organizer can still see them.
  Report this to DeepSpace too.
- **Found in Module 3:** the team read rule passes one SQL value per trip
  you belong to, and the Durable Object's SQLite allows about 100, so a person
  in more than ~100 trips can't load trip data ("too many SQL variables").
  Real users won't get near that; test accounts did (Alice reached 117).
  Tests now delete their old trips through `cleanupMyTestTrips`, which works
  only for @deepspace.test accounts on a local server. Report this too.

---

## 3. Shared pieces (build once, reuse)

- **Budget fit** (`src/lib/budget-fit.ts`, done):
  - Fit is counted per category, against that category's budget.
  - Counts always show (Planned Changes Spec, Change 1 removed the
    3-response minimum). Every set budget counts, public or private.
  - "Price not found" is left out of the fit check.
  - The person's own total adds up **essentials only (housing + gas)**.
  - Food and activity prices are shown for reference only and never checked.
- **Suggest-research-vote engine** (built in Module 3, reused in 6 and 7):
  - `boards`: one per (trip, module), with `lockable`, `status`, `deadline`
    and `winningOptionId`.
  - `options`: `boardId`, `module`, `title`, `url`, `source` (ai/member),
    `researchStatus`, `research` JSON, `estPricePerPerson` (nullable),
    `stale`, and `fit` JSON for housing only.
  - `votes`: approval voting, `uniqueOn [optionId, userId]`.
  - Actions:
    - `suggestOptions` (N = 5 for housing, 10 otherwise; "search for more"
      calls it again)
    - `addOption` (paste a link or a name, then research it)
    - `researchOption`, `toggleVote`
    - `setOptionPrice` (any member fills in a missing price; refits
      housing; adds a `priceSource` of ai/member to options)
    - `setDeadline`/`clearDeadline` and `lockBoard` (lockable boards only)
- **AI research pipeline**, used by `suggestOptions` and `researchOption`:
  1. Check the trip's cap (§6), then increment `researchCallsUsed`.
  2. `exa/search` with the destination, the locked dates (housing), the group
     price band (housing, only if `groupPriceBand` isn't null) or dietary tags
     (food).
  3. `anthropic/chat-completion` with no tools. Its instructions treat page
     text as untrusted data and allow citing only URLs from the search
     results. It returns JSON, checked with zod.
  4. If no price was found, `estPricePerPerson` is null and the option shows
     "price not found".
  - Confirm request shapes first:
    `npx deepspace integrations info exa/search` and
    `… anthropic/chat-completion`.

---

## 4. Modules

Each module lists: data, actions, UI, edge cases, and "done when". Add the
module's schemas to `src/schemas.ts` and its actions to `src/actions/` only
when you start building it.

### 4.1 Core: trips, invites, roles, budgets

- **Data (written):** `trips`, `team_members` (plus `displayName` and
  `imageUrl`, a per-trip copy of the member's profile), `budgets`,
  `public_budgets`, `profiles` (each person's own name and picture,
  owner-only). DeepSpace manages `name` and `imageUrl` on `users` from the
  sign-in identity, so they can't hold a custom profile. On `users`,
  non-admins get no direct writes, and `roster: 'read-policy'` keeps names
  and pictures out of the app-wide user list, so they're visible only to
  tripmates.
- **Actions:**
  - `createTrip`: creates the trip and the organizer's membership; random
    invite code of 10+ characters.
  - `getInvite`: trip name for the join page; no membership needed; reveals
    nothing else.
  - `joinTrip`: running it twice is harmless, and it reactivates a member
    who left.
  - `leaveTrip`.
  - `rotateInviteCode`: organizer only.
  - `updateMyProfile`: the one action that isn't about a single trip
    (approved exception to `requireMember`). Saves your name and picture
    to `profiles`, then copies them into each of your memberships. Pictures must come from
    the app's own file storage (`/api/files/...?scope=app`).
  - `setMyBudgets`: upserts your budget row and syncs `public_budgets`:
    while public, a row for every set category; while private, none.
    (One switch since the Planned Changes Spec, Change 1.)
- **Pages:**
  1. Landing page and sign in.
  2. **My trips**: list plus create.
  3. **Join** (`/join/[code]`): trip name and a join button.
  4. **Settings** (`/trip/[id]/settings`), shown right after joining:
     - four budgets and one "Share my budget with the trip" switch (on by
       default);
     - the essentials-only total and over-budget flags;
     - a clear note on what the switch does: private numbers aren't shown
       to others but still count.
  5. **Trip page** (`/trip/[id]`): `TripOverview`, laid out in
     `docs/LAYOUT.md`, not tabs. It has the header (members as overlapping
     profile-picture circles, your essentials total, a link to settings), a
     `DatesBar` slot, and four section slots. A section that can't be used
     yet shows disabled (grayed card on mobile, thin labeled bar on desktop)
     and shows a notice when clicked: "This part isn't ready yet", or for
     Housing before dates lock, "Housing opens once the dates are locked".
     Each module later fills its slot with a `<Name>Summary` and a
     `<Name>Full` component. The shared `ExpandableSection` (expand
     animation, focus handling, `?section=` URL state) is built in Module 3,
     the first module with a section to expand.
  6. **Profile** (`/settings`): name and picture. Without a picture, the
     avatar is the first letter of the first name on a color fixed per person.
- **Members:** overlapping circles, Google Docs style. Online members are in
  color and offline ones grayed, from a per-trip presence room
  (`trip:<tripId>`) that only active members can join
  (`src/server/realtime-routes.ts`). Clicking the circles opens the members
  panel: names, public budgets, and for the organizer the invite link.
- The starter's in-app AI chat isn't in the spec. Hide it in v1: the chat UI
  is off (no `ai_chats` schema) and `<AgentTools />` is unmounted. Its tools
  would run as the signed-in user, so they couldn't read anyone else's
  budgets anyway.
- **Done when (two browsers):**
  - A creates a trip, B joins by link and lands on settings, and the trip
    then shows for B without a manual reload (this is the join-refresh check
    from §2).
  - B sets a private housing budget of $150. A gets no B row from `budgets`,
    and no `public_budgets` row for B.
  - B makes gas public. A sees B's gas number next to B's name.
  - A non-member calling `setMyBudgets` with A's `tripId` gets `not_a_member`.

### Planned Changes Spec, Change 1: budgets public by default (2026-11-22)

- One switch for the whole budget (`budgets.isPublic`), public by default.
  Public: every set category shows next to the person's name
  (`public_budgets`). Private: nothing shows, but the numbers still count.
- Every set budget counts in fit and in the AI's search price; no 3-response
  minimum and no $50 rounding. `groupPriceBand` is the plain average,
  scaled to the group by the search.
- Existing data: rows without `isPublic` become public if any category was
  public under the old switches, else private (`readIsPublic`; the hourly
  `budget-visibility` cron task writes it). The old `publicCategories`
  column stays only for that move.
- `budgets` stays owner-only; server actions and membership checks unchanged.

### Planned Changes Spec, Change 2: a more visual overview (2026-11-22)

- Housing card: before locking, a small thumbnail beside each option (the
  leading one on mobile, the top 3 on desktop); once locked, the chosen
  place's photo as the main image, then its name, nights, price per person
  and total.
- Additional card: the top 3 activities and top 3 places to eat as labeled
  thumbnails; food places that may not suit someone keep the triangle.
- `Thumb` (`src/components/trip/Thumb.tsx`): fixed size, cropped to fit,
  photos from research only; no photo or a broken one shows a letter tile.
  Travel and Notes cards unchanged. No new searches or uploads.

### 4.2 Dates

- **Trip page:** `DatesBar` (the summary in the bar) with its calendar
  pop-up inside (`docs/LAYOUT.md`), not an expanding section.

- **Data:**
  - `availability`: `tripId`, `userId`, `start`, `end`. Dates are stored as
    `YYYY-MM-DD` text, with no times, to avoid time-zone shifts.
  - Added to `trips`: `datesStatus` (open/locked), `datesStart`, `datesEnd`.
- **Actions:**
  - `addAvailability` / `removeAvailability`, for your own ranges; any number
    of ranges, which don't need to overlap.
  - `lockDates` (organizer).
  - `unlockDates` (organizer): resets housing (see edge cases below).
- **Logic:** `src/lib/overlap.ts` is a pure function that returns the number
  of active members free each day. Unit-test it, including ranges that touch
  and ranges that overlap.
- **UI:**
  - A calendar for adding ranges.
  - An overlap calendar: each day shows the circles of the people free that
    day (up to 3, then "+N"), instead of a heatmap (the human's call in
    Module 2); tapping a day lists who's free.
  - Stretch: a "Help me find the best window" checkbox. The organizer enters a
    trip length, and `bestWindows(counts, nights)` highlights the top
    stretches.
  - Built (stretch): in the organizer's "Final dates" mode. Trip length is
    in nights (a window is nights + 1 days). The top 3 non-overlapping
    windows are ranked by people free every day, then person-days, then
    earliest; past days are skipped. Tapping one selects it, ready to lock.
    Computed in the browser from availability; nothing is stored.
- **Edge cases:**
  - Before unlocking, the app warns that housing will have to be researched
    again.
  - When the organizer confirms, the housing board goes to
    `waiting_for_dates`, votes are cleared, and options are marked `stale`.
  - When the new dates are locked, the board reopens and stale options can be
    re-researched; each re-research counts toward the cap.
- **Decided with the human (Module 2):**
  - Your own overlapping or touching ranges blend into one.
  - Limits: the end can't be before the start; a range can't end in the past;
    at most 60 days per range entered and 20 ranges per person (after blending).
  - Availability is read-only while the dates are locked.
  - Leaving a trip removes your availability.
  - Until Housing exists, unlocking only says availability is kept; Module 3
    adds the "housing will be researched again" warning to `unlockDates`
    through `src/actions/dates-unlock.ts`, shown only when housing has options.
- **Done when:** two users add ranges and the per-day counts match. The
  organizer locks, and the date bar shows locked dates for both. A member
  calling `lockDates` is refused.

### 4.3 Housing (builds the engine)

- Also builds the shared `ExpandableSection` (`docs/LAYOUT.md`), deferred
  from Module 1.

- **Trip page:** `HousingSummary` (`limit` 1 on mobile, 3 on desktop) and
  `HousingFull`, in the Housing section.

- **Data:** `boards`, `options`, `votes` (§3). The housing board is
  `lockable`, has `fit` on its options, and starts as `waiting_for_dates`.
- **Flow:**
  - Once dates lock, the board opens, and "Suggest" makes the top 5 options
    around the group's average housing budget (every set budget, public
    or private), scaled to the group.
  - Anyone can paste a link or add a name, and the AI researches it.
  - Each option card shows a summary, price per person, pros and cons,
    sources, and fit ("over the housing budget for 2 of 6").
- **Locking:**
  - The organizer can set, change or remove the deadline, and can lock early.
  - `lockBoard` with no option picks the top vote; on a tie it returns `tie`,
    and the organizer picks.
  - Locked housing's price per person becomes each member's housing
    *estimate* on their settings page.
- **Fit refresh:** recompute `fit` when an option is researched and when
  anyone changes their housing budget. `setMyBudgets` triggers it for open
  housing boards.
- **Stretch: auto-lock.**
  - A cron job runs every 15 minutes and locks the top option when the
    deadline has passed; on a tie, it stays open and emails the organizer.
  - It emails a reminder to members who haven't voted, 24 hours before the
    deadline.
  - Confirm the email request shape first: `integrations info email/send`.
- **Done when (two browsers):**
  - Before dates lock, the Housing section says it's waiting.
  - After lock, suggestions show sources.
  - A pasted link gets researched.
  - Votes update live in both browsers.
  - Fit counts change when B changes their budget.
  - Locking works and blocks later votes.
  - The cap message shows at 25 calls (set it to 2 temporarily to test).

- **Decided with the human (Module 3):**
  - Research model: Claude Opus 5.5 at first; switched to Claude Haiku 5.5
    (`RESEARCH_MODEL` in `src/lib/limits.ts`) when the human asked for a
    cheaper model after the stretch goals. Haiku costs about 1/40 per token
    and is billed at standard pricing on DeepSpace's free tier.
  - No real AI calls during development until the human says so; the reply
    reader accepts likely formats and logs only the reply's keys if unknown.
  - Automated tests use a local AI stand-in (test accounts on a local server
    only; `src/actions/local-test.ts`). Manual checks use the real AI.
  - At the deadline the top-voted option locks automatically (cron every 15
    minutes, plus any vote after the deadline). A tie stays open, voting
    closed, and the organizer picks.
  - Every trip must have a destination; organizers can edit it.
  - Prices are stored as the total for the whole stay and group (what the AI
    reads from listings, and what members type in). The per-person share is
    the total ÷ the current group size, recomputed when people join or
    leave, and cards show both.
  - One research call = one "Suggest" or one researched link/name.
  - After the first manual test:
    - The deadline is a number of days to decide (1–30), not a date and
      time; the status counts down ("Voting closes in 3 days").
    - A place can be removed, with its votes, by whoever added it (or asked
      for the suggestion) or by the organizer.
    - Unlocking the dates deletes housing's places and votes instead of
      marking them out of date; after relocking, Suggest starts fresh. The
      research count is not reset.
    - Places you haven't pointed at or tapped yet have a "New" outline. What
      you've seen is kept in your browser only.
    - Cards show a photo when the search returns one for that page (Exa's
      `image` or `extras.imageLinks`). The photo comes from the search
      results, never from the model, and only `https` images load, with no
      referrer.
    - Search order (the human's list): one search limited to Booking.com,
      Expedia, KAYAK, Skyscanner and Trivago (prices, reviews, photos),
      plus one that excludes them, to find the places' own websites for
      specifics. Google Hotels is left out because it lives on google.com.
      Both searches together count as one research call. Exa also returns
      the passages that mention prices and ratings, and the model may use an
      advertised nightly or "from" rate.
    - (Superseded by the Planned Changes Spec, Change 1: no minimum and no
      rounding for anyone. Kept as the record of the Module 3 decision.)
    - Trips of 1–2 members skip the 3-budget minimum: fit counts show (and
      the search's price band uses their budgets) as soon as one budget is
      set. A solo trip reads "Fits your housing budget". From 3 members on,
      the minimum applies again, switching automatically as people join.
    - The search's price band no longer waits for 3 budgets. When only some
      people have set one, it's centered on their average (rounded to $50)
      and the search also gets the whole group's total (that × group size),
      so the people without a budget are counted at the average. One budget
      in a trip of 3+ gives no band, since it would be that person's
      number. Fit on the cards still follows the rule above.

### 4.4 Transportation

- **Trip page:** `TravelSummary` and `TravelFull`, in the Travel section.

- **Data:**
  - Added to `trips`: `defaultMeetingPoint`.
  - `travel`: `tripId`, `userId`, `mode` (driving / riding / flying / other /
    undecided), `startPoint` (null = the trip default), `seats` (drivers),
    `flightInfo`, `arrivalTime`, `note`. Plus `mpg` for the stretch.
  - `seat_claims`: `tripId`, `driverUserId`, `riderUserId`, with
    `uniqueOn [tripId, riderUserId]` so each rider holds one seat.
- **Actions:**
  - `setMyTravel`. Switching away from driving releases that car's claims;
    lowering seats below the current claims is refused.
  - `claimSeat` / `releaseSeat`. To handle two riders grabbing the last seat
    at once: insert the claim, re-count, and roll back if the car is over
    capacity.
- **UI:**
  - A carpool board grouped by start point. For one shared start, like
    campus, it's a single group.
  - Tap a car to claim a seat; full cars are marked.
  - Flyers and "other" travelers are listed with their details; undecided
    people show as "not decided".
  - The app doesn't suggest who rides with whom.
- **Stretch: gas.**
  - The organizer enters one-way miles. No maps integration was confirmed, so
    the distance is entered by hand; an AI lookup is a later option.
  - Gas price is a default the organizer can edit.
  - Per person: `2 × miles ÷ mpg × gasPrice ÷ people in car`, with a default
    mpg if the driver skips it.
  - The result is that person's gas estimate on their settings page, checked
    against their gas budget.
- **Leave cleanup:** remove the person's claims. If they were a driver,
  release their riders' claims.
- **Done when:** A drives with 3 seats and B claims one; both see it live.
  The car shows full at capacity. B switches to flying and the seat frees up.

- **Decided with the human (Module 4):**
  - The organizer sets the trip's meeting point in Trip details (optional).
    Drivers can set their own starting point; cars are grouped by it.
  - Seats are passenger seats, not counting the driver (1–12).
  - The driver can take a rider out of their car (with a confirm), and
    riders can leave a car themselves. Either way the rider goes back to
    "not decided".
  - Riders have a pickup note (often an address), shown only to the people
    in that car: `pickup_notes` is owner-only, and the car reads it through
    `getCarPickups`, which checks the caller is the driver or a rider. The
    claim row carries only a counter (`pickupVersion`) so the car refetches.
  - Travel is usable right away, before the dates lock.
  - "Another way" has a dropdown (flight, train, bus, drop-off, other),
    optional from/to dates and a details line. ("Flying" in the plan's data
    list is `mode: 'other'` with `otherKind: 'flight'`.)
  - Gas estimates wait until the end, with the other stretch goals.
  - Gas (stretch, built after all modules): the organizer enters one-way
    miles and the gas price in the Travel section (default $4.75/gal);
    drivers can add their mpg (default 25). Each person in a car, the driver
    included, gets `2 × miles ÷ mpg × price ÷ people`, shown on the car and
    used as their gas estimate (settings page and essentials header).
    Flyers and others have no gas estimate.

### 4.5 Notes

- **Trip page:** `NotesSummary` and `NotesFull`, in the Notes section.

- **Data:** `notes`: `tripId`, `authorId`, `text`.
- **Actions:**
  - `addNote`.
  - `editNote` / `deleteNote`, for your own notes.
  - `removeNote` (organizer, any note, including ones from people who left).
- **UI:**
  - A board of sticky notes showing who wrote each, updating live.
  - Notes whose author has `status: 'left'` are grayed out and marked
    "has left".
  - Not in v1: colors and checkboxes.
- **Done when:** the live add, edit and delete flow works across two
  browsers. B leaves, and B's notes gray out but stay. The organizer removes
  one.

- **Decided with the human (Module 5):**
  - Notes are at most 280 characters, newest first, at most 200 per trip.
  - Notes is usable right away, like Travel.
  - Edited notes say "edited". One sticky color for all notes.
  - Only the organizer can remove notes from people who left; they go
    back to normal if the person rejoins.

### 4.6 Activities (reuses engine)

- **Trip page:** the Activities part of `AdditionalSummary` and
  `AdditionalFull`, in the shared Additional section.

- The board isn't lockable and has no deadline. The list is ranked by votes.
- `suggestOptions` makes 10. "Search for more" calls it again, and anyone can
  paste a link.
- Each activity shows a description, an estimated price per person
  (reference only, never checked against a budget) and a source link.
- **Done when:** suggestions appear, a pasted link works, and the ranking
  changes as people vote.

### 4.7 Food (reuses engine)

- **Trip page:** the Food part of `AdditionalSummary` and `AdditionalFull`,
  next to Activities in the Additional section.

- **Data:** `food_prefs`: `tripId`, `userId`, `dietary[]`, `likes`,
  `avoids`. Read access is `team`, since the spec makes these public.
  Editing happens in a new section of the settings page.
- `suggestOptions` makes 10 places using the group's dietary tags and likes.
  Research returns an `accommodates[]` list.
- **Warning:**
  - A place that doesn't suit everyone **stays on the list** with a warning
    triangle and a short note, for example "may not suit: vegetarian (2)".
  - It's computed in `src/lib/food-warnings.ts`, a pure function with unit
    tests.
- Prices are for reference only. The list is ranked by votes and never
  locked.
- **Done when:**
  - B marks vegetarian; suggestions reflect it.
  - A place without vegetarian options shows the triangle.
  - Ranking works.

- **Decided with the human (Modules 6–7, built together as "Additional"):**
  - Activities and Food ship as one module, in one Additional section with
    two separate lists (side by side on desktop, stacked on mobile).
  - Both are usable right away; searches use the dates only once locked.
  - Typed-in prices are per person (0 = free), for reference only.
  - Search order: Activities on TripAdvisor, AllTrails and Viator first;
    Food on TripAdvisor and Yelp first; then the places' own websites.
  - Dietary tags: vegetarian, vegan, pescatarian, gluten-free, dairy-free,
    nut allergy, shellfish allergy, halal, kosher; likes and avoids are free
    text. `food_prefs` is team-read (the spec makes them public).
  - A need the sources don't confirm counts as "may not suit" (safer for
    allergies). The warning is computed in the browser from the public food
    preferences (`src/lib/food.ts`), so it updates live.
  - Unlocking the dates leaves Activities and Food alone. Leaving the trip
    removes your food preferences.

---

## 5. Integrations

| Integration | Used for | Module |
|---|---|---|
| Synced records, team read rule, owner-only reads | Live data, per-trip isolation, private budgets | All |
| Server actions | Every write, and the security checks on it | All |
| `exa/search` | Sources for options | 3, 6, 7 |
| `anthropic/chat-completion` | Structured summaries and prices | 3, 6, 7 |
| Cron + `email/send` | Auto-lock and reminders | 3 (stretch) |

**Deliberately not used (each gets a line in the writeup):**
- **Payments:** nothing is booked.
- **fal image generation:** decoration, not a decision.
- **Google OAuth calendar:** each user would have to grant access, and
  calendar syncing is out of scope.
- **The messaging feature:** DeepSpace's own docs say its channels are
  public, which would leak across trips. Notes cover the need.
- **Collaborative documents (Yjs):** the spec chose a sticky-note board over
  a shared page.
- **Maps:** out of scope; the gas distance is typed in by hand.
- **The in-app AI assistant:** not in the spec.

---

## 6. AI limits

- **About 25 AI research calls per trip**, shared by housing, activities and
  food. Stored as `trips.researchCallsUsed` and checked before every Exa call.
  At the cap, show a clear message instead of researching.
- **"Price not found"** instead of guessing, and the option is left out of
  the fit check until someone adds a price. Any member can set it with
  `setOptionPrice` (§3), and the card then labels it "added by a member", not
  "researched".
- **Cache:** an option isn't re-researched unless someone asks or it's
  marked `stale`.
- The spec says these limits can change later. They're constants in
  `src/constants.ts`.

---

## 7. Testing

- **Unit tests (done):** schema rules and lint, fit counts, price band,
  budget summary. Add `overlap`, `bestWindows`, `food-warnings` and gas math
  as each module is built.
- **Two-user end-to-end tests** in `tests/*.spec.ts`, run with `npm test`
  (plain Playwright against a local workerd with the test-only sign-in, since
  migration Phase 2e; `npx deepspace test run all` on `main`): one spec file
  per module, covering its "done when" list.
- **Privacy tests, which must always pass:**
  - A can't read B's private budget figures through `budgets`,
    `public_budgets`, `options.fit`, or a non-member action call.
  - A private budget is never readable by another member (`budgets` is
    owner-only), yet still counts in fit (tests/housing.spec.ts).
- **Real-world testing:** first, mock trips of 2 to 3 people, to test joining,
  dates and voting. Then the 5 to 6 person Cachuma Lake group as the final
  test. Log what broke for the writeup.

---

## 8. Getting it running (on your machine)

```sh
cd co-farer && npm install
npx deepspace auth login
npx deepspace auth whoami          # make sure it's the right account
npx deepspace app init --json      # mints the app id into wrangler.toml
# Decide where the code lives ONCE (permanent). For GitHub, add the remote
# BEFORE the first deploy, and don't run `deepspace push`.
git remote add origin https://github.com/byeoh100/co-farer.git
git add -A && git commit -m "Register app" && git push -u origin main
npm run validate                   # type check + unit tests (14 at setup)
npx deepspace dev start            # local
npx deepspace deploy               # → co-farer.app.space
npx deepspace app source           # should say GitHub
```

On the `self-host` branch (docs/MIGRATION.md): `npm run dev` builds and runs
the app on workerd at http://localhost:8080, and `npm test` runs the
end-to-end tests. Nothing on that branch deploys to DeepSpace.

Requirements (from `package.json` engines): Node 22.15+, 24 or 26 (not 23
or 25), and npm 11.6+. The step-by-step version, including test accounts,
is Phase 1 of `docs/BUILD_GUIDE.md`.

---

## 9. Agent log (for the writeup)

| When | Agent did | I verified / changed |
|---|---|---|
| Day 0 | Scaffolded the app (create-deepspace 0.44.2). Read the SDK source to choose the access model. Found the create-without-membership gap and the `UserId` join-refresh bug. Wrote the first plan. | I identified the project requirements and brainstormed the idea. |
| Planning | Voice sessions: wrote Spec v1, the five module docs and the priorities list, then merged them into the Master Spec, with conflicts resolved, the screens and flow, edge cases and AI limits. | You made every product decision: per-category budgets, essentials-only total, public food prefs, wait for dates before housing, a sticky-note board, warnings instead of filtering out food places. |
| Plan update | Rewrote this plan and the code to match the Master Spec. Cut the code back to Core only. Replaced the single private constraints table with private `budgets` plus a `public_budgets` projection, so each category gets its own privacy switch. Added the rounded group price band. Tests: 14 passing (11 new). | Section 2 and 4.1 relating to data access and core application functions have been read and verified. The application's goals have been laid out correctly. |
| Setup (2026-11-21) | Phase 1: renamed the project from Trip Quorum to Co-farer in code, config and docs (your call). Registered the app as `co-farer`, added the GitHub remote and pushed, then made the first deploy to https://co-farer.app.space; `app source` confirms the code lives on GitHub. Validate: 14 tests pass. `alice@`/`bob@deepspace.test` were already taken (test emails are global across all developers), so the test accounts are `alice-cofarer@` and `bob-cofarer@deepspace.test`. Saved the Exa and Anthropic request shapes to `docs/integrations.md`; Anthropic printed no output schema. | I could reach the website and sign in with my email successfully. |
| Layout update (2026-11-21) | Added `docs/LAYOUT.md` and the two mockups. The trip page is now one overview (`TripOverview`) instead of tabs: a header with profile-picture circles, a date bar whose calendar opens as a pop-up (no dimmed screen), and four expanding sections. Activities and Food share "Additional". Unavailable sections stay visible but disabled, which replaces "hidden". Before dates lock, the date bar shows only "Not locked yet"; the overlap hint moves to the best-window stretch. Before estimates exist, the header total reads "Budget $X · no estimates yet". Updated the spec, plan and build guide to match. UI only: no actions, schemas or privacy rules changed. | Verified that Claude understood the layout changes requested. |
| Module 1: Core (2026-11-21) | Built the Core actions (`createTrip`, `getInvite`, `joinTrip`, `leaveTrip`, `rotateInviteCode`, `setMyBudgets`, `updateMyProfile`), each guarded by `requireMember`/`requireOrganizer` except `updateMyProfile` (approved exception: it isn't about a single trip, uses only `ctx.userId` and touches only the caller's rows). Pages: landing, My trips, Join, trip settings (budgets, privacy switches, Leave), `TripOverview` with disabled sections, and Profile with a picture-centering pop-up. Members show as Google Docs-style circles, in color when online and gray when not, from a per-trip presence room that only active members can join. Your decisions: one profile shown only to tripmates (`roster: 'read-policy'`, per-trip copy in `team_members`); default avatar is the first initial on a color fixed per person; disabled-section notice says "This part isn't ready yet"; `ExpandableSection` moved to Module 3; on leaving, public budget rows are removed and the private row is kept; add the picture cropper. What broke: (1) the join-refresh bug from §2 is real (the SDK reads `UserId`); the `RecordScope` remount workaround passes the two-user test. (2) Saving a profile failed because DeepSpace manages `name` and `imageUrl` on `users`; moved profiles to an owner-only `profiles` collection and gave non-admins no direct `users` writes. (3) The e2e run hung because Playwright waits on `aria-disabled` buttons; the test now forces the click. (4) The starter's API-status test was flaky (a 100 ms loading state); lengthened it to 1 s. (5) A raw `budgets` read through the browser tool route isn't available in this SDK (404), so that check was dropped; the schema test pins `budgets` as owner-only. Tests: 33 unit, 15 e2e passing. Deployed to https://co-farer.app.space. | Tested all built features with the following flow: logged into site with 2 accounts. Created a trip on account A. Tested private and public budget visibilities. Invited B to trip, checked budget visibilities. Checked "not online" greyed out feature. Tested customizing profile. Noted that we need a icon centering widget. Trip privacy outside of link tested. Phone view tested. Tested leaving the trip. Tested links and expired links. |
| Module 1 fix (2026-11-21) | Safari: copying the invite link failed on the first open of the members panel (the async clipboard API was refused; it never reproduced in Chromium). Added a fallback that selects the link box and uses the older copy command, plus an e2e test that forces the clipboard API to refuse. Also found that Safari can't sign in on the local dev server: DeepSpace's session cookie is `__Secure-`/`Secure`, which Safari drops on plain `http://localhost` (Chrome and Firefox allow it). Safari testing uses the live site. Deployed. | Found that copying the invite link in Safari said "could not copy link" the first time the members panel was opened, but worked after a refresh. Found that Safari sign-in didn't work on the local server. Approved deploying the fix and verified sign-in works on the live site. |
| Module 2: Dates (2026-11-21) | Built `availability` plus the trip date fields; the actions `addAvailability` (blends your own overlapping or touching ranges), `removeAvailability`, `lockDates` and `unlockDates` (organizer only), with an empty "when dates unlock" step list for Module 3; leave cleanup removes your dates. `src/lib/dates.ts` holds the pure date logic (validation, merging, per-day counts, month grid; 18 unit tests). The date bar shows "Not locked yet" or the locked dates with how many are free for all of them. The calendar pop-up is animated, closes on an outside click or Escape, and doesn't dim the page. Organizer has a "Final dates" mode, and unlocking asks to confirm. Your decisions: availability removed on leave; simple unlock warning until Housing exists; read-only while locked; limits (no reversed or past ranges, 60 days per range, 20 ranges); blend overlapping ranges; show each free person's circle on the calendar instead of a heatmap; thin dark outline on all profile circles. What broke: (1) a DeepSpace bug: with `teamField: '_rowId'`, only a row's creator got live updates, so B never saw the lock; `trips` now uses a real `tripId` column (older trips are visible only to their organizer). (2) The profile e2e test left a fake picture and name on the shared Alice account; it now restores them, and avatars fall back to the initial when a picture fails to load. (3) The unlock confirmation would close with the pop-up, so it moved outside the pop-up. Tests: 51 unit, 18 e2e passing. Deployed. | Asked for overlapping date ranges from the same person to blend into one. Found a bug where joining from an invite said "trip not found" even though the new member showed up greyed out. Replaced the heatmap idea with each person's circle on the days they're free. Noted that white profile pictures were hard to see; asked for a thin black outline on the calendar and the online status. Verified everything worked on the live site before moving on. |
| Module 3: Housing (2026-11-21) | Built the shared engine (`boards`, `options`, `votes`) and Housing: Suggest (Exa search, then Claude Opus 5.5 with no tools; the search uses only the rounded group price band), add a link or name, live approval voting, fit counts, prices, a deadline that auto-locks the top option (cron every 15 minutes; a tie stays open for the organizer), lock early, and the 25-call cap. Built `ExpandableSection` (the card grows to fill the page, `?section=housing`, Escape and Back close it). Destination is now required and editable by the organizer. Safety in code: search text is wrapped as untrusted data, sources not in the search results are dropped, a missing price stays "Price not found". Automated tests use a local AI stand-in for test accounts only. What broke: (1) another DeepSpace limit: the team read rule passes one SQL value per trip, so an account in ~100+ trips can't load trip data; tests now delete their own old trips (`cleanupMyTestTrips`, local test accounts only), and local data was cleared once with your OK. (2) The Core test expected Housing to say "isn't ready yet"; it now expects the dates notice. After your first test: deadline in days, remove a place, total prices shown with per person, unlocking clears housing, "New" outlines, photos on cards; searches go to the booking and comparison sites first, then the places' own websites, with price passages pulled out; trips of 1–2 members show fit and use their budgets for the price band with just one budget set (spec and build guide updated); when only some people set a budget, the search's price range is their average (per person and × group size). Tests: 81 unit, 20 e2e passing. Deployed. | Tested the housing section with the real AI. Changed the voting deadline to a number of days instead of a date and time. Pasted random links on purpose and found the cards said the info was unrelated, with no way to remove them; asked for a remove option. Changed manual prices to the total for the stay, shown alongside the per person price. Found that unlocking and relocking the dates left old places that "5 new AI suggestions" couldn't replace; asked for housing to clear instead. Asked for new suggestions to be outlined until moused over, and for photos of each place. Noticed the AI usually couldn't find prices and the photos weren't great; asked for the search to prioritize Google Hotels, KAYAK, Skyscanner, Trivago, Booking.com and Expedia, plus the hotel's own website for specifics. Asked why fit needed 3 budgets; decided that solo and 2-person trips should show fit without the hiding, since a solo traveler only has their own budget and two people travelling together already know each other's. Kept the 3-budget rule for groups of 3+. Asked for the search not to ignore budgets that are set: when only some people set one, average them and multiply by the group size to get a price range that includes everyone. |
| Module 4: Transportation (2026-11-21) | Built `travel`, `seat_claims` and `pickup_notes` plus the trip's meeting point; the actions `setMyTravel`, `claimSeat`, `releaseSeat`, `setPickupNote` and `getCarPickups`, each guarded by `requireMember`. `src/lib/travel.ts` holds the pure logic (input checks, who keeps a seat in a race, the board layout; 7 unit tests). The Travel section is usable right away: pick driving (passenger seats, optional start point), riding (tap a car), another way (flight, train, bus, drop-off or other, with from/to dates and details) or not decided. The carpool board groups cars by starting point and shows filled and empty seats and "Full"; flyers and others are listed with their details. Server rules: the last-seat race keeps the earlier claim, seats can't go below the riders, switching away from driving or leaving releases the riders. Your decisions: organizer sets the meeting point; seats exclude the driver; the driver can remove riders and riders can leave; a pickup note seen only by that car (owner-only rows, read through an action that checks the caller is in the car); Travel open before the dates lock; the "another way" dropdown with dates; gas waits for the end. The Core test now checks the disabled-section notice on Notes, since Travel is open. Nothing broke this time. Tests: 89 unit, 22 e2e passing. Deployed. | Decided the meeting point is set by the organizer, seats don't count the driver, and drivers can remove riders while riders can remove themselves. Asked for a pickup note on each seat so the driver can see addresses easily. Asked for a dropdown for things that aren't cars (flight, train, drop-off) with from/to dates. Decided to leave gas estimates for later. Tested the carpool board and approved shipping. |
| Module 5: Notes (2026-11-21) | Built `notes` and the actions `addNote`, `editNote` and `deleteNote` (your own notes only, guarded by `requireMember`) and `removeNote` (organizer only, any note). `src/lib/notes.ts` checks the text (trimmed, line breaks kept, 280 characters). The Notes section is a live board of sticky notes, newest first, each with the author's circle, name, time and "edited"; you edit or delete your own, and the organizer removes any after a confirm. Notes from people who left stay, grayed out and marked "has left". The overview card shows the count and the latest note (mobile) or the latest 3 (desktop). Your decisions: 280 characters, newest first, 200 notes per trip, open right away. The Core test now checks the disabled-section notice on Additional, since Notes is open. Nothing broke. Tests: 92 unit, 23 e2e passing. Deployed. | Agreed to the suggested note length, order, limit, and having Notes open right away. Tested the notes board and approved shipping. |
| Modules 6–7: Additional (Activities and Food) (2026-11-21) | Built both lists on the shared engine in one Additional section: Activities and Food side by side on desktop, stacked on mobile, each with Suggest 10, Search for more, paste a link or name, live votes ranked by votes, remove (adder or organizer), the "New" outline and photos; never locked, no deadline. Added `food_prefs` (team-read) and `setMyFoodPrefs`, with a Food preferences section on My settings (dietary chips, cuisines liked and avoided). Research generalized: per-list search plans and prompts (`src/lib/research-additional.ts`), per-person prices (0 = free), and an `accommodates` list for food read only from known tags. The warning triangle (`src/lib/food.ts`, pure, unit-tested) lists every need a place isn't confirmed to accommodate; places stay on the list. Your decisions: build Activities and Food together as one module; open right away; typed prices per person; TripAdvisor, AllTrails and Viator first for activities, TripAdvisor and Yelp for food, then the places' own websites; unknown dietary info counts as "may not suit"; unlocking the dates leaves these lists alone. Leaving removes your food preferences. The Core test no longer checks a "not ready" section (none are left). Nothing broke. Tests: 105 unit, 24 e2e passing. Deployed. | Asked for Activities and Food to be built as one "Additional" module, kept as separate lists. Picked the specific sites to search first, per-person prices, and the warning when a place's dietary info is unknown. Decided the lists open right away and stay when the dates are unlocked. Tested the Additional section and approved shipping. |
| Stretch: gas, best window, cheaper model (2026-11-21) | Gas: the organizer sets one-way miles and the gas price (default $4.75/gal) in Travel with `setTripGas`; drivers add mpg (default 25). Each car shows the per-person share (`2 × miles ÷ mpg × price ÷ people`, driver included), which becomes that person's gas estimate on My settings and in the essentials header, flagged when over their gas budget. Best window: `bestWindows` in `src/lib/dates.ts` ranks non-overlapping stretches of N nights by people free every day, then person-days; the organizer's Final dates mode marks the top 3 on the calendar and tapping one selects it to lock. Model: research switched from Claude Opus 5.5 to Claude Haiku 5.5 (about 1/40 the token price, standard pricing on DeepSpace's free tier). What broke: a gas price like $4.89 was refused by a floating-point "to the cent" check; the unit test caught it. Tests: 109 unit, 26 e2e passing. Deployed. | Asked for gas estimates and the best-window helper, then for a cheaper AI model. Tested and approved deploying. |
| Planned Changes Spec, Change 1: budgets public by default (2026-11-22) | One "Share my budget with the trip" switch (`budgets.isPublic`, public by default) replaces the per-category switches; while public, every set category shows next to your name. Every set budget counts in fit and in the AI's search price, public or private: removed the 3-response minimum (`tooFewResponses`, `SMALL_GROUP_THRESHOLD`) and the $50 rounding; the price is the plain average, scaled to the group. Existing rows: public if any category was public, else private (`readIsPublic`, written by an hourly `budget-visibility` cron task; untested on real old rows since local data had none). Landing copy changed to "Budgets count without the awkward conversation". `budgets` stays owner-only. Privacy tests: a private budget counts in fit and never shows to another member. Spec, build guide and plan updated. Tests: 106 unit, 26 e2e passing. Deployed. | Wrote the Planned Changes Spec: budgets public by default with one switch and no hiding logic, since trip groups are usually close friends. Approved shipping. |
| Planned Changes Spec, Change 2: a more visual overview (2026-11-22) | Housing card: a thumbnail beside each option before locking; once locked, the chosen place's photo with its name, nights, price per person and total. Additional card: the top 3 activities and top 3 places to eat as labeled thumbnails, with the warning triangle kept on food. A shared `Thumb` is fixed-size and cropped, uses only stored research photos, and falls back to a letter tile when there's no photo or it fails to load. Travel and Notes unchanged. Tests check the locked card's details and the fallback tile. Tests: 106 unit, 26 e2e passing. Deployed. | Wrote the Planned Changes Spec: make the overview more visual, especially housing photos. Approved shipping. |
| Migration Phase 1: Co-farer on plain workerd (2026-11-25, `self-host` branch) | Go. Ran the unchanged app (deepspace 0.44.2) on plain `workerd` with no DeepSpace servers: `deploy/workerd.capnp` (the normal build's bundle, all six Durable Object classes with SQLite on local disk, outbound internet), a small asset worker that behaves like Cloudflare's asset layer, `npm run workerd`, and a Phase 1-only stand-in sign-in (`src/server/stub-auth.ts`, local ES256 key, inert unless `LOCAL_STUB_AUTH=true`). All "done when" checks pass: two users create, join, set budgets, vote and write notes with live updates both ways (automated in `scripts/workerd-smoke.mjs`); data survives restarts; presence works; a housing deadline locked on the cron alarm, which survived a restart. Missing or forged tokens are refused. What still needs DeepSpace (sign-in, the AI integration proxy, file storage) is listed in `docs/SELF-HOST.md` with its Phase 2 replacement. What broke: the disk service lists folders instead of serving index.html (fixed with the asset worker), then my first asset filter hid the app's `_layout-*.js` chunks (fixed); and an unreachable integration throws a 500 under workerd instead of a polite error (Phase 2a replaces it). Also set up the AWS CLI and Agent Toolkit (profile `cofarer`, us-east-2, Free plan with $100 credits) and added AWS's starter rules to `CLAUDE.md`. Unit tests: 106; the 26 DeepSpace e2e tests still pass. Not deployed (local only). | _fill in_ |
| Migration Phase 2a: AI and search on AWS (2026-11-25, `self-host` branch) | Phase 0 check first: account on the Free plan with $100 credits, us-east-2. No budget alert yet (you'll make it). Bedrock lists Claude Haiku 5.5 but shows `NOT_AUTHORIZED` until Anthropic's use-case form is filled in. MFA and an admin user don't apply as written: on the new AWS experience you sign in through a social provider. Haiku 5.5 runs in us-east-2 only through the US inference profile; you approved that. Built `src/lib/ai-provider.ts`: `search` (Brave, key from Parameter Store `/cofarer/brave-api-key`, the domain lists turned into `site:` filters, a fallback for pasted links) and `complete` (Bedrock Converse, SigV4 via `aws4fetch` 1.0.20, credentials from IMDSv2 through a dedicated `IMDS` binding, or local `AWS_*` from `npm run workerd -- --aws`). `engine-ai.ts` calls only these; prompts, safety checks, the stand-in and the 25-call cap are unchanged. Removed the Exa and DeepSpace reply readers. Neither call throws, which fixes the Phase 1 500. What broke: nothing; I added 2-second timeouts to the IMDS calls so a misconfigured server fails fast. Tests: 123 unit (the provider's parsing, query building, signing and failure paths, all mocked: no real AI calls); the workerd smoke test passes. A real Suggest still waits on Bedrock access and the Brave key. Not deployed. | _fill in_ |
| Migration Phase 2b: sign-in with Cognito (2026-11-25, `self-host` branch) | First, the Bedrock blocker: every model call is refused because AWS set this new account's Bedrock limits to 0. You opened a support case. Your decisions: Google sign-in, initials only (2c on hold), co-farer.com (available; Route 53 can't register domains on the Free plan). Created (CLI, free): user pool `cofarer` (Essentials; email code or password; self sign-up), the sign-in domain `co-farer.auth.us-east-2.amazoncognito.com` (managed login v2), the public client `cofarer-web` (code + PKCE, 15-minute tokens, revocation on), plus the app's ES256 key and the Cognito IDs in Parameter Store. Built `src/server/cognito-auth.ts`: sign-in goes through Cognito, the server exchanges the code and verifies the ID token with `jose`, and an encrypted HttpOnly cookie holds the refresh token. `/api/auth/token` mints the app's 15-minute ES256 token and re-checks the account with Cognito every 15 minutes. Sign-out revokes the refresh token and ends the Cognito session. Different from the spec, on my call while you were away: no `/auth/exchange` and no new browser auth provider. The SDK's own hooks keep working, and the refresh token never reaches JavaScript. A new `SignInDialog` (Google or email code) replaces DeepSpace's overlay. The Phase 1 stand-in still works locally, side by side. What broke: a PKCE test value I misremembered (the code was right), a password file with a trailing newline, and Cognito's sign-in page asks for the method on a second screen (the script handles it). Tests: 138 unit (15 new: ID token checks for wrong audience, issuer, token type, expiry, forged and `alg none`; app tokens checked by the SDK's `verifyJwt` (no token, forged, wrong issuer, expired); cookie tampering; the full login, callback, token, re-check and sign-out flow against a mocked Cognito). The workerd smoke test passes with the stand-in, and with two temporary real Cognito users signed in through Cognito's page (since deleted): create, join, budgets, presence, dates, Suggest, votes, notes, then sign-out refuses the token. Google still needs your OAuth client (steps in `docs/SELF-HOST.md`). Not deployed. | _fill in_ |
| Migration Phase 2d: DeepSpace platform plumbing removed (2026-11-26, `self-host` branch) | Before 2d: Google sign-in went live, and you signed in with it. The domain is now the free `co-farer.duckdns.org`; Cognito callbacks were updated read-modify-write, and the unowned co-farer.com was removed. Infrastructure will be Terraform (your call). Removed: DeepSpace's integrations proxy and billing modes (`API_WORKER*`, `APP_OWNER_JWT`, `src/integrations.ts`; `tools.integration` now always refuses), file storage (`PLATFORM_WORKER*`, `APP_IDENTITY_TOKEN`, `/api/files`, `useR2Files`), the `/_deepspace` proxy, native-app sign-in routes, the agent/MCP/chat routes (`src/ai/`), the `/api-status` page, and the unused YJS and canvas rooms (a `v2` wrangler migration deletes them for the local run). The profile page is initials only; the cropper code stays for 2c. `cleanupMyTestTrips` is now gated on a local environment variable (`ALLOW_DEBUG_ROUTES`) instead of test emails. Kept on purpose until 2e: DeepSpace's `/api/auth` proxy, used only by the `deepspace test` run and inert under workerd and on the server. What broke: a leftover workerd held port 8080, so my first route check hit the old build; I restarted cleanly. Tests: 138 unit. The workerd smoke test passes, and the removed routes all answer 404. 23 e2e pass; the other 3 were tests of the removed API-status page and picture cropper. Not deployed. | _fill in_ |
| Migration Phase 2e: end-to-end tests on Playwright + workerd (2026-11-26, `self-host` branch) | `npm test` now runs plain Playwright against Co-farer on workerd: no DeepSpace servers, its own port and an empty data folder every run. A test-only sign-in route (`/api/auth/test-login`, replacing the Phase 1 stub) is on only when `ALLOW_TEST_AUTH` is exactly "true", which the server never sets; a unit test proves it answers 404 with no cookie or token when the variable is unset, empty, `false`, `TRUE`, `1` or `yes`. `tests/helpers/fixtures.ts` keeps the same `users(n)` fixture, so the specs only changed an import. Removed DeepSpace's `/api/auth` proxy and `AUTH_WORKER_URL`, and the `deepspace` dev/test/deploy npm scripts (`npm run deploy` would have pushed this branch to the live DeepSpace app). `npm run dev` now builds and runs on workerd. What broke: the workerd asset worker refused any path containing `..`, which also blocked the real chunk `_...all_-<hash>.js`, so unknown pages showed "Something went wrong". This was a Phase 1 bug that the new tests caught. It now refuses only `.`/`..` path segments; I checked that traversal attempts still never return a file. Also the React hooks lint rule misread Playwright's `use`, so I renamed it. Tests: 141 unit; 24 e2e passing in 17 s (the 26 DeepSpace-era flows minus the 3 for features removed in 2d and the old auth-proxy check, plus 2 new API refusal checks); the workerd smoke test passes. Not deployed. | _fill in_ |
| Migration Phase 3: the AWS server (2026-11-27, `self-host` branch) | Your calls: Terraform; a t4g.micro (about $10–13 a month instead of $16–19), which can grow later; alarm emails to your Gmail. Installed Terraform 1.17.2 (checksum-verified; Homebrew needed a Command Line Tools update). Wrote `infra/`: the server (Amazon Linux 2023 arm64, IMDSv2 only, encrypted 20 GB gp3 kept on termination, 1 GB swap), 80/443 only with no SSH, an Elastic IP, a least-privilege role, a private S3 bucket (releases 90 days, backups 14), daily EBS snapshots (7), 30-day CloudWatch logs, a status alarm by email, hardware auto-recovery, and the Phase 2b Cognito pieces imported with `prevent_destroy` (the Google provider stays outside so its secret never lands in state). The boot script sets up Caddy (pinned, checksum-verified), workerd as a locked-down service, DuckDNS, log shipping, the nightly S3 backup, security updates and the Sunday reboot. `infra/release.sh` builds, uploads and installs a release over SSM with rollback. What broke: (1) EC2 refused two firewall rule descriptions with an apostrophe; fixed and re-applied. (2) The server booted before its outbound rule existed, but the boot script's package install retried and got through. (3) A failed credentials lookup threw a 500; AWS lookups now fail politely (503). (4) DLM descriptions can't contain commas. Checks: valid Let's Encrypt certificate, HTTP→HTTPS, sign-in reaches Cognito, test sign-in and DeepSpace routes are 404s, ports 22 and 8080 closed, no app secrets on disk, S3 backup made, logs arriving with no codes, tokens or cookies, data checksum identical across a reboot (back in about 65 s), clean release installed over SSM, no Terraform drift. The first snapshot is due at 11:00 UTC. Tests: 142 unit, 24 e2e. | _fill in_ |
| Migration Phase 4: push-to-deploy (2026-11-27, `self-host` branch) | Your calls: Terraform state into versioned S3, which is now its own bucket with S3 locking, and pushing `self-host` to GitHub. Added `/healthz` ("ok" once the data room answers a read), the GitHub OIDC provider, a `cofarer-deploy` role, and the `cofarer-install-release` SSM document, so GitHub can only upload releases and install one by id. `.github/workflows/deploy.yml` runs on every push to `self-host` (it becomes `main` in Phase 5): install, validate, lint, the 24 e2e tests, then `release.sh --install`, then an outside `/healthz` check. Docs-only pushes skip it. Actions are pinned to commit SHAs. What broke: (1) the first run's tests passed on GitHub, but signing in to AWS was refused. CloudTrail showed that GitHub's token subject now includes the account and repo IDs (`byeoh100@95153447/co-farer@1466362137`), so the role now trusts exactly that, which is safer against a renamed repo. (2) The IAM policy simulator said "denied" for everything until I gave it the region, because your project's managed SCP denies requests without one. Checks: a footer line pushed at 08:05:48 UTC was live at 08:10:20 (4 min 32 s). A deliberately broken release rolled back by itself (about 55 s of downtime while it was tried) and failed the run. The simulator confirms the deploy role can do only its three jobs. Tests: 144 unit (new: `/healthz`), 25 e2e (new: `/healthz`). | _fill in_ |
