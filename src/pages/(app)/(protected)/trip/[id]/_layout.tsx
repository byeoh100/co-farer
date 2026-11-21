/**
 * Everything under /trip/:id. Loads the trip and the caller's membership once,
 * starts trip presence, and hands both to the child page via outlet context.
 * Someone who isn't an active member sees the same message whether or not the
 * trip exists, so trip ids can't be probed.
 */

import { Link, Outlet, useParams } from 'react-router-dom'
import { useAuthStatus } from 'deepspace'
import { useMembers, useTrip } from '../../../../../lib/trip-data'
import type { TripContext } from '../../../../../lib/trip-context'
import { TripPresence } from '../../../../../components/trip/TripPresence'

export default function TripLayout() {
  const { id } = useParams<{ id: string }>()
  const { userId } = useAuthStatus()
  const { trip, status } = useTrip(id)
  const { members, status: membersStatus } = useMembers(id)
  const me = members.find((m) => m.userId === userId)

  if (status !== 'ready' || (trip && membersStatus !== 'ready')) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading trip…</div>
  }
  if (!trip || !me || !userId) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center" data-testid="trip-not-found">
        <h1 className="text-lg font-semibold">Trip not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It doesn’t exist, or you’re not a member. Ask the organizer for an invite link.
        </p>
        <Link to="/trips" className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline">
          Back to my trips
        </Link>
      </div>
    )
  }
  return (
    <TripPresence tripId={trip.id} selfId={userId}>
      <Outlet context={{ trip, members, me } satisfies TripContext} />
    </TripPresence>
  )
}
