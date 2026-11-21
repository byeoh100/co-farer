# Trip page layout

This replaces item 4 ("Trip page") under "Screens and flow" in `docs/SPEC.md`. The trip page is **one overview screen, not tabs**: a date bar at the top, four sections below, and each section expands to fill the page when opened. Reference mockups, with example data only, are `docs/mockups/mobile.html` and `docs/mockups/desktop.html`; open them in a browser and click around.

## What's on the overview

| Area | Shows (summary) | Opens into |
| --- | --- | --- |
| **Header** | Trip name, number of people, and members as overlapping profile-picture circles, like Google Docs. Your own essentials total ("$63 of $90"), visible only to you; before any estimate exists it reads "Budget $90 · no estimates yet". A link to My settings. | My settings page (unchanged) |
| **Date bar** (full width) | The locked dates and how many people are free, or just "Not locked yet" before they lock (no overlap hint; that's part of the best-window stretch goal) | The calendar, in a **pop-up** anchored to the bar (it doesn't expand to the full page; see below) |
| **Housing** | Mobile: the leading option and its votes. Desktop: the top 3 options, each with price and budget fit. Before dates lock: "Waiting for dates". | Full housing view: option cards, voting, deadline, suggest more, paste a link |
| **Travel** | Mobile: the number of cars and flyers, and seats left. Desktop: each car's seats, plus flyers. | Full carpool board, claiming seats, your travel details |
| **Additional** | Activities **and** Food together. Mobile: the top activity. Desktop: the top items of each, with food warning triangles. | Two lists side by side (desktop) or stacked (mobile), each ranked by votes |
| **Notes** | Mobile: the note count and the latest note. Desktop: the latest 3 sticky notes. | The full sticky-note board |

"Additional" is a spec change: Activities and Food were separate tabs, and they now share one section with a part for each. They're still built as separate modules (6 and 7). The Food part appears only once Module 7 is built.

A section that can't be used yet stays visible but disabled, so the page keeps its shape:

- **Mobile:** the card is grayed out in its grid slot.
- **Desktop:** the column shrinks to a thin bar with no information, still labeled with the section's name.
- **Clicking it** doesn't open it. It shows a short notice (a toast) saying another section must be finished first.

This replaces the earlier rule that unbuilt sections are hidden.

## Mobile and desktop

| | Mobile (under 900px wide) | Desktop (900px and wider) |
| --- | --- | --- |
| Sections | 2 × 2 grid of compact cards | 4 columns side by side |
| Summary detail | 1–2 key facts per card | The top 3 items per column |
| Open a section | Tap the card | Click the column (or its expand icon) |
| Expanded view | Fills the screen; a back arrow closes it | Fills the area under the header; a minimize button closes it |

## The expand animation

- The section grows **from its own position and size** to the full area, then shrinks back into its spot when closed (the FLIP technique: measure, then animate position and size).
- Timing is about 380 ms with `cubic-bezier(.2,.8,.2,1)`. The full view's content fades in about 180 ms after the grow starts, so text never appears squashed.
- With `prefers-reduced-motion`, switch instantly with no animation.
- **Keyboard and screen readers:**
  - Each card or column is a `button` with `aria-expanded`.
  - On open, focus moves into the expanded view. On close, focus returns to the card.
  - `Escape` closes the expanded view.
- **URL:** reflect the open section in the URL (`?section=housing`), so the browser's back button closes it, and a link can open a trip straight to a section.

## The calendar pop-up

- The date bar opens the calendar as a pop-up anchored under the bar, with a short open and close animation.
- It closes when you click outside it, press `Escape`, or press its close button, like a modal.
- Unlike a modal, it **does not gray out the rest of the screen**.
- Focus moves into the pop-up on open and returns to the date bar on close. With `prefers-reduced-motion`, it opens without animation.

## How to build it (component rule)

Each module's UI is **two self-contained components**, and the trip page only arranges them:

- `<HousingSummary tripId={…} limit={1 | 3} />`: the compact card or column body. `limit` is 1 on mobile and 3 on desktop.
- `<HousingFull tripId={…} />`: the expanded view.
- The same pair for Travel, Additional (which renders an Activities part and a Food part) and Notes. The date bar is `<DatesBar tripId={…} />` with its calendar pop-up inside.

The page is `TripOverview`, plus one shared `ExpandableSection` component that owns the animation, focus handling and the `?section=` URL state. Modules never implement their own animation. Keep the layout in `TripOverview` alone, so switching layouts later means rearranging components, not rewriting modules.

The mockups show layout and behavior only. Use the app's own UI components and styles; don't copy the mockup's CSS.
