# Co-farer Redesign Spec — Midnight Basecamp

Nov 27, 2026

## Summary

Restyle the Co-farer trip page to the "Midnight Basecamp" design. It has a charcoal background, a midnight blue accent, condensed uppercase headings and photo-first cards. Each traveller has one colour used everywhere on the page. This is a visual and layout change only. Keep every existing feature, data model, server action and permission rule exactly as it is.

**Reference design:** the files in `design-reference/` (see `design-reference/README.md`). If this spec and the reference files disagree, follow this spec.

**In scope**

- Global theme: colours, fonts, radii, the app header.
- The trip overview page (TripOverview), its date bar and its sections: Housing, Travel, Activities, Food and Notes.
- Your essentials (the budget card) as it appears on the overview.
- The condensed (Summary) view of each section. The expanded (Full) views take the new tokens but keep their current layout.
- The My trips homepage, the sign-in page and the tab icon (see their sections below).

**Out of scope**

- New features, schema changes, new server actions and new permissions.
- The My settings page, beyond picking up the new tokens and header.
- Real listing photos. Use the existing image fields, and use the photo fallback described under Components when there's no image.

**How to use this spec:** work through the build order, one step per commit. Run the acceptance checklist before calling the work done.

## Ground rules

These still apply. Stop and ask if a step seems to need you to break one.

- **No behaviour changes.** Every write still goes through the existing server actions, and each action still starts with requireMember or requireOrganizer. Don't add client-side writes, and don't loosen any `team` read rule.
- **Budgets stay as they are.** Respect the current budget visibility setting (public by default, with the one switch). Show the "Only you see this" label only when the switch makes the budget private.
- **No secrets in the repo.** Keys stay in Parameter Store or `npx deepspace secrets set`. Never invent app IDs.
- **Never run `npx deepspace push`.** Deploys are run by a person.
- **Don't add a UI framework.** Stay on React, TypeScript, Vite, Tailwind and the existing shadcn components. Restyle shadcn through tokens instead of replacing it.
- **Fonts:** self-host them with `@fontsource/barlow-condensed` (600, 700) and `@fontsource/inter` (400, 500, 600). Don't load Google Fonts at runtime.
- **Keep the live data.** Keep the existing `useQuery` subscriptions and presence as they are, and re-skin only what they render.
- Work on a branch off `main`, and make small commits that each follow one build step.

## Design tokens

Replace the shadcn slate and indigo theme in `src/styles.css` with the tokens below, defined as CSS variables under `@theme`. Map them onto the shadcn variables (`--color-background`, `--color-card`, `--color-primary` and the rest) so existing components restyle without edits. There's one theme only, dark. Remove the old indigo `--color-primary: #818cf8`.

**Surfaces and text**

| Token | Value | Use |
| --- | --- | --- |
| `--cf-bg` | #111111 | Page background |
| `--cf-surface` | #1B1B1B | Cards |
| `--cf-surface-2` | #232323 | Rows and mini-cards inside cards |
| `--cf-track` | #2A2A2A | Empty bar tracks |
| `--cf-line` | #262626 | Dividers, header rule |
| `--cf-border` | #3A3A3A | Outline buttons, scrollbar thumb |
| `--cf-text` | #F2EFEA | Body text |
| `--cf-text-2` | #D6D2CC | Text on photo overlays |
| `--cf-muted` | #A39E97 | Secondary text |
| `--cf-faint` | #6E6A64 | Ranks below #1, departed members |
| `--cf-neutral-bar` | #4A4540 | Non-leading bars, unlocked days |

**Accent (midnight blue)**

| Token | Value | Use |
| --- | --- | --- |
| `--cf-accent` | #2A4AA8 | Primary buttons, filled pills, active nav underline, leading bars. Text on it is #FFFFFF. |
| `--cf-accent-ink` | #9DB4FF | Accent used as text or an outline on dark: the period in the title, locked day numbers, the #1 rank, outline buttons |
| `--cf-accent-soft` | #2A4AA8 at 25% alpha | Tinted pills, such as "1 seat left" |

**Status**

| Token | Value | Use |
| --- | --- | --- |
| `--cf-ok-bg` / `--cf-ok` | #2A3A25 / #B9E3A1 | "Locked", "fits everyone" |
| `--cf-warn` | #F4B183 | Over budget, dietary warnings (always with a ▲ or words, never colour alone) |

**Person palette:** each member gets one colour, used for their avatar, car seat, vote segment and notes. Text on a person colour is #111111.

