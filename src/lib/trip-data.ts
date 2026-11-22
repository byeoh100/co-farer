/**
 * Read hooks for a trip's synced records. Reads go straight to DeepSpace's
 * live records (the 'team' and 'own' read rules decide what each person
 * gets); writes never happen here, only through callAction.
 */

import { useMemo } from 'react'
import { useQuery } from 'deepspace'
import type { BudgetCategory } from '../schemas/trip-schemas'
import type { EngineModule } from '../schemas/engine-schemas'
import type { CategoryFit } from './budget-fit'
import { readPublicCategories } from './core-input'

export interface Trip {
  id: string
  name: string
  destination: string | null
  organizerId: string
  inviteCode: string
  datesStatus: 'open' | 'locked'
  /** YYYY-MM-DD; set only while locked. */
  datesStart: string | null
  datesEnd: string | null
  researchCallsUsed: number
}

export interface Member {
  recordId: string
  userId: string
  tripRole: 'organizer' | 'member'
  status: 'active' | 'left'
  displayName: string
  imageUrl: string | null
}

type TripRow = {
  name: string
  destination?: string | null
  organizerId: string
  inviteCode: string
  datesStatus?: string | null
  datesStart?: string | null
  datesEnd?: string | null
  researchCallsUsed?: number | null
}
type MemberRow = {
  teamId: string
  userId: string
  status?: string
  tripRole?: string
  displayName?: string | null
  imageUrl?: string | null
}

/** Every trip the caller is an active member of. */
export function useMyTrips(): { trips: Trip[]; status: 'loading' | 'ready' | 'error' } {
  const { records, status } = useQuery<TripRow>('trips', { orderBy: 'createdAt', orderDir: 'desc' })
  const trips = useMemo(() => records.map(toTrip), [records])
  return { trips, status }
}

export function useTrip(tripId: string | undefined) {
  const { trips, status } = useMyTrips()
  const trip = trips.find((t) => t.id === tripId) ?? null
  return { trip, status }
}

function toTrip(r: { recordId: string; data: TripRow }): Trip {
  return {
    id: r.recordId,
    name: r.data.name,
    destination: r.data.destination ?? null,
    organizerId: r.data.organizerId,
    inviteCode: r.data.inviteCode,
    datesStatus: r.data.datesStatus === 'locked' && r.data.datesStart && r.data.datesEnd ? 'locked' : 'open',
    datesStart: r.data.datesStart ?? null,
    datesEnd: r.data.datesEnd ?? null,
    researchCallsUsed: r.data.researchCallsUsed ?? 0,
  }
}

/** Members of a trip, organizer first, then by name. `left` members are excluded unless asked for. */
export function useMembers(tripId: string | undefined, { includeLeft = false } = {}) {
  const { records, status } = useQuery<MemberRow>('team_members', { where: { teamId: tripId ?? '' } })
  const members = useMemo(() => {
    return records
      .map(
        (r): Member => ({
          recordId: r.recordId,
          userId: r.data.userId,
          tripRole: r.data.tripRole === 'organizer' ? 'organizer' : 'member',
          status: r.data.status === 'left' ? 'left' : 'active',
          displayName: r.data.displayName || 'Traveler',
          imageUrl: r.data.imageUrl || null,
        }),
      )
      .filter((m) => includeLeft || m.status === 'active')
      .sort((a, b) =>
        a.tripRole !== b.tripRole ? (a.tripRole === 'organizer' ? -1 : 1) : a.displayName.localeCompare(b.displayName),
      )
  }, [records, includeLeft])
  return { members, status }
}

export type MyBudget = Record<BudgetCategory, number | null> & { publicCategories: BudgetCategory[] }

/** The caller's own private budget row. Only its owner can ever read it ('own' rule). */
export function useMyBudget(tripId: string | undefined, userId: string | undefined) {
  const { records, status } = useQuery<Record<string, unknown>>('budgets', {
    where: { tripId: tripId ?? '', userId: userId ?? '' },
    limit: 1,
  })
  const budget = useMemo((): MyBudget | null => {
    const r = records[0]
    if (!r) return null
    const num = (v: unknown) => (typeof v === 'number' ? v : null)
    return {
      housing: num(r.data.housing),
      gas: num(r.data.gas),
      food: num(r.data.food),
      activities: num(r.data.activities),
      publicCategories: readPublicCategories(r.data.publicCategories),
    }
  }, [records])
  return { budget, status }
}

/** Budgets people chose to show the group, keyed by userId. */
export function usePublicBudgets(tripId: string | undefined) {
  const { records } = useQuery<{ userId: string; category: BudgetCategory; amount: number }>('public_budgets', {
    where: { tripId: tripId ?? '' },
  })
  return useMemo(() => {
    const byUser = new Map<string, Partial<Record<BudgetCategory, number>>>()
    for (const r of records) {
      const entry = byUser.get(r.data.userId) ?? {}
      entry[r.data.category] = r.data.amount
      byUser.set(r.data.userId, entry)
    }
    return byUser
  }, [records])
}

