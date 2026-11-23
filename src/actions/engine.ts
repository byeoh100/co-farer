/**
 * The suggest-research-vote engine's server actions (PLAN.md §3), built for
 * Housing in Module 3 and reused by Activities and Food later.
 *
 * Every action starts with requireMember or requireOrganizer and takes the
 * caller from ctx.userId. Fit is stored as counts only; the AI search gets
 * the average of every set housing budget (public or private), never a
 * named person's number.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { EngineModule } from '../schemas/engine-schemas'
import { computeCategoryFit, groupPriceBand } from '../lib/budget-fit'
import { RESEARCH_CALL_CAP, SUGGESTION_COUNT } from '../lib/limits'
import {
  RESEARCH_SYSTEM_PROMPT, housingSearches, lookupSearches, lookupUserPrompt, perPersonShare, pickTop, suggestUserPrompt,
  type HousingContext, type ResearchedOption,
} from '../lib/research'
import {
  ACTIVITIES_SYSTEM_PROMPT, ACTIVITY_SITES, FOOD_SITES, FOOD_SYSTEM_PROMPT, activitiesSuggestPrompt, activitySearches,
  additionalLookupPrompt, additionalLookupSearches, foodSearches, foodSuggestPrompt, type ActivitiesContext, type FoodContext,
} from '../lib/research-additional'
import { groupNeeds, readDietary } from '../lib/food'
import { requireMember, requireOrganizer } from './trip-access'
import { runResearch, shouldUseFakeAi, type ResearchJob } from './engine-ai'
import { isLocalTestAccount } from './local-test'

type Handler = ActionHandler<Env>
type Row<T> = T & Record<string, unknown>

const fail = (error: string, code: string): ActionResult => ({ success: false, error, code })
const ok = <T>(data: T): ActionResult<T> => ({ success: true, data })

export interface BoardRow {
  tripId: string
  module: EngineModule
  lockable?: number
  status?: 'waiting_for_dates' | 'open' | 'locked'
  deadline?: string | null
  winningOptionId?: string | null
  tieAtDeadline?: number
}

interface OptionRow {
  tripId: string
  boardId: string
  module: EngineModule
  title: string
  url?: string | null
  addedBy?: string | null
  estTotal?: number | null
  estPricePerPerson?: number | null
  researchStatus?: string
}

interface TripRow {
  name: string
  destination?: string | null
  datesStatus?: string
  datesStart?: string | null
  datesEnd?: string | null
  researchCallsUsed?: number
}

const MODULES: readonly EngineModule[] = ['housing', 'activities', 'food']
function isModule(m: unknown): m is EngineModule {
  return typeof m === 'string' && (MODULES as readonly string[]).includes(m)
}

// ── Boards ───────────────────────────────────────────────────────────────

async function findBoard(tools: ActionTools, tripId: string, module: EngineModule) {
  const res = await tools.query<Row<BoardRow>>('boards', { where: { tripId, module }, limit: 1 })
  return res.success ? (res.data.records[0] ?? null) : null
}

/** Gets the trip's board for a module, creating it on first use. Housing waits for locked dates. */
export async function ensureBoard(tools: ActionTools, tripId: string, module: EngineModule) {
  const found = await findBoard(tools, tripId, module)
  if (found) return found
  const trip = await tools.get<Row<TripRow>>('trips', tripId)
  const datesLocked = trip.success && trip.data.record.data.datesStatus === 'locked'
  const status = module === 'housing' && !datesLocked ? 'waiting_for_dates' : 'open'
  await tools.create('boards', { tripId, module, lockable: module === 'housing' ? 1 : 0, status })
  // A concurrent request may have created it first (uniqueOn); read back either way.
  return findBoard(tools, tripId, module)
}

function deadlinePassed(board: BoardRow, now = Date.now()): boolean {
  return !!board.deadline && Date.parse(board.deadline) <= now
}

/**
 * Locks the top-voted option once the deadline has passed. A tie (or no
 * votes) keeps the board open with voting closed, for the organizer to pick.
 * Called by votes after the deadline and by the 15-minute cron task.
 */
export async function settleDeadline(tools: ActionTools, boardId: string, board: BoardRow): Promise<'locked' | 'tie' | 'none'> {
  if (board.status !== 'open' || !deadlinePassed(board)) return 'none'
  const pick = await currentPick(tools, boardId)
  if (pick.kind === 'winner') {
    await tools.update('boards', boardId, { status: 'locked', winningOptionId: pick.optionId, tieAtDeadline: 0 })
    return 'locked'
  }
  if (!board.tieAtDeadline) await tools.update('boards', boardId, { tieAtDeadline: 1 })
  return 'tie'
}

