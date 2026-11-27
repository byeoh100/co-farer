/**
 * Everything under /trip/:id. Loads the trip and the caller's membership once,
 * starts trip presence, and hands both to the child page via outlet context.
 * Someone who isn't an active member sees the same message whether or not the
 * trip exists, so trip ids can't be probed.
 */

import { Link, Outlet, useLocation, useParams } from 'react-router-dom'
import { useAuthStatus } from 'deepspace'
import { useMembers, useTrip } from '../../../../../lib/trip-data'
import type { TripContext } from '../../../../../lib/trip-context'
import { TripPresence } from '../../../../../components/trip/TripPresence'
import { MembersStack } from '../../../../../components/trip/MembersStack'
import { HeaderPortal } from '../../../../../components/HeaderSlot'
import { PersonColorsProvider } from '../../../../../lib/person-colors-context'

export default function TripLayout() {
  const { id } = useParams<{ id: string }>()
  const { userId } = useAuthStatus()
  const { trip, status } = useTrip(id)
  // Everyone, including people who left: their colours must not shift.
  const { members: everyone, status: membersStatus } = useMembers(id, { includeLeft: true })
  const members = everyone.filter((m) => m.status === 'active')
  const me = members.find((m) => m.userId === userId)
  const { pathname } = useLocation()

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
        <Link to="/trips" className="mt-6 inline-block text-sm text-cf-accent-ink underline-offset-4 hover:underline">
          Back to my trips
        </Link>
      </div>
    )
  }
  return (
    <PersonColorsProvider members={everyone}>
      <TripPresence tripId={trip.id} selfId={userId}>
        {/* The trip's parts of the app header (co-farer-redesign/SPEC.md, AppHeader). */}
        <HeaderPortal slot="nav">
          <Link
            to={`/trip/${trip.id}`}
            aria-current={pathname === `/trip/${trip.id}` ? 'page' : undefined}
            className="max-w-[16ch] truncate border-b-2 border-transparent pb-1.5 text-cf-muted hover:text-cf-text aria-[current=page]:border-cf-accent-ink aria-[current=page]:text-cf-text"
          >
            {trip.name}
          </Link>
        </HeaderPortal>
        <HeaderPortal slot="end">
          <MembersStack trip={trip} members={members} isOrganizer={me.tripRole === 'organizer'} />
        </HeaderPortal>
        <Outlet context={{ trip, members, me } satisfies TripContext} />
      </TripPresence>
    </PersonColorsProvider>
  )
}