| Slot | Colour |
| --- | --- |
| 0 | #F26B3A |
| 1 | #E9C46A |
| 2 | #7FB7BE |
| 3 | #B8A1D9 |
| 4 | #9CC59A |
| 5 | #E39AA8 |
| 6 | #8FB3E0 |
| 7 | #D9A46B |
| Departed member | #6E6A64 |

**Type**

- Display: Barlow Condensed 700, uppercase. Sizes: page title 92px with line-height 0.9 and letter-spacing −1px; card titles 30px; small card titles 24px; prices and big numbers 28–34px.
- Body: Inter. Base size 14px; secondary text 13px; meta text and pills 12px; eyebrow labels 12–13px, uppercase, letter-spacing 1.5px.
- Use tabular numbers (`font-variant-numeric: tabular-nums`) for prices and dates.

**Shape and spacing**

- Radii: cards 20px, inner rows 14px, thumbnails 10px, bars 4px, pills and buttons 999px.
- Spacing: 24px between cards, 20px card padding, 32px page side padding, and a max width of 1280px.
- Buttons are 36px or 40px tall. Primary buttons use the accent fill; secondary buttons are transparent with a 1px `--cf-border` outline.
- No shadows and no gradients (the sign-in photo fade is the one exception). Cards are told apart by their surface colour alone.

## Page layout

The overview is one page of full cards in four bands. Every card keeps its ExpandableSection behaviour: the card's open button (for example "Open housing") expands it to the Full view, as it does today.

| Band | Desktop, 1024px and up | Contents |
| --- | --- | --- |
| Header | One row with a bottom divider | Wordmark, nav, avatar stack, Invite |
| Hero | Two columns, flex 1 : 1.5 | Left: trip title and chips. Right: the dates card |
| Row 1 | Two columns, flex 7 : 5 | Left: housing. Right: Getting there stacked above Your essentials |
| Row 2 | Three equal columns | Activities leaderboard, Food leaderboard, Notes. Each card is 400px tall and scrolls inside |

**Responsive**

- **640–1023px:** the hero stacks. Row 1 stacks, with housing full width and Getting there next to Your essentials. Row 2 becomes two columns, Activities next to Food, with Notes full width below.
- **Under 640px:** everything is one column. The title drops to 56px. The dates card scrolls sideways if 14 days don't fit, with each day at least 32px wide. Row 2 cards keep their fixed 400px height so the page stays short. The header nav moves into a menu, and the avatar stack shows at most 3 avatars plus a "+N".
- Use CSS grid or flex with `flex-wrap`, not JS-measured layouts. The page itself scrolls normally; only Row 2 cards have their own scroll.

## Components

Build these as small shared components in `src/components/trip/` (or wherever the section components already live), and reuse them in the Summary views.

### AppHeader