async function currentPick(tools: ActionTools, boardId: string) {
  const options = await tools.query<Row<OptionRow>>('options', { where: { boardId }, limit: 500 })
  const votes = await tools.query<Row<{ optionId: string }>>('votes', { where: { boardId }, limit: 5000 })
  const counts = new Map<string, number>()
  for (const v of votes.success ? votes.data.records : []) counts.set(v.data.optionId, (counts.get(v.data.optionId) ?? 0) + 1)
  return pickTop(counts, options.success ? options.data.records.map((o) => o.recordId) : [])
}

// ── Fit (counts only) ────────────────────────────────────────────────────

async function activeMemberIds(tools: ActionTools, tripId: string): Promise<string[]> {
  const res = await tools.query<Row<{ userId: string; status?: string }>>('team_members', { where: { teamId: tripId }, limit: 500 })
  return res.success ? res.data.records.filter((r) => (r.data.status ?? 'active') === 'active').map((r) => r.data.userId) : []
}

/** Active members' housing budgets. Read server-side only; never returned to anyone. */
async function housingBudgets(tools: ActionTools, tripId: string, members: string[]): Promise<Array<number | null>> {
  const res = await tools.query<Row<{ userId: string; housing?: number | null }>>('budgets', { where: { tripId }, limit: 500 })
  const active = new Set(members)
  return (res.success ? res.data.records : []).filter((r) => active.has(r.data.userId)).map((r) => r.data.housing ?? null)
}

/**
 * Recomputes each housing option's per-person share (total ÷ current group
 * size) and its fit counts. Runs after research, price edits, budget
 * changes, and members joining or leaving.
 */
export async function refreshHousingFit(tools: ActionTools, tripId: string): Promise<void> {
  const board = await findBoard(tools, tripId, 'housing')
  if (!board) return
  const members = await activeMemberIds(tools, tripId)
  const budgets = await housingBudgets(tools, tripId, members)
  const options = await tools.query<Row<OptionRow & { fit?: string }>>('options', { where: { boardId: board.recordId }, limit: 500 })
  for (const o of options.success ? options.data.records : []) {
    const perPerson = perPersonShare(o.data.estTotal, members.length)
    const fit = JSON.stringify(computeCategoryFit(budgets, members.length, perPerson))
    if (fit !== o.data.fit || perPerson !== (o.data.estPricePerPerson ?? null)) {
      await tools.update('options', o.recordId, { fit, estPricePerPerson: perPerson })
    }
  }
}

// ── Research ─────────────────────────────────────────────────────────────

/** Uses one research call against the trip's cap, or says the cap is reached. */
async function takeResearchCall(tools: ActionTools, tripId: string): Promise<ActionResult | null> {
  const trip = await tools.get<Row<TripRow>>('trips', tripId)
  if (!trip.success) return fail('Trip not found.', 'not_found')
  const used = trip.data.record.data.researchCallsUsed ?? 0
  if (used >= RESEARCH_CALL_CAP) {
    return fail(`This trip has used all ${RESEARCH_CALL_CAP} AI research calls. You can still add places and prices by hand.`, 'research_cap')
  }
  await tools.update('trips', tripId, { researchCallsUsed: used + 1 })
  return null
}

async function housingContext(tools: ActionTools, tripId: string): Promise<HousingContext | ActionResult> {
  const trip = await tools.get<Row<TripRow>>('trips', tripId)
  if (!trip.success) return fail('Trip not found.', 'not_found')
  const t = trip.data.record.data
  if (t.datesStatus !== 'locked' || !t.datesStart || !t.datesEnd) return fail('Housing opens once the dates are locked.', 'waiting_for_dates')
  if (!t.destination) return fail('Add a destination to the trip first (organizer: Edit trip).', 'no_destination')
  const members = await activeMemberIds(tools, tripId)
  return {
    destination: t.destination,
    dates: { start: t.datesStart, end: t.datesEnd },
    groupSize: Math.max(1, members.length),
    priceBand: groupPriceBand(await housingBudgets(tools, tripId, members)),
  }
}

