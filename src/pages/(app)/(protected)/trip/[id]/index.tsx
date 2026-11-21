import { TripOverview } from '../../../../../components/trip/TripOverview'
import { useTripContext } from '../../../../../lib/trip-context'

export default function TripPage() {
  const { trip, members, me } = useTripContext()
  return (
    <>
      <title>{`${trip.name} · Co-farer`}</title>
      <TripOverview trip={trip} members={members} me={me} />
    </>
  )
}
