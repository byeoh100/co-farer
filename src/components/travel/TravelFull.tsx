/**
 * Travel's expanded view (spec §4): your own travel, then the carpool board
 * grouped by starting point, then everyone getting there another way, then
 * who hasn't decided. Writes go through src/actions/travel.ts.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Car as CarIcon, Fuel, MapPin, Plane, UserMinus } from 'lucide-react'
import { Button, ConfirmModal, Input, Label, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { OTHER_KINDS, type OtherKind } from '../../schemas/travel-schemas'
import { callAction } from '../../lib/actions-client'
import { formatRange } from '../../lib/dates'
import {
  DEFAULT_GAS_PRICE, DEFAULT_MPG, MAX_DETAILS, MAX_PICKUP_NOTE, MAX_SEATS, MAX_START_POINT, MAX_TRIP_MILES, OTHER_KIND_LABELS,
  buildBoard, gasPerPerson, type Car, type TravelEntry,
} from '../../lib/travel'
import { useCarPickups, useMyPickupNote, useSeatClaims, useTravel, type Member, type Trip } from '../../lib/trip-data'
import { MemberAvatar } from '../trip/MemberAvatar'

type Choice = 'driving' | 'riding' | 'other' | 'undecided'

export function formatTravelDates(from: string | null, to: string | null): string | null {
  if (from && to) return formatRange({ start: from, end: to })
  if (from) return `from ${formatRange({ start: from, end: from })}`
  if (to) return `until ${formatRange({ start: to, end: to })}`
  return null
}

export function TravelFull({ trip, members, me }: { trip: Trip; members: Member[]; me: Member }) {
  const entries = useTravel(trip.id)
  const claims = useSeatClaims(trip.id)
  const names = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members])
  const board = useMemo(() => buildBoard(members.map((m) => m.userId), entries, claims), [members, entries, claims])
  const mine = entries.find((e) => e.userId === me.userId)
  const myCar = board.groups.flatMap((g) => g.cars).find((c) => c.driverId === me.userId || c.riders.includes(me.userId)) ?? null
  const { success, error } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{ riderId: string } | null>(null)

  const run = async (key: string, name: string, params: Record<string, unknown>, done?: string) => {
    setBusy(key)
    const res = await callAction(name, { tripId: trip.id, ...params })
    setBusy(null)
    if (!res.success) {
      error('Couldn’t do that', res.error)
      return false
    }
    if (done) success(done)
    return true
  }

  // Pickup notes of the car you're in (driver or rider); refetched when its riders or notes change.
  const pickupKey = claims
    .filter((c) => c.driverUserId === myCar?.driverId)
    .map((c) => `${c.riderUserId}:${c.pickupVersion}`)
    .sort()
    .join(',')
  const pickups = useCarPickups(trip.id, myCar?.driverId ?? null, pickupKey)
  const name = (u: string) => names.get(u)?.displayName ?? 'Someone'
  const startLabel = (s: string | null) => s ?? trip.meetingPoint ?? 'the meeting point'

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4" data-testid="travel-full">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="meeting-point">
        <MapPin className="h-4 w-4" aria-hidden />
        {trip.meetingPoint ? (
          <>Meeting point: <span className="font-medium text-foreground">{trip.meetingPoint}</span></>
        ) : me.tripRole === 'organizer' ? (
          'No meeting point yet. Set one in My settings → Trip details.'
        ) : (
          'No meeting point set yet.'
        )}
      </p>

      <GasSettings trip={trip} isOrganizer={me.tripRole === 'organizer'} busy={busy} run={run} />

      <MyTravel
        trip={trip}
        me={me}
        mine={mine}
        myCar={myCar}
        driverName={myCar && myCar.driverId !== me.userId ? name(myCar.driverId) : null}
        busy={busy}
        run={run}
      />

      <section aria-label="Cars" className="space-y-3">
        <h2 className="text-sm font-medium">Cars</h2>
        {board.groups.length === 0 && <p className="text-sm text-muted-foreground">Nobody is driving yet.</p>}
        {board.groups.map((g) => (
          <div key={g.startPoint ?? '__default'} className="space-y-2" data-testid="car-group">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">From {startLabel(g.startPoint)}</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {g.cars.map((car) => (
                <CarCard
                  key={car.driverId}
                  car={car}
                  gasEach={gasPerPerson(trip.tripMiles, car.mpg, trip.gasPrice, 1 + car.riders.length)}
                  meId={me.userId}
                  names={names}
                  myMode={mine?.mode ?? 'undecided'}
                  inThisCar={myCar?.driverId === car.driverId}
                  pickups={myCar?.driverId === car.driverId ? pickups : null}
                  busy={busy}
                  onClaim={() => run(`claim-${car.driverId}`, 'claimSeat', { driverUserId: car.driverId }, `Seat in ${name(car.driverId)}’s car`)}
                  onRemoveRider={(riderId) => setRemoving({ riderId })}
                />
              ))}
            </ul>
          </div>
        ))}
      </section>

      {board.others.length > 0 && (
        <section aria-label="Getting there another way" className="space-y-2">
          <h2 className="text-sm font-medium">Getting there another way</h2>
          <ul className="space-y-2">
            {board.others.map((e) => (
              <OtherRow key={e.userId} entry={e} member={names.get(e.userId)} />
            ))}
          </ul>
        </section>
      )}

      {board.undecided.length > 0 && (
        <section aria-label="Not decided" className="space-y-2" data-testid="undecided">
          <h2 className="text-sm font-medium">Not decided</h2>
          <ul className="flex flex-wrap gap-2">
            {board.undecided.map((u) => {
              const m = names.get(u)
              return (
                <li key={u} className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-sm">
                  {m && <MemberAvatar userId={u} name={m.displayName} imageUrl={m.imageUrl} online size={20} />}
                  {name(u)}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          await run('remove-rider', 'releaseSeat', { riderUserId: removing.riderId }, 'Removed from your car')
          setRemoving(null)
        }}
        loading={busy === 'remove-rider'}
        title={`Take ${removing ? name(removing.riderId) : 'them'} out of your car?`}
        description="Their seat frees up, and they’re back to “not decided”."
        confirmText="Remove"
        variant="destructive"
      />
    </div>
  )
}

function MyTravel({
  trip, me, mine, myCar, driverName, busy, run,
}: {
  trip: Trip
  me: Member
  mine: TravelEntry | undefined
  myCar: Car | null
  driverName: string | null
  busy: string | null
  run: (key: string, name: string, params: Record<string, unknown>, done?: string) => Promise<boolean>
}) {
  const saved: Choice = mine?.mode ?? 'undecided'
  const [choice, setChoice] = useState<Choice>(saved)
  useEffect(() => setChoice(saved), [saved])
  const [seats, setSeats] = useState(String(mine?.seats ?? 3))
  const [mpg, setMpg] = useState(mine?.mpg?.toString() ?? '')
  const [startPoint, setStartPoint] = useState(mine?.startPoint ?? '')
  const [kind, setKind] = useState<OtherKind>(mine?.otherKind ?? 'flight')
  const [details, setDetails] = useState(mine?.details ?? '')
  const [fromDate, setFromDate] = useState(mine?.fromDate ?? trip.datesStart ?? '')
  const [toDate, setToDate] = useState(mine?.toDate ?? trip.datesEnd ?? '')
  const riding = saved === 'riding' && !!myCar && myCar.driverId !== me.userId

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (choice === 'driving') void run('travel', 'setMyTravel', { mode: 'driving', seats: Number(seats), startPoint, mpg }, 'Travel saved')
    else if (choice === 'other') void run('travel', 'setMyTravel', { mode: 'other', otherKind: kind, details, fromDate, toDate }, 'Travel saved')
    else if (choice === 'undecided') void run('travel', 'setMyTravel', { mode: 'undecided' }, 'Travel saved')
  }

  const options: Array<{ id: Choice; label: string }> = [
    { id: 'driving', label: 'Driving' },
    { id: 'riding', label: 'Riding' },
    { id: 'other', label: 'Another way' },
    { id: 'undecided', label: 'Not decided' },
  ]

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Your travel" data-testid="my-travel">
      <h2 className="text-sm font-medium">How are you getting there?</h2>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Travel mode">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={choice === o.id}
            onClick={() => setChoice(o.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              choice === o.id ? 'border-cf-accent-ink bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
            )}
            data-testid={`mode-${o.id}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {choice === 'riding' ? (
        riding ? (
          <RidingDetails tripId={trip.id} userId={me.userId} driverName={driverName ?? 'the driver'} busy={busy} run={run} />
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Tap a car below to take a seat.</p>
        )
      ) : (
        <form onSubmit={save} className="mt-3 space-y-3">
          {choice === 'driving' && (
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr_7rem]">
              <div className="space-y-1.5">
                <Label htmlFor="travel-seats">Passenger seats</Label>
                <Input
                  id="travel-seats"
                  inputMode="numeric"
                  value={seats}
                  onChange={(e) => setSeats(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                  data-testid="travel-seats"
                />
                <p className="text-[11px] text-muted-foreground">Not counting you (1–{MAX_SEATS})</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="travel-start">Leaving from</Label>
                <Input
                  id="travel-start"
                  maxLength={MAX_START_POINT}
                  placeholder={trip.meetingPoint ?? 'The meeting point'}
                  value={startPoint}
                  onChange={(e) => setStartPoint(e.target.value)}
                  data-testid="travel-start"
                />
                <p className="text-[11px] text-muted-foreground">Leave empty to leave from the meeting point.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="travel-mpg">Miles per gallon</Label>
                <Input
                  id="travel-mpg"
                  inputMode="numeric"
                  placeholder={String(DEFAULT_MPG)}
                  value={mpg}
                  onChange={(e) => setMpg(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                  data-testid="travel-mpg"
                />
                <p className="text-[11px] text-muted-foreground">For gas (default {DEFAULT_MPG})</p>
              </div>
            </div>
          )}
          {choice === 'other' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="travel-kind">How</Label>
                <select
                  id="travel-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as OtherKind)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  data-testid="travel-kind"
                >
                  {OTHER_KINDS.map((k) => (
                    <option key={k} value={k}>{OTHER_KIND_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="travel-from">From</Label>
                <Input id="travel-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} data-testid="travel-from" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="travel-to">To</Label>
                <Input id="travel-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} data-testid="travel-to" />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="travel-details">Details</Label>
                <Input
                  id="travel-details"
                  maxLength={MAX_DETAILS}
                  placeholder={kind === 'flight' ? 'Flight number, arrival time, airport' : kind === 'dropoff' ? 'Who’s dropping you off, and when' : 'Times, stations, anything useful'}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  data-testid="travel-details"
                />
              </div>
            </div>
          )}
          <Button type="submit" size="sm" loading={busy === 'travel'} disabled={!!busy} data-testid="save-travel">
            Save
          </Button>
          {saved === 'riding' && (
            <p className="text-xs text-muted-foreground">Saving gives up your seat.</p>
          )}
          {saved === 'driving' && choice !== 'driving' && (
            <p className="text-xs text-muted-foreground">Saving removes your car, and your riders go back to “not decided”.</p>
          )}
        </form>
      )}
    </section>
  )
}

function RidingDetails({
  tripId, userId, driverName, busy, run,
}: {
  tripId: string
  userId: string
  driverName: string
  busy: string | null
  run: (key: string, name: string, params: Record<string, unknown>, done?: string) => Promise<boolean>
}) {
  const savedNote = useMyPickupNote(tripId, userId)
  const [note, setNote] = useState(savedNote)
  useEffect(() => setNote(savedNote), [savedNote])
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm">
        You’re riding with <span className="font-medium">{driverName}</span>.
      </p>
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          void run('pickup', 'setPickupNote', { note }, 'Pickup note saved')
        }}
      >
        <Label htmlFor="pickup-note">Pickup note</Label>
        <div className="flex gap-2">
          <Input
            id="pickup-note"
            maxLength={MAX_PICKUP_NOTE}
            placeholder="Where to pick you up, e.g. an address"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="pickup-input"
          />
          <Button type="submit" size="sm" variant="outline" loading={busy === 'pickup'} disabled={!!busy || note === savedNote} data-testid="save-pickup">
            Save
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Only the people in this car see it.</p>
      </form>
      <Button size="sm" variant="ghost" onClick={() => void run('leave-seat', 'releaseSeat', {}, 'You left the car')} disabled={!!busy} data-testid="leave-seat">
        Leave this car
      </Button>
    </div>
  )
}

function CarCard({
  car, gasEach, meId, names, myMode, inThisCar, pickups, busy, onClaim, onRemoveRider,
}: {
  car: Car
  gasEach: number | null
  meId: string
  names: Map<string, Member>
  myMode: string
  inThisCar: boolean
  pickups: Map<string, string> | null
  busy: string | null
  onClaim: () => void
  onRemoveRider: (riderId: string) => void
}) {
  const driver = names.get(car.driverId)
  const isDriver = car.driverId === meId
  const left = Math.max(0, car.seats - car.riders.length)
  const canClaim = !inThisCar && !car.full && myMode !== 'driving'

  return (
    <li
      className={cn('rounded-xl border border-border bg-card p-3', inThisCar && 'border-cf-accent-ink ring-1 ring-primary/40')}
      data-testid="car"
      data-driver={driver?.displayName}
      data-full={car.full ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 font-medium">
          <CarIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{isDriver ? 'Your car' : `${driver?.displayName ?? 'Someone'}’s car`}</span>
        </p>
        {car.full ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium" data-testid="car-full">Full</span>
        ) : (
          <span className="text-xs text-muted-foreground" data-testid="seats-left">
            {left} of {car.seats} {car.seats === 1 ? 'seat' : 'seats'} left
          </span>
        )}
      </div>

      {/* The seats: riders' faces, then empty circles. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`${car.riders.length} of ${car.seats} seats taken`}>
        {driver && <MemberAvatar userId={car.driverId} name={`${driver.displayName} (driving)`} imageUrl={driver.imageUrl} online size={28} />}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {car.riders.map((r) => {
          const m = names.get(r)
          return m ? <MemberAvatar key={r} userId={r} name={m.displayName} imageUrl={m.imageUrl} online size={24} /> : null
        })}
        {Array.from({ length: left }, (_, i) => (
          <span key={i} className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/60" aria-hidden />
        ))}
      </div>

      {gasEach != null && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground" data-testid="car-gas">
          <Fuel className="h-3.5 w-3.5" aria-hidden />
          Gas ≈ ${gasEach} each ({1 + car.riders.length} {car.riders.length === 0 ? 'person' : 'people'}, round trip
          {car.mpg ? `, ${car.mpg} mpg` : `, ${DEFAULT_MPG} mpg assumed`})
        </p>
      )}

      {inThisCar && car.riders.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border pt-2 text-sm" data-testid="pickups">
          {car.riders.map((r) => (
            <li key={r} className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="font-medium">{names.get(r)?.displayName ?? 'Someone'}</span>
                <span className="block text-xs text-muted-foreground" data-testid="pickup-note">
                  {pickups?.get(r) ? `Pickup: ${pickups.get(r)}` : 'No pickup note'}
                </span>
              </span>
              {isDriver && (
                <Button size="sm" variant="ghost" onClick={() => onRemoveRider(r)} disabled={!!busy} aria-label={`Remove ${names.get(r)?.displayName ?? 'rider'}`} data-testid="remove-rider">
                  <UserMinus className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canClaim && (
        <Button size="sm" variant="outline" className="mt-3 w-full" onClick={onClaim} loading={busy === `claim-${car.driverId}`} disabled={!!busy} data-testid="claim-seat">
          {myMode === 'riding' ? 'Switch to this car' : 'Take a seat'}
        </Button>
      )}
    </li>
  )
}

function OtherRow({ entry, member }: { entry: TravelEntry; member: Member | undefined }) {
  const when = formatTravelDates(entry.fromDate, entry.toDate)
  return (
    <li className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm" data-testid="other-traveler">
      {member && <MemberAvatar userId={entry.userId} name={member.displayName} imageUrl={member.imageUrl} online size={28} />}
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium">{member?.displayName ?? 'Someone'}</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {entry.otherKind === 'flight' && <Plane className="h-3.5 w-3.5" aria-hidden />}
            {entry.otherKind ? OTHER_KIND_LABELS[entry.otherKind] : 'Another way'}
            {when && ` · ${when}`}
          </span>
        </p>
        {entry.details && <p className="text-xs text-muted-foreground">{entry.details}</p>}
      </div>
    </li>
  )
}


/** Stretch (gas): the trip's one-way miles and gas price. Everyone sees them; the organizer edits. */
function GasSettings({
  trip, isOrganizer, busy, run,
}: {
  trip: Trip
  isOrganizer: boolean
  busy: string | null
  run: (key: string, name: string, params: Record<string, unknown>, done?: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [miles, setMiles] = useState(trip.tripMiles?.toString() ?? '')
  const [price, setPrice] = useState(trip.gasPrice?.toFixed(2) ?? '')
  const priceText = `$${(trip.gasPrice ?? DEFAULT_GAS_PRICE).toFixed(2)}/gal${trip.gasPrice == null ? ' (default)' : ''}`

  return (
    <section className="rounded-xl border border-border bg-card p-3 text-sm" aria-label="Gas" data-testid="gas-settings">
      {!editing ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Fuel className="h-4 w-4 text-muted-foreground" aria-hidden />
          {trip.tripMiles != null ? (
            <span data-testid="gas-summary">
              <span className="font-medium">{trip.tripMiles} miles</span> each way · {priceText}
            </span>
          ) : (
            <span className="text-muted-foreground" data-testid="gas-summary">
              {isOrganizer ? 'Add the trip distance to estimate gas.' : 'Gas estimates appear once the organizer adds the distance.'}
            </span>
          )}
          {isOrganizer && (
            <button
              className="text-cf-accent-ink hover:underline"
              onClick={() => {
                setMiles(trip.tripMiles?.toString() ?? '')
                setPrice(trip.gasPrice?.toFixed(2) ?? '')
                setEditing(true)
              }}
              data-testid="edit-gas"
            >
              {trip.tripMiles != null ? 'Change' : 'Add distance'}
            </button>
          )}
        </p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run('gas', 'setTripGas', { miles, gasPrice: price }, 'Gas settings saved')) setEditing(false)
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="gas-miles">One-way miles</Label>
            <Input
              id="gas-miles"
              className="w-28"
              inputMode="numeric"
              value={miles}
              onChange={(e) => setMiles(e.target.value.replace(/[^\d]/g, '').slice(0, String(MAX_TRIP_MILES).length))}
              data-testid="gas-miles"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gas-price">Gas $/gallon</Label>
            <Input
              id="gas-price"
              className="w-28"
              inputMode="decimal"
              placeholder={DEFAULT_GAS_PRICE.toFixed(2)}
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))}
              data-testid="gas-price"
            />
          </div>
          <Button type="submit" size="sm" loading={busy === 'gas'} disabled={!!busy} data-testid="save-gas">Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <p className="w-full text-[11px] text-muted-foreground">
            Each person’s share: 2 × miles ÷ mpg × gas price ÷ people in the car (the driver counts).
          </p>
        </form>
      )}
    </section>
  )
}