/** Activities and food: the destination, dates if locked, group size; food adds the public food preferences. */
async function additionalContext(tools: ActionTools, tripId: string, module: 'activities' | 'food'): Promise<ActivitiesContext | FoodContext | ActionResult> {
  const trip = await tools.get<Row<TripRow>>('trips', tripId)
  if (!trip.success) return fail('Trip not found.', 'not_found')
  const t = trip.data.record.data
  if (!t.destination) return fail('Add a destination to the trip first (organizer: Edit trip).', 'no_destination')
  const members = await activeMemberIds(tools, tripId)
  const base: ActivitiesContext = {
    destination: t.destination,
    dates: t.datesStatus === 'locked' && t.datesStart && t.datesEnd ? { start: t.datesStart, end: t.datesEnd } : null,
    groupSize: Math.max(1, members.length),
  }
  if (module === 'activities') return base
  const prefs = await tools.query<Row<{ userId: string; dietary?: unknown; likes?: string | null; avoids?: string | null }>>('food_prefs', { where: { tripId }, limit: 500 })
  const active = new Set(members)
  const rows = (prefs.success ? prefs.data.records : []).filter((r) => active.has(r.data.userId)).map((r) => r.data)
  return {
    ...base,
    needs: groupNeeds(rows.map((r) => ({ dietary: readDietary(r.dietary) }))),
    likes: rows.map((r) => r.likes ?? '').filter(Boolean),
    avoids: rows.map((r) => r.avoids ?? '').filter(Boolean),
  }
}

type Input = { title: string; url: string | null }

/** The research call for a module: Suggest (no input) or one pasted link or name. */
async function researchJob(
  tools: ActionTools, env: Env, userId: string, tripId: string, module: EngineModule, input: Input | null,
): Promise<ResearchJob | ActionResult> {
  const fake = await shouldUseFakeAi(env, tools, userId)
  const count = SUGGESTION_COUNT[module]
  if (module === 'housing') {
    const ctx = await housingContext(tools, tripId)
    if ('success' in ctx) return ctx
    return {
      module, fake, system: RESEARCH_SYSTEM_PROMPT, shape: { price: 'total' },
      searches: input ? lookupSearches(input, ctx.destination) : housingSearches(ctx),
      userPrompt: (r) => (input ? lookupUserPrompt(ctx, input, r) : suggestUserPrompt(ctx, count, r)),
    }
  }
  const ctx = await additionalContext(tools, tripId, module)
  if ('success' in ctx) return ctx
  if (module === 'activities') {
    return {
      module, fake, system: ACTIVITIES_SYSTEM_PROMPT, shape: { price: 'perPerson' },
      searches: input ? additionalLookupSearches(ACTIVITY_SITES, input, ctx.destination) : activitySearches(ctx),
      userPrompt: (r) => (input ? additionalLookupPrompt('activity', ctx, ACTIVITY_SITES, input, r) : activitiesSuggestPrompt(ctx, count, r)),
    }
  }
  const food = ctx as FoodContext
  return {
    module, fake, system: FOOD_SYSTEM_PROMPT, shape: { price: 'perPerson', dietary: true },
    searches: input ? additionalLookupSearches(FOOD_SITES, input, food.destination) : foodSearches(food),
    userPrompt: (r) => (input ? additionalLookupPrompt('place to eat', food, FOOD_SITES, input, r) : foodSuggestPrompt(food, count, r)),
    fakeNeeds: food.needs.map((n) => n.tag),
  }
}

/** What research writes onto an option. Housing stores the total; the others the per-person price. */
function researchFields(module: EngineModule, o: ResearchedOption) {
  const price = module === 'housing' ? o.totalPrice : o.pricePerPerson
  return {
    researchStatus: 'done',
    research: JSON.stringify({ summary: o.summary, pros: o.pros, cons: o.cons, sources: o.sources }),
    ...(module === 'housing' ? { estTotal: o.totalPrice } : { estTotal: null, estPricePerPerson: o.pricePerPerson }),
    ...(module === 'food' ? { accommodates: JSON.stringify(o.accommodates ?? []) } : {}),
    priceSource: price == null ? null : 'ai',
    imageUrl: o.imageUrl,
  }
}

const sameUrl = (a?: string | null, b?: string | null) => !!a && !!b && a.replace(/\/$/, '') === b.replace(/\/$/, '')

