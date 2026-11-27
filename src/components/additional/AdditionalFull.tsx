/**
 * The Additional section opened up (docs/LAYOUT.md): Activities and Food as
 * two lists, side by side on desktop and stacked on mobile.
 */

import { Link } from 'react-router-dom'
import { Utensils } from 'lucide-react'
import { DIETARY_LABELS, groupNeeds } from '../../lib/food'
import { useFoodPrefs, type Member, type Trip } from '../../lib/trip-data'
import { RankedList } from './RankedList'

export function AdditionalFull({ trip, members, me }: { trip: Trip; members: Member[]; me: Member }) {
  return (
    <div className="mx-auto w-full max-w-6xl p-4" data-testid="additional-full">
      <div className="grid gap-6 min-[900px]:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <h2 className="text-base font-semibold">Activities</h2>
          <RankedList module="activities" trip={trip} members={members} me={me} />
        </div>
        <div className="min-w-0 space-y-3">
          <h2 className="text-base font-semibold">Food</h2>
          <GroupNeeds tripId={trip.id} members={members} />
          <RankedList module="food" trip={trip} members={members} me={me} />
        </div>
      </div>
    </div>
  )
}

/** The group's dietary needs (counts only) and a link to set your own. */
function GroupNeeds({ tripId, members }: { tripId: string; members: Member[] }) {
  const prefs = useFoodPrefs(tripId)
  const active = new Set(members.map((m) => m.userId))
  const needs = groupNeeds(prefs.filter((p) => active.has(p.userId)))
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-testid="group-needs">
      <Utensils className="h-3.5 w-3.5" aria-hidden />
      {needs.length ? `Group needs: ${needs.map((n) => `${DIETARY_LABELS[n.tag]} (${n.count})`).join(', ')}` : 'No dietary needs set.'}
      <Link to={`/trip/${tripId}/settings#food`} className="text-cf-accent-ink hover:underline">Your food preferences</Link>
    </p>
  )
}
