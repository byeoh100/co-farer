/**
 * "Getting there" on the trip overview (co-farer-redesign/SPEC.md,
 * TravelCard): one row per car with a circle per seat in each rider's
 * colour, "Claim seat" when you have no ride and a seat is open (the
 * existing claimSeat action), one row per person travelling on their own,
 * and the gas estimate.
 */

import { useMemo, useState } from 'react'
import { Bus, Car as CarIcon, Plane, TrainFront } from 'lucide-react'
import { useToast } from '@/components/ui'
import { callAction } from '../../lib/actions-client'
import { seatsLeft } from '../../lib/overview'
import { usePersonColor } from '../../lib/person-colors-context'
import { buildBoard, gasPerPerson, type TravelEntry } from '../../lib/travel'
import { useSeatClaims, useTravel, type Member, type Trip } from '../../lib/trip-data'
import { CardHeader, CardShell, Pill, PillButton, money } from '../trip/cards'
import type { SectionControl } from '../trip/ExpandableSection'

const VERB: Record<string, string> = {
  flight: 'flies in',
  train: 'takes the train',
  bus: 'takes the bus',
  dropoff: 'gets dropped off',
  other: 'gets there another way',
}

export function TravelCard({ trip, members, me, control }: { trip: Trip; members: Member[]; me: Member; control: SectionControl }) {
  const entries = useTravel(trip.id)
  const claims = useSeatClaims(trip.id)
  const colorOf = usePersonColor()
  const { success, error } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const board = useMemo(() => buildBoard(members.map((m) => m.userId), entries, claims), [members, entries, claims])
  const names = new Map(members.map((m) => [m.userId, m.displayName]))
  const name = (id: string) => names.get(id) ?? 'Someone'
  const cars = board.groups.flatMap((g) => g.cars)
  const open = seatsLeft(cars)
  const flying = board.others.filter((e) => e.otherKind === 'flight').length
  const hasRide = cars.some((c) => c.driverId === me.userId || c.riders.includes(me.userId))

  const gas = cars
    .map((c) => gasPerPerson(trip.tripMiles, c.mpg, trip.gasPrice, 1 + c.riders.length))
    .filter((g): g is number => g != null)
  const gasText = gas.length ? (Math.min(...gas) === Math.max(...gas) ? money(gas[0]) : `${money(Math.min(...gas))}–${money(Math.max(...gas))}`) : null

  const claim = async (driverUserId: string) => {
    setBusy(driverUserId)
    const res = await callAction('claimSeat', { tripId: trip.id, driverUserId })
    setBusy(null)
    if (res.success) success(`Seat in ${name(driverUserId)}’s car`)
    else error('Couldn’t claim that seat', res.error)
  }

  const counts = [
    `${cars.length} ${cars.length === 1 ? 'car' : 'cars'}`,
    flying > 0 && `${flying} flying`,
    board.others.length - flying > 0 && `${board.others.length - flying} another way`,
  ].filter(Boolean).join(', ')

  return (
    <CardShell sectionId="travel" testId="travel-summary">
      <CardHeader
        title="Getting there"
        sub={trip.meetingPoint ? `From ${trip.meetingPoint} · ${counts}` : counts}
        action={
          <div className="flex items-center gap-2">
            {open > 0 && <Pill tone="soft">{open} {open === 1 ? 'seat' : 'seats'} left</Pill>}
            <PillButton size="sm" data-testid="section-travel" onClick={control.open} {...control.buttonProps}>
              Open travel
            </PillButton>
          </div>
        }
      />
      {cars.length === 0 && board.others.length === 0 ? (
        <p className="rounded-[14px] bg-cf-surface-2 p-4 text-sm text-cf-muted">Nobody has said how they’re getting there yet.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {cars.map((c) => {
            const riders = c.riders.map(name)
            const seatsOpen = Math.max(0, c.seats - c.riders.length)
            return (
              <div key={c.driverId} className="flex items-center justify-between gap-3 rounded-[14px] bg-cf-surface-2 p-3" data-testid="overview-car">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="flex items-center gap-1.5 truncate font-semibold">
                    <CarIcon className="h-4 w-4 shrink-0 text-cf-muted" aria-hidden />
                    {name(c.driverId)}’s car
                  </span>
                  <div
                    className="flex gap-1.5"
                    role="img"
                    aria-label={`${[name(c.driverId), ...riders].join(', ')} · ${seatsOpen} of ${c.seats} ${c.seats === 1 ? 'seat' : 'seats'} open`}
                  >
                    {[c.driverId, ...c.riders].map((u) => (
                      <span key={u} title={name(u)} className="h-[26px] w-[26px] rounded-full" style={{ background: colorOf(u) }} />
                    ))}
                    {Array.from({ length: seatsOpen }, (_, i) => (
                      <span key={`open-${i}`} className="h-[26px] w-[26px] rounded-full border-2 border-dashed border-cf-border" />
                    ))}
                  </div>
                </div>
                {seatsOpen > 0 ? (
                  !hasRide && c.driverId !== me.userId ? (
                    <PillButton variant="ink" size="md" onClick={() => claim(c.driverId)} disabled={!!busy} aria-busy={busy === c.driverId}>
                      Claim seat
                    </PillButton>
                  ) : null
                ) : (
                  <span className="text-[13px] text-cf-muted">Full</span>
                )}
              </div>
            )
          })}
          {board.others.map((e) => (
            <OtherTraveller key={e.userId} entry={e} name={name(e.userId)} color={colorOf(e.userId)} />
          ))}
        </div>
      )}
      {gasText && <p className="tabular text-[13px] text-cf-muted">Gas about {gasText} per person, split in each car</p>}
    </CardShell>
  )
}

function OtherTraveller({ entry, name, color }: { entry: TravelEntry; name: string; color: string }) {
  const Icon = entry.otherKind === 'flight' ? Plane : entry.otherKind === 'train' ? TrainFront : entry.otherKind === 'bus' ? Bus : CarIcon
  const when = entry.fromDate ? new Date(`${entry.fromDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null
  const detail = [entry.details, when].filter(Boolean).join(' · ')
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] bg-cf-surface-2 p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span title={name} className="h-[26px] w-[26px] shrink-0 rounded-full" style={{ background: color }} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">
            {name} {VERB[entry.otherKind ?? 'other']}
          </span>
          {detail && <span className="truncate text-[13px] text-cf-muted">{detail}</span>}
        </div>
      </div>
      <Icon className="h-5 w-5 shrink-0 text-cf-muted" aria-hidden />
    </div>
  )
}