- Left side: the logo mark (30px) and the "CO-FARER" wordmark (Barlow Condensed, 26px), then nav links (My trips, the current trip's name, My settings). The active link gets a 2px `--cf-accent-ink` underline and `aria-current="page"`.
- Right side: an avatar stack of trip members, 34px circles overlapping by 10px with a 2px `--cf-bg` ring and initials in #111111, followed by a primary "Invite" button.

### TripHero

- Eyebrow line: the trip's occasion and the member count, for example "Spring break · 6 travelers". If the trip has no occasion field, show only the member count.
- Title: the trip name in uppercase at 92px, followed by a period in `--cf-accent-ink`.
- Chips: location and departure in `--cf-surface-2`, and the night count as a filled accent chip. Hide any chip whose data is missing.

### DatesCard (date bar)

- Header: the locked range in Barlow Condensed 28px (for example "MAR 19 – 21"), a "Locked" status pill, and an "Open calendar" outline button. While dates aren't locked yet, show "Picking dates" in muted text instead of the pill.
- Body: one column per day in the window the page already loads. Each column has an 84px track in `--cf-surface-2` with a bar whose height is the share of members free that day. Under it sit the weekday letter (muted, 11px) and the date number (14px, 600 weight).
- Locked days get an accent bar and an `--cf-accent-ink` number. Other days get a `--cf-neutral-bar` bar.
- Footer line: "All N free on the locked dates · bar height = people free that day", or "X of N free on the locked dates" when not everyone is free.

### HousingCard and VoterSegments

- Header: "WHERE WE STAY", a subline ("N options · voting closes <date>", leaving out the date if none is set), and a primary "Open housing" button.
- Lead option: a 300px-tall photo of the option with the most votes (or the locked option once housing is locked). Ties go to the option that was added first. A dark overlay panel (rgba(17,17,17,0.85), radius 14px) at the bottom left holds:
  - a "Leading" accent pill, or "Booked" in the ok style once locked;
  - the name in Barlow Condensed 30px, uppercase;
  - one line of details: sleeps, distance and budget fit;
  - VoterSegments.
- A second overlay panel at the bottom right shows the per-person price at 34px and "per person · $X total" below it.
- Other options: a 2-column grid of rows in `--cf-surface-2`. Each row has a 96×72 thumbnail, the name, and "$X / person · fits everyone" (ok colour) or "over budget for N" (warn colour), with small VoterSegments below. If there are more than 2 other options, show the first 2 and add a "+N more" link that expands the section.
- **VoterSegments:** one slot per current trip member, in a CSS grid (`repeat(N, 1fr)`, 4px gap, 8px tall on the lead option and 6px on rows, radius 4px). Slots fill left to right in member order. A member who picked this option fills their slot in their person colour; empty slots are `--cf-border`.
  - Each filled slot has `title` set to the member's name.
  - The whole bar has an `aria-label` such as "Picked by Maya, Jordan, Sam and Lee" or "No picks yet".
  - Never show vote counts as "N of M" text anywhere on the overview.

### TravelCard (Getting there)

- Header: "GETTING THERE", a subline ("From <origin> · N cars, N flying"), and a soft accent pill "N seat(s) left". Hide the pill when no seats are open.
- One row per car in `--cf-surface-2`: the driver's car name, then one 26px circle per seat. Taken seats use the rider's person colour (`title` = name); open seats are a dashed `--cf-border` circle. On the right, either an outline "Claim seat" button (shown when the viewer has no ride and a seat is open; it calls the existing claim action) or the word "Full".
- One row per member travelling on their own, for example flying: their colour dot, "<Name> flies in", and the arrival details.
- Footer: "Gas about $X per person, split in each car", when the app has a gas estimate.

### EssentialsCard (Your essentials)

- Header: "YOUR ESSENTIALS" and the total, shown as "$63 of $90" with the "of $90" part muted.
- One labelled bar per category ("$48 of $60"): an 8px track with an accent fill, which turns `--cf-warn` when over the limit.
- Visibility follows the existing budget switch (see Ground rules).

### Leaderboard (Activities and Food)

- Split the current Additional section into two cards that use the same component. Filter by the existing activity or food type field. Don't change the data.
- Header: the title ("ACTIVITIES" or "FOOD"), a subline ("N ideas · ranked by votes"), and an outline "+ Suggest" button that opens the existing add flow, already set to the right type.
- Rows are sorted by votes (most first), then by when they were added (oldest first). Each row has:
  - the rank number (Barlow Condensed 26px; #1 in `--cf-accent-ink`, the rest in `--cf-faint`);
  - a 60×44 thumbnail;
  - the name (ellipsis if too long) with a vote label on the right, for example "5 votes";
  - a 6px vote bar, its width being votes divided by member count; #1 uses the accent and the rest use `--cf-neutral-bar`;
  - a meta line with cost and a detail, in warn colour with a ▲ when there's a dietary or budget flag.
- The list sits in a ScrollArea that fills the rest of the 400px card.
- Empty state: "No ideas yet", with the Suggest button.

### NotesBoard

- Header: "NOTES", a subline ("N notes · newest first"), and an outline "+ Add note" button.
- Body: a ScrollArea holding a wrapping row of bubbles, newest first. Each bubble has:
  - padding of 10×14px and radius 16px;
  - a background of the author's colour at 14% alpha (hex + `24`), with a 3px left border in the author's colour;
  - the text, followed by "· Name" in the author's colour (12px, 600 weight).
- Notes from members who have left: transparent background, `--cf-faint` border and text, and "· Name, has left".
- Keep the existing edit and delete controls; show them on hover or focus inside the bubble.

### ScrollArea

- A `div` with `overflow-y: auto`, `min-height: 0` and `flex: 1`, plus a thin scrollbar: 6px wide, `--cf-border` thumb, transparent track. Set this through both `scrollbar-width` and `::-webkit-scrollbar`.
- Use the shadcn ScrollArea if the app already uses it; otherwise use this plain version.
- Give it `tabIndex={0}` and an `aria-label` so keyboard users can scroll it.

### Photo fallback

When an option has no image, show a flat `--cf-surface-2` block with a 24px muted icon for its type (tent, car, utensils, mountain). Never show a broken-image icon. The flat illustrations in `design-reference/photo-placeholder.dc.html` are mockup stand-ins only; don't ship them.

## Data rules

Use only data the page already queries. If a field below doesn't exist, hide that element; don't add schema for it.

- **Person colours:** add a pure helper `personColor(members, userId)` in `src/lib/personColor.ts`. Sort `team_members` by join time, oldest first; a member's colour is `PALETTE[index % 8]`. Departed members get #6E6A64. Every component calls this helper so one person has one colour on every card. Write unit tests for: stable order, wrap after 8, and departed members.
- **Member order:** the same join-time order drives the avatar stack, VoterSegments slots and car seat order.
- **Lead housing option:** the locked option if there is one; otherwise the option with the most votes, with ties going to the earliest created. Put this in a pure function with tests.
- **Leaderboard order:** votes (most first), then created time (oldest first). Vote bar width is votes divided by current member count, capped at 100%.
- **Seats left:** the sum over cars of (seats minus riders), counting only cars that still have open seats.
- **Dates bar:** height = free members that day divided by current member count, using the availability the date picker already stores.
- Live updates keep working through the existing `useQuery` subscriptions, so a new vote fills its slot without a reload.

## Accessibility

- **Contrast:** the colour pairs in this spec pass WCAG AA. White on #2A4AA8 is about 8:1, #9DB4FF on #1B1B1B about 8:1, and #A39E97 on #1B1B1B about 6.5:1. Don't put #2A4AA8 text on dark backgrounds; use `--cf-accent-ink` instead.
- **Never colour alone:** VoterSegments, seat circles and note colours all carry names through `aria-label` or `title`. Warnings also show a ▲ or words.
- Every bar, including the date bars, budget bars and vote bars, has an `aria-label` with its value in words.
- Headings are real `h1` (trip title) and `h2` (card titles) elements; uppercase comes from CSS, not from typed capitals.
- Focus rings: a 2px `--cf-accent-ink` outline with a 2px offset on every button, link and ScrollArea.
- Respect `prefers-reduced-motion`: no animated bar growth when it's set.
- Tap targets are at least 40px on mobile.

## Homepage and tab icon

The My trips homepage uses the same tokens and header. Reference: `design-reference/homepage.dc.html`.

**Hero:** the eyebrow "Hi <first name> · N trips on the go" and the title "WHERE TO NEXT?" at 92px, with the question mark in `--cf-accent-ink`. On the right sit an outline "Join with a code" button (only if the app supports joining by code; otherwise leave it out) and a primary "+ Plan a trip" button (the existing create flow).

**Row 1, flex 7 : 5:**

- **Next up:** the soonest upcoming trip as a 420px photo card. It has an accent pill ("Next up · in N days") and a dark overlay panel holding:
  - the trip name at 44px and "dates · location";
  - the member avatar stack;
  - a 5-step progress strip (Dates, Housing, Travel, Activities, Notes): done steps are ok green with a ✓, the current step uses the accent, steps not started yet are `--cf-border`;
  - the next deadline;
  - an "Open trip" button.

  If no trip has dates yet, use the most recently updated trip and leave out the countdown.
- **Waiting on you:** a list of actions only the viewer can take across their trips. Each row has a 4px colour edge, the action, the trip name with context, and an outline button. Derive the rows from existing data only:
  - unvoted housing in a voting trip;
  - no availability entered;
  - no budget set;
  - pending invites.

  Show at most 5 rows, and "You're all caught up" when there are none.

**All trips:** an Upcoming / Past filter, then a grid of trip cards (`repeat(auto-fill, minmax(280px, 1fr))`). Each card has a 150px photo with a stage pill, the name at 26px, a when line, member colour dots (up to 4) and "N going". The grid ends with a dashed "+ Start a new trip" tile. Past trips get 60% opacity.

**Tab icon ("the open C"):** a rounded square in the accent colour with a white open "C" stroke and a pale blue (#9DB4FF) dot in the gap. One version is used at every size. Reference: `design-reference/tab-icon.dc.html`.

- Add `assets/favicon.svg` from this package as `public/favicon.svg` and link it with `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`. Also generate `favicon.ico` (16, 32, 48) and `apple-touch-icon.png` (180) from it, and set `<meta name="theme-color" content="#111111">`.
- Use `assets/logo-mark.svg` (the same artwork) at 30px next to the CO-FARER wordmark in AppHeader.
- Copy both SVG files in exactly as given.

## Sign-in page

The sign-in page is restyled only: keep the current auth provider, redirects and session handling exactly as they are. Reference: `design-reference/sign-in.dc.html`.

- **Layout:** two columns, flex 1.2 : 1. Below 900px, the photo panel shrinks to a 260px banner above the form.
- **Left panel:** a full-height photo, with a fade to #111111 at the bottom, the logo mark and wordmark at the top left, and three things at the bottom left:
  - "PLAN IT TOGETHER." at 96px, with the period in `--cf-accent-ink`;
  - one line of pitch at 16px in `--cf-text-2`;
  - three feature chips: dates, votes, seats.

  Use a bundled static image, not a remote one.
- **Form column:** max width 400px, vertically centred. From top to bottom:
  - the title: "WELCOME BACK" when signing in, "CREATE ACCOUNT" when signing up;
  - a subline;
  - the provider buttons;
  - an "or with email" divider, then Email and Password fields;
  - a primary submit button;
  - a switch link ("New to Co-farer? Create an account");
  - the Terms and Privacy line.
- **Show only the methods the current auth actually supports.** The "Continue with Google" button in the mockup is a placeholder: render a provider button only if that provider is configured, and use the provider's official logo and button rules. If sign-in is by email link instead of a password, drop the password field and "Forgot password?".
- **Fields:** 46px tall, 12px radius, `--cf-surface` background, `--cf-border` outline, and a focus ring in `--cf-accent-ink`. Each has a visible `<label>`. Show errors under the field in `--cf-warn`, with `aria-describedby` linking them.
- **Invite banner:** when the URL carries a pending trip invite the app already understands, show a banner above the title: the inviter's avatar in their person colour, plus "<Name> invited you to <Trip>. Sign in to join." After sign-in, keep the existing redirect to the invite. Don't show the trip name to signed-out users unless the existing invite endpoint already returns it to them.

## Build order

One commit per step. Run `npm run typecheck` and the test suite after each one.

1. **Tokens and fonts.** Add the @fontsource packages, replace the theme in `src/styles.css`, and map the shadcn variables. The app should already look dark and blue with no component changes.
2. **Helpers.** Add `personColor` and the lead-option, leaderboard-order and seats-left functions, with unit tests.
3. **Shell.** Restyle AppHeader with the logo mark, and add the favicon files and `index.html` links.
4. **Overview top.** Build TripHero and DatesCard.
5. **Housing.** Build HousingCard and VoterSegments, and remove every "N of M votes" string from the overview.
6. **Travel and budget.** Build TravelCard and EssentialsCard.
7. **Row 2.** Build ScrollArea, then Leaderboard (split into Activities and Food), then NotesBoard.
8. **Page layout.** Lay out TripOverview per the layout section, and check the three breakpoints.
9. **Homepage and sign-in.** Build Next up, Waiting on you, and the All trips grid. Then restyle the sign-in page.
10. **Full views.** Apply the tokens to each expanded section and fix any leftover slate or indigo classes (search for `slate-`, `indigo-` and `#818cf8`).
11. **Pass.** Run through the accessibility checks and the acceptance checklist. Open a pull request with before and after screenshots at 1280px and 390px. Don't deploy.

## Acceptance checklist

- [ ] No `slate-`, `indigo-` or `#818cf8` left in `src/`; every colour comes from a `--cf-*` token or the person palette.
- [ ] Headings render in Barlow Condensed and body text in Inter, both self-hosted, with no Google Fonts request in the network tab.
- [ ] A member has the same colour in the header, seats, vote segments and notes, on both the overview and the homepage.
- [ ] Housing shows VoterSegments, and no "N of M" vote text appears anywhere on the overview.
- [ ] A new vote, seat claim or note shows up live in a second browser without a reload.
- [ ] Activities and Food are separate leaderboards with correct ranking and tie-breaks. With 10 or more items, the card stays 400px tall and scrolls inside.
- [ ] Notes scroll inside their card, and departed members' notes are greyed with "has left".
- [ ] Layout holds at 1280px, 900px and 390px, with no sideways page scroll (only the dates card may scroll sideways on mobile).
- [ ] Every Expand or Open button still opens the Full view, and every write still goes through its existing server action.
- [ ] Budget visibility follows the existing switch.
- [ ] The sign-in page shows only configured sign-in methods, and the invite redirect still works.
- [ ] The favicon shows in light and dark browser tabs, and the logo mark appears in the header.
- [ ] Keyboard: every button is reachable with Tab, focus rings are visible, and ScrollAreas scroll with the arrow keys.
- [ ] Typecheck, lint and all tests pass, including the new helper tests.
- [ ] Pull request opened with screenshots; nothing deployed and `npx deepspace push` not run.
