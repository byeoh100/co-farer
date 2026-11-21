# Co-farer Master Spec

> Copy of the [Co-farer Master Spec](https://claude.ai/artifact/GvLauMNkadF9e9mYWSecsH) doc, for the coding agent. If this copy and the doc disagree, the doc wins: ask the human to re-export it. The project was renamed from Trip Quorum to Co-farer on 2026-11-21; the doc may still use the old name, which is not a disagreement. The two diagrams under "Screens and flow" are only in the doc.

Co-farer is a group trip planner where friends decide together on dates, where to stay, and how to get there, with budgets private unless each person chooses to share. This document combines Spec v1 and all module documents into their current versions and resolves the conflicts between them. Where this document differs from an earlier one, this document wins. The earlier documents stay unchanged as backups.

First real test: a spring break trip to Cachuma Lake with 5 to 6 college friends, after beta tests with mock trips of 2 to 3 people. The app itself is general, not specific to camping.

## Build rule: one module at a time

- Build **one module at a time**, in the order below. Do not build the whole app at once.
- Each module must work end to end, be tested with at least two users, and be deployed before the next one starts.
- If time runs out, stop at the last finished module and write up the rest as next steps.

| Order | Module | Priority |
| --- | --- | --- |
| 1 | Core: trips, invites, roles, budgets | Must have |
| 2 | Dates | Must have |
| 3 | Housing | Must have |
| 4 | Transportation | Should have |
| 5 | Notes | Should have |
| 6 | Activities | Nice to have |
| 7 | Food | Nice to have |

Dates are built before housing because housing research waits for locked dates. Stretch extras, only if time is left: gas estimates, the best-window helper for dates, and automatic deadline locking with email reminders.

## Resolved conflicts

| Topic | Earlier version | Now |
| --- | --- | --- |
| Budget | One whole-trip budget (Spec v1) | A budget per category; the total counts essentials only |
| Food and gas costs | Organizer's rough per-person estimate (Spec v1) | Removed; gas comes from the transportation module, food is not counted |
| Dietary needs | Private (Spec v1) | Visible to the group (Food module) |
| Food and activity prices | Not counted | Shown for reference only, not checked against any budget |
| Housing timing | Any time | Starts only once dates are locked |

## 1. Core

- **Organizer** creates a trip and shares an invite link; they set deadlines and lock decisions.
- **Members** join by link, set their budgets and food preferences, add options, vote, and fill in travel details.
- **Budgets:** each person sets a separate budget for housing, gas, food, and activities.
- The **total budget** adds up the essentials only: housing and gas. It is shown on the person's own page.
- Each category shows the estimated cost beside the budget. Going over is flagged, never blocked.
- Each category has its own **private or public switch**, private by default. Public budgets show next to the person's name; private ones only count toward anonymous totals.
- Budget fit is shown as counts, for example "over the housing budget for 2 of 6". With fewer than 3 responses, show a softer message so counts can't identify anyone.

## 2. Dates

- Each person adds **as many availability ranges as they like** on a calendar, with a start and end date. Ranges don't need to overlap.
- An **overlap calendar** shows how many people are free each day; tapping a day shows who.
- Optional **"Help me find the best window"** checkbox: the organizer enters a trip length and the app highlights the best stretches.
- The organizer picks and locks the final dates. Locking the dates **unlocks housing**.

## 3. Housing

- Starts only after dates are locked, so nothing is researched twice.
- The AI suggests the **top 5 options** using a rough group price band, never any one person's exact budget.
- Anyone can **paste links** or add options by name; the AI researches those too.
- Each option shows a summary, estimated price per person, pros and cons, sources, and housing budget fit.
- Members vote live. The organizer can set, change, or remove a deadline. At the deadline the top option locks; on a tie, the organizer picks. The organizer can lock early.

## 4. Transportation

- Each person picks a travel mode: **a seat in a car**, **flying**, or **another way**. Anyone undecided shows as "not decided".
- The trip has a **default meeting point**; each person can override it with their own starting point.
- Drivers list their seats. Riders **tap a car to claim a seat**; a car shows as full when its seats are taken. The app does not suggest who rides with whom.
- Flyers **book their own flights** and can add flight details and arrival time. Others can add a short note.
- Stretch: gas estimates from the trip distance and each car's mileage, split evenly among the people in that car, checked against each person's gas budget.

## 5. Notes

- One **board of sticky notes** for anything, for example "I'm bringing the speaker".
- Each note shows who wrote it and updates live. People edit or delete only their own notes; the organizer can remove any note.

## 6. Activities

- The AI suggests **10 activities**; anyone can paste links or search for more.
- Each shows a description, estimated price per person (reference only), and a source link.
- The list is **ranked by votes**, never locked, with no deadline.

## 7. Food

- Each person adds **dietary requirements and cuisine preferences**, visible to the group.
- The AI suggests **10 places to eat** using the group's needs; anyone can paste links or search for more.
- Places that don't suit everyone **stay on the list** with a warning triangle and a short note, so the group can decide or split up.
- Each shows an estimated price per person (reference only). The list is ranked by votes, never locked.

## Screens and flow

1. **Landing page:** what the app is, plus sign in.
2. **My trips:** the person's trips and a button to create one.
3. **Join page:** where an invite link lands; shows the trip name and a join button.
4. **Trip page:** the main hub, with a tab per module (dates, housing, travel, notes, activities, food). Tabs appear as each module is built.
5. **My settings for this trip:** budgets with their privacy switches, plus food preferences.

After joining, a new member goes straight to their settings to fill in budgets and preferences, then on to the trip page.

_Diagram (in the doc only): logic flow · setup, dates, housing, other tabs._

New members go from the invite link to their settings, then the trip page. Housing opens only after the organizer locks the dates; the other tabs work any time.

_Diagram (in the doc only): trip page sketch · housing tab._

A rough sketch of the trip page on the housing tab. The trip name, votes, and budget counts are example data.

## Edge cases

- **Someone leaves the trip:** their votes and car seat claims are removed. Their notes **stay on the board, grayed out**, marked as from someone who has left.
- **Organizer and notes:** the organizer can remove anyone's notes, including grayed-out ones.
- **Unlocking dates:** before the organizer unlocks the dates, the app shows a **warning that housing will have to be researched again**. If they confirm, housing reopens and is re-researched and re-voted once the new dates are locked.

## AI limits

- Each trip can use about **25 AI research calls**. Once the cap is reached, the app says so instead of researching more.
- When the AI can't find a price, the option shows **"price not found"** instead of guessing. It is left out of budget fit until someone adds a price.
- These limits are a starting point and can be changed later.

## Not in the first build

Expense splitting, cooking and ingredient plans, day-by-day itinerary, flight search or booking, reservations, maps, calendar syncing, ranked-choice voting, chat, note colors or checkboxes, and a mobile app.

## Still to plan before coding

- Screens and flow: decided, see the Screens and flow section.
- Edge cases: decided, see the Edge cases section.
- AI limits: decided, see the AI limits section. All decisions in this spec can be revisited later.
