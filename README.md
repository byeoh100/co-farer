# Co-farer

A group trip planner where friends pick dates, choose where to stay, sort out rides, and shortlist activities and food together, on one trip page that updates live for everyone.

**Live:** https://co-farer.app.space · Built on [DeepSpace](https://deep.space)

## What it does

- **Dates:** everyone adds when they're free. The calendar shows each free person's profile circle, a best-window helper finds the strongest stretches, and the organizer locks the final dates.
- **Housing:** opens once the dates lock. AI suggests places with photos, prices and sources (Exa search and Claude Haiku 5.5). Anyone can paste a link, everyone votes live, and each option shows how many people it's over budget for. A deadline auto-locks the top option.
- **Travel:** a carpool board where riders claim seats, plus flights and other ways of getting there, pickup notes and per-person gas estimates.
- **Additional:** ranked activity and food lists. Food places that may not suit someone's diet stay on the list with a warning.
- **Notes:** a live sticky-note board.
- **Budgets:** each person sets a budget for housing, gas, food and activities. Budgets are shared with the trip by default, with one switch to keep yours private. Private budgets still count toward fit and search prices; they just aren't shown.

The trip page is one overview: a date bar and four sections with photos, each expanding to fill the page. It's a 2 × 2 grid on phones and four columns on desktop.

## How it's built

- **Per-trip data:** a trip is a DeepSpace team, and every collection uses the `team` read rule, so members only receive their own trips' data. Budgets and profiles are owner-only.
- **Server actions for every write** (`src/actions/`), each checking trip membership or organizer status first. Direct client writes are turned off, because DeepSpace's create permission doesn't check team membership. See `PLAN.md` §2.
- **Pure logic in `src/lib/`, with unit tests:** budget fit, date overlap and best window, carpool seat claims, food warnings and gas math.
- **AI research** (`src/actions/engine-ai.ts`):
  - The model gets no tools, and page text is treated as untrusted.
  - Sources that weren't in the search results are dropped.
  - A missing price shows "Price not found" instead of a guess.
  - Each trip is capped at 25 research calls.
- **Cron:** housing deadlines auto-lock every 15 minutes.

## Docs

| File | What's in it |
| --- | --- |
| `docs/SPEC.md` | What the app does: the product spec |
| `PLAN.md` | How it's built, module by module, plus the agent log (§9) |
| `docs/BUILD_GUIDE.md` | How the coding agent was directed to build it |
| `docs/LAYOUT.md` | The trip page layout, with mockups in `docs/mockups/` |

## Run it locally

Requires Node 22.15+, 24 or 26, and npm 11.6+.

```sh
npm install
npx deepspace auth login
npm run validate          # type check + 106 unit tests
npx deepspace dev start   # http://localhost:5173
npx deepspace test run all
```