/** Shared guard for engine actions: member, valid module, open board. */
async function openBoard(tools: ActionTools, params: Record<string, unknown>, userId: string) {
  const check = await requireMember(tools, params.tripId, userId)
  if (!check.ok) return { error: fail(check.error, check.code) }
  if (!isModule(params.module)) return { error: fail('Unknown section.', 'bad_request') }
  const board = await ensureBoard(tools, check.membership.tripId, params.module)
  if (!board) return { error: fail('Could not open this section.', 'board_failed') }
  if (board.data.status === 'waiting_for_dates') return { error: fail('Housing opens once the dates are locked.', 'waiting_for_dates') }
  if (board.data.status === 'locked') return { error: fail('This is locked.', 'board_locked') }
  return { tripId: check.membership.tripId, module: params.module, board }
}

/** AI suggests N options (5 housing, 10 activities or food). "Search for more" calls it again. */
const suggestOptions: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const g = await openBoard(tools, params, userId)
  if ('error' in g) return g.error!
  const job = await researchJob(tools, env, userId, g.tripId, g.module, null)
  if ('success' in job) return job
  const capped = await takeResearchCall(tools, g.tripId)
  if (capped) return capped

  const count = SUGGESTION_COUNT[g.module]
  const outcome = await runResearch(tools, job)
  if (!outcome.ok) return fail(outcome.error, outcome.code)

  const existing = await tools.query<Row<OptionRow>>('options', { where: { boardId: g.board.recordId }, limit: 500 })
  const have = existing.success ? existing.data.records : []
  let added = 0
  for (const o of outcome.options) {
    if (added >= count) break
    if (have.some((h) => sameUrl(h.data.url, o.url) || h.data.title.toLowerCase() === o.title.toLowerCase())) continue
    const created = await tools.create('options', {
      tripId: g.tripId, boardId: g.board.recordId, module: g.module, title: o.title, url: o.url,
      source: 'ai', addedBy: userId, ...researchFields(g.module, o),
    })
    if (created.success) added++
  }
  if (g.module === 'housing') await refreshHousingFit(tools, g.tripId)
  return ok({ added })
}

/** Anyone pastes a link or types a name; it's added at once, then researched. */
const addOption: Handler = async ({ userId, params, tools, env }) => {
  const g = await openBoard(tools, params, userId)
  if ('error' in g) return g.error!
  const raw = typeof params.input === 'string' ? params.input.trim() : ''
  if (!raw || raw.length > 1000) return fail('Paste a link or type a name.', 'bad_request')
  let url: string | null = null
  let title = raw.replace(/\s+/g, ' ').slice(0, 160)
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw)
      url = u.toString()
      title = u.hostname.replace(/^www\./, '')
    } catch {
      return fail('That link doesn’t look right.', 'bad_request')
    }
  }
  const created = await tools.create('options', {
    tripId: g.tripId, boardId: g.board.recordId, module: g.module, title, url,
    source: 'member', addedBy: userId, researchStatus: 'pending',
  })
  if (!created.success) return fail('Could not add that.', 'create_failed')
  const research = await researchInto(tools, env, userId, g.tripId, g.module, created.data.recordId, { title, url })
  if (g.module === 'housing') await refreshHousingFit(tools, g.tripId)
  return ok({ optionId: created.data.recordId, researched: research.success, note: research.success ? undefined : research.error })
}

/** Researches one option again (e.g. after research failed). */
const researchOption: Handler = async ({ userId, params, tools, env }) => {
  const g = await openBoard(tools, params, userId)
  if ('error' in g) return g.error!
  if (typeof params.optionId !== 'string') return fail('optionId is required.', 'bad_request')
  const opt = await tools.get<Row<OptionRow>>('options', params.optionId)
  if (!opt.success || opt.data.record.data.boardId !== g.board.recordId) return fail('That option wasn’t found.', 'not_found')
  const o = opt.data.record.data
  const res = await researchInto(tools, env, userId, g.tripId, g.module, params.optionId, { title: o.title, url: o.url ?? null })
  if (g.module === 'housing') await refreshHousingFit(tools, g.tripId)
  return res
}

async function researchInto(
  tools: ActionTools, env: Env, userId: string, tripId: string, module: EngineModule, optionId: string, input: Input,
): Promise<ActionResult> {
  const job = await researchJob(tools, env, userId, tripId, module, input)
  if ('success' in job) {
    await tools.update('options', optionId, { researchStatus: 'failed' })
    return job
  }
  const capped = await takeResearchCall(tools, tripId)
  if (capped) {
    await tools.update('options', optionId, { researchStatus: 'failed' })
    return capped
  }
  const outcome = await runResearch(tools, job)
  const found = outcome.ok ? outcome.options[0] : undefined
  if (!found) {
    await tools.update('options', optionId, { researchStatus: 'failed' })
    return outcome.ok ? fail('The AI couldn’t find that place in the search results.', 'not_found_in_results') : fail(outcome.error, outcome.code)
  }
  await tools.update('options', optionId, { ...researchFields(module, found), url: input.url ?? found.url, title: input.url ? found.title : input.title })
  return ok({ researched: true })
}