export interface AvailabilityRange {
  recordId: string
  userId: string
  start: string
  end: string
}

/** Everyone's date ranges in this trip (Module 2). */
export function useAvailability(tripId: string | undefined) {
  const { records, status } = useQuery<{ userId: string; start: string; end: string }>('availability', {
    where: { tripId: tripId ?? '' },
  })
  const ranges = useMemo(
    () => records.map((r): AvailabilityRange => ({ recordId: r.recordId, userId: r.data.userId, start: r.data.start, end: r.data.end })),
    [records],
  )
  return { ranges, status }
}

// ── Module 3: the suggest-research-vote engine ──────────────────────────

export interface Board {
  id: string
  module: EngineModule
  lockable: boolean
  status: 'waiting_for_dates' | 'open' | 'locked'
  deadline: string | null
  winningOptionId: string | null
  tieAtDeadline: boolean
}

export interface OptionResearch {
  summary: string
  pros: string[]
  cons: string[]
  sources: string[]
}

export interface EngineOption {
  id: string
  title: string
  url: string | null
  source: 'ai' | 'member'
  addedBy: string | null
  researchStatus: 'pending' | 'done' | 'failed'
  research: OptionResearch | null
  /** One person's share of the whole stay (total ÷ group size). */
  price: number | null
  /** The whole stay for the whole group. */
  total: number | null
  priceSource: 'ai' | 'member' | null
  imageUrl: string | null
  fit: CategoryFit | null
  createdAt: string
}

function parseJson<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function useBoard(tripId: string | undefined, module: EngineModule) {
  const { records, status } = useQuery<Record<string, unknown>>('boards', { where: { tripId: tripId ?? '', module }, limit: 1 })
  const board = useMemo((): Board | null => {
    const r = records[0]
    if (!r) return null
    const d = r.data
    return {
      id: r.recordId,
      module,
      lockable: !!d.lockable,
      status: d.status === 'locked' ? 'locked' : d.status === 'waiting_for_dates' ? 'waiting_for_dates' : 'open',
      deadline: typeof d.deadline === 'string' && d.deadline ? d.deadline : null,
      winningOptionId: typeof d.winningOptionId === 'string' && d.winningOptionId ? d.winningOptionId : null,
      tieAtDeadline: !!d.tieAtDeadline,
    }
  }, [records, module])
  return { board, status }
}

export function useOptions(tripId: string | undefined, module: EngineModule) {
  const { records, status } = useQuery<Record<string, unknown>>('options', { where: { tripId: tripId ?? '', module } })
  const options = useMemo(
    () =>
      records.map((r): EngineOption => {
        const d = r.data
        return {
          id: r.recordId,
          title: String(d.title ?? ''),
          url: typeof d.url === 'string' && d.url ? d.url : null,
          source: d.source === 'ai' ? 'ai' : 'member',
          addedBy: typeof d.addedBy === 'string' ? d.addedBy : null,
          researchStatus: d.researchStatus === 'done' ? 'done' : d.researchStatus === 'failed' ? 'failed' : 'pending',
          research: parseJson<OptionResearch>(d.research),
          price: typeof d.estPricePerPerson === 'number' ? d.estPricePerPerson : null,
          total: typeof d.estTotal === 'number' ? d.estTotal : null,
          priceSource: d.priceSource === 'ai' || d.priceSource === 'member' ? d.priceSource : null,
          imageUrl: typeof d.imageUrl === 'string' && d.imageUrl.startsWith('https://') ? d.imageUrl : null,
          fit: parseJson<CategoryFit>(d.fit),
          createdAt: r.createdAt,
        }
      }),
    [records],
  )
  return { options, status }
}

/** optionId → voter userIds. */
export function useVotes(tripId: string | undefined) {
  const { records } = useQuery<{ optionId: string; userId: string; boardId: string }>('votes', { where: { tripId: tripId ?? '' } })
  return useMemo(() => {
    const byOption = new Map<string, string[]>()
    for (const r of records) byOption.set(r.data.optionId, [...(byOption.get(r.data.optionId) ?? []), r.data.userId])
    return byOption
  }, [records])
}

/** Options ranked by votes (then oldest first), with their voters. */
export function rankOptions(options: EngineOption[], votes: Map<string, string[]>) {
  return options
    .map((o) => ({ option: o, voters: votes.get(o.id) ?? [] }))
    .sort((a, b) => b.voters.length - a.voters.length || a.option.createdAt.localeCompare(b.option.createdAt))
}

/** Locked housing's price per person: each member's housing estimate (spec §3, PLAN.md §4.3). */
export function useHousingEstimate(tripId: string | undefined): number | null {
  const { board } = useBoard(tripId, 'housing')
  const { options } = useOptions(tripId, 'housing')
  if (!board || board.status !== 'locked' || !board.winningOptionId) return null
  return options.find((o) => o.id === board.winningOptionId)?.price ?? null
}
