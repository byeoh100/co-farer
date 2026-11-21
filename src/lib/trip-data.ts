/**
 * Read hooks for a trip's synced records. Reads go straight to DeepSpace's
 * live records (the 'team' and 'own' read rules decide what each person
 * gets); writes never happen here, only through callAction.
 */

import { useMemo } from 'react'
import { useQuery } from 'deepspace'
import type { BudgetCategory } from '../schemas/trip-schemas'
import { readPublicCategories } from './core-input'

export interface Trip {
  id: string
  name: string
  destination: string | null
  organizerId: string
  inviteCode: string
}

export interface Member {
  recordId: string
  userId: string
  tripRole: 'organizer' | 'member'
  status: 'active' | 'left'
  displayName: string
  imageUrl: string | null
}

type TripRow = { name: string; destination?: string | null; organizerId: string; inviteCode: string }
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