/** Approval voting: tap to add or remove your vote. */
const toggleVote: Handler = async ({ userId, params, tools }) => {
  const g = await openBoard(tools, params, userId)
  if ('error' in g) return g.error!
  if (deadlinePassed(g.board.data)) {
    const settled = await settleDeadline(tools, g.board.recordId, g.board.data)
    return fail(settled === 'locked' ? 'The deadline passed and the top option was locked.' : 'Voting closed at the deadline. The organizer will pick.', 'voting_closed')
  }
  if (typeof params.optionId !== 'string') return fail('optionId is required.', 'bad_request')
  const opt = await tools.get<Row<OptionRow>>('options', params.optionId)
  if (!opt.success || opt.data.record.data.boardId !== g.board.recordId) return fail('That option wasn’t found.', 'not_found')
  const mine = await tools.query('votes', { where: { optionId: params.optionId, userId }, limit: 1 })
  const current = mine.success ? mine.data.records[0] : undefined
  if (current) {
    await tools.remove('votes', current.recordId)
    return ok({ voted: false })
  }
  // A double tap can race two creates; uniqueOn keeps one, so a failed create still means "voted".
  await tools.create('votes', { tripId: g.tripId, boardId: g.board.recordId, optionId: params.optionId, userId })
  return ok({ voted: true })
}

/** Any member fills in (or corrects) a price: housing's total for the stay, or per person for the others. Labeled "added by a member". */
const setOptionPrice: Handler = async ({ userId, params, tools }) => {
  const g = await openBoard(tools, params, userId)
  if ('error' in g) return g.error!
  if (typeof params.optionId !== 'string') return fail('optionId is required.', 'bad_request')
  const opt = await tools.get<Row<OptionRow>>('options', params.optionId)
  if (!opt.success || opt.data.record.data.boardId !== g.board.recordId) return fail('That option wasn’t found.', 'not_found')
  if (g.module === 'housing') {
    const raw = params.totalPrice
    const price = raw == null || raw === '' ? null : Number(raw)
    if (price != null && (!Number.isInteger(price) || price < 1 || price > 1_000_000)) {
      return fail('The price must be a whole number of dollars for the whole stay.', 'bad_request')
    }
    await tools.update('options', params.optionId, { estTotal: price, priceSource: price == null ? null : 'member' })
    await refreshHousingFit(tools, g.tripId)
    return ok({ saved: true })
  }
  // Activities and food: per person, for reference only (0 = free). The human's decision.
  const raw = params.pricePerPerson
  const price = raw == null || raw === '' ? null : Number(raw)
  if (price != null && (!Number.isInteger(price) || price < 0 || price > 100_000)) {
    return fail('The price must be a whole number of dollars per person.', 'bad_request')
  }
  await tools.update('options', params.optionId, { estPricePerPerson: price, priceSource: price == null ? null : 'member' })
  return ok({ saved: true })
}

async function organizerBoard(tools: ActionTools, params: Record<string, unknown>, userId: string) {
  const check = await requireOrganizer(tools, params.tripId, userId)
  if (!check.ok) return { error: fail(check.error, check.code) }
  if (!isModule(params.module)) return { error: fail('Unknown section.', 'bad_request') }
  const board = await ensureBoard(tools, check.membership.tripId, params.module)
  if (!board) return { error: fail('Could not open this section.', 'board_failed') }
  if (!board.data.lockable) return { error: fail('This list is never locked.', 'not_lockable') }
  if (board.data.status !== 'open') return { error: fail(board.data.status === 'locked' ? 'This is already locked.' : 'Housing opens once the dates are locked.', 'board_not_open') }
  return { board }
}

export const MAX_DEADLINE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The organizer gives everyone N days (1–30) to decide; voting closes N×24h
 * from now. Automated tests on a local server may pass `seconds` instead.
 */
