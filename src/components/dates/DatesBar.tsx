/**
 * The date bar at the top of the trip page (docs/LAYOUT.md). Summary in the
 * bar; the calendar opens as a pop-up under it: animated, closes on an
 * outside click or Escape, and doesn't gray out the page.
 */

import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Lock } from 'lucide-react'
import { ConfirmModal, Popover, PopoverContent, PopoverTrigger, useToast } from '@/components/ui'
import { callAction } from '../../lib/actions-client'
import { formatRange, freeByDay, freeForWholeSpan } from '../../lib/dates'
import { useAvailability, useOptions, type Member, type Trip } from '../../lib/trip-data'
import { DatesCalendar } from './DatesCalendar'

export function DatesBar({ trip, members, me }: { trip: Trip; members: Member[]; me: Member }) {
  const { ranges } = useAvailability(trip.id)
  // The housing warning appears only when there's housing research to lose.
  const { options: housingOptions } = useOptions(trip.id, 'housing')
  const { success, error } = useToast()
  const [open, setOpen] = useState(false)
  const [confirmUnlock, setConfirmUnlock] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const locked = trip.datesStatus === 'locked' && trip.datesStart && trip.datesEnd

  const freeAll = useMemo(() => {
    if (!locked) return 0
    const byDay = freeByDay(ranges, members.map((m) => m.userId))
    return freeForWholeSpan(byDay, { start: trip.datesStart!, end: trip.datesEnd! }).size
  }, [locked, ranges, members, trip.datesStart, trip.datesEnd])

  const unlock = async () => {
    setUnlocking(true)
    const res = await callAction('unlockDates', { tripId: trip.id })
    setUnlocking(false)
    setConfirmUnlock(false)
    if (res.success) success('Dates unlocked')
    else error('Couldn’t unlock the dates', res.error)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          data-testid="dates-bar"
          className="group flex w-full items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-left text-sm outline-none transition-colors hover:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
          {locked ? (
            <span data-testid="dates-summary">
              <span className="font-medium">{formatRange({ start: trip.datesStart!, end: trip.datesEnd! })}</span>
              <span className="text-muted-foreground">
                {' '}
                · <Lock className="mb-0.5 inline h-3 w-3" aria-hidden /> Locked · {freeAll} of {members.length} free
              </span>
            </span>
          ) : (
            <span data-testid="dates-summary">
              <span className="font-medium">Dates</span>
              <span className="text-muted-foreground"> · Not locked yet</span>
            </span>
          )}
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[popup-open]:rotate-180" aria-hidden />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(560px,calc(100vw-32px))] duration-200 motion-reduce:animate-none"
          aria-label="Trip dates calendar"
        >
          <DatesCalendar
            trip={trip}
            members={members}
            me={me}
            ranges={ranges}
            onRequestUnlock={() => {
              setOpen(false)
              setConfirmUnlock(true)
            }}
          />
        </PopoverContent>
      </Popover>
      <ConfirmModal
        open={confirmUnlock}
        onClose={() => setConfirmUnlock(false)}
        onConfirm={unlock}
        loading={unlocking}
        title="Unlock the dates?"
        description={
          housingOptions.length > 0
            ? 'Housing will have to be researched again: all its places and votes are removed, and housing waits for the new dates. Everyone’s availability is kept.'
            : 'Everyone’s availability is kept, and people can change it again.'
        }
        confirmText="Unlock dates"
      />
    </>
  )
}