const setDeadline: Handler = async ({ userId, params, tools, env }) => {
  const g = await organizerBoard(tools, params, userId)
  if ('error' in g) return g.error!
  let ms: number
  if (params.seconds != null && (await isLocalTestAccount(env, tools, userId))) {
    const secs = Number(params.seconds)
    if (!Number.isInteger(secs) || secs < 1 || secs > 3600) return fail('seconds must be 1–3600.', 'bad_request')
    ms = secs * 1000
  } else {
    const days = Number(params.days)
    if (!Number.isInteger(days) || days < 1 || days > MAX_DEADLINE_DAYS) {
      return fail(`Pick a whole number of days from 1 to ${MAX_DEADLINE_DAYS}.`, 'bad_request')
    }
    ms = days * DAY_MS
  }
  await tools.update('boards', g.board.recordId, { deadline: new Date(Date.now() + ms).toISOString(), tieAtDeadline: 0 })
  return ok({ saved: true })
}

const clearDeadline: Handler = async ({ userId, params, tools }) => {
  const g = await organizerBoard(tools, params, userId)
  if ('error' in g) return g.error!
  await tools.update('boards', g.board.recordId, { deadline: null, tieAtDeadline: 0 })
  return ok({ saved: true })
}

/** Locks the given option, or the top-voted one. A tie returns code 'tie' with the tied ids. */
const lockBoard: Handler = async ({ userId, params, tools }) => {
  const g = await organizerBoard(tools, params, userId)
  if ('error' in g) return g.error!
  let optionId: string
  if (typeof params.optionId === 'string') {
    const opt = await tools.get<Row<OptionRow>>('options', params.optionId)
    if (!opt.success || opt.data.record.data.boardId !== g.board.recordId) return fail('That option wasn’t found.', 'not_found')
    optionId = params.optionId
  } else {
    const pick = await currentPick(tools, g.board.recordId)
    if (pick.kind === 'none') return fail('Nobody has voted yet. Pick an option to lock.', 'no_votes')
    if (pick.kind === 'tie') return fail('It’s a tie. Pick one of the tied options.', 'tie')
    optionId = pick.optionId
  }
  await tools.update('boards', g.board.recordId, { status: 'locked', winningOptionId: optionId, tieAtDeadline: 0 })
  return ok({ locked: true, optionId })
}

/** Whoever added an option (or asked for the suggestion) and the organizer can remove it, with its votes. */
const removeOption: Handler = async ({ userId, params, tools }) => {
  const g = await openBoard(tools, params, userId)
  if ('error' in g) return g.error!
  if (typeof params.optionId !== 'string') return fail('optionId is required.', 'bad_request')
  const opt = await tools.get<Row<OptionRow>>('options', params.optionId)
  if (!opt.success || opt.data.record.data.boardId !== g.board.recordId) return fail('That option wasn’t found.', 'not_found')
  if (opt.data.record.data.addedBy !== userId) {
    const org = await requireOrganizer(tools, g.tripId, userId)
    if (!org.ok) return fail('Only the person who added this, or the organizer, can remove it.', 'not_allowed')
  }
  await tools.deleteWhere('votes', { optionId: params.optionId }, 500)
  await tools.remove('options', params.optionId)
  return ok({ removed: true })
}

export const engineActions: Record<string, Handler> = {
  suggestOptions, addOption, researchOption, removeOption, toggleVote, setOptionPrice, setDeadline, clearDeadline, lockBoard,
}

// ── Hooks used by other modules ──────────────────────────────────────────

/** Dates locked: housing opens, empty, ready for fresh suggestions. */
export async function openHousingForDates(tools: ActionTools, tripId: string): Promise<void> {
  const board = await ensureBoard(tools, tripId, 'housing')
  if (board && board.data.status === 'waiting_for_dates') await tools.update('boards', board.recordId, { status: 'open' })
}

/**
 * Dates unlocked: housing waits again, and its places and votes are cleared
 * (researched for other dates, so they'd be wrong). The research count is
 * kept: the cap is per trip.
 */
export async function resetHousingForDates(tools: ActionTools, tripId: string): Promise<void> {
  const board = await findBoard(tools, tripId, 'housing')
  if (!board) return
  await tools.update('boards', board.recordId, { status: 'waiting_for_dates', deadline: null, winningOptionId: null, tieAtDeadline: 0 })
  for (const collection of ['votes', 'options']) {
    for (let i = 0; i < 50; i++) {
      const res = await tools.deleteWhere(collection, { boardId: board.recordId }, 500)
      if (!res.success || res.data.deleted < 500) break
    }
  }
}

