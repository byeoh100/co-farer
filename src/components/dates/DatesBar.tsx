/**
 * The dates card on the trip overview (co-farer-redesign/SPEC.md, DatesCard).
 * Header: the locked range and a "Locked" pill (or "Picking dates"), and
 * "Open calendar", which opens the existing calendar pop-up (animated,
 * closes on an outside click or Escape, doesn't gray out the page).
 * Body: one column per day, bar height = the share of members free that day.
 */

import { useMemo, useState } from 'react'
import { ConfirmModal, Popover, PopoverContent, PopoverTrigger, useToast } from '@/components/ui'
import { callAction } from '../../lib/actions-client'
import { formatRange, freeByDay, freeForWholeSpan, localToday, overviewWindow, weekdayLetter, weekdayName } from '../../lib/dates'
import { useAvailability, useOptions, type Member, type Trip } from '../../lib/trip-data'
import { Pill } from '../trip/cards'
import { DatesCalendar } from './DatesCalendar'

export function DatesBar({ trip, members, me }: { trip: Trip; members: Member[]; me: Member }) {
  const { ranges } = useAvailability(trip.id)
  // The housing warning appears only when there's housing research to lose.
  const { options: housingOptions } = useOptions(trip.id, 'housing')
  const { success, error } = useToast()
  const [open, setOpen] = useState(false)
  const [confirmUnlock, setConfirmUnlock] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const lockedRange = trip.datesStatus === 'locked' && trip.datesStart && trip.datesEnd ? { start: trip.datesStart, end: trip.datesEnd } : null
  const memberIds = members.map((m) => m.userId)
  const n = members.length

  const byDay = useMemo(() => freeByDay(ranges, memberIds), [ranges, memberIds.join(',')])
  const days = useMemo(() => overviewWindow(lockedRange, ranges, localToday()), [lockedRange?.start, lockedRange?.end, ranges])
  const freeAll = lockedRange ? freeForWholeSpan(byDay, lockedRange).size : 0
  const isLocked = (d: string) => !!lockedRange && d >= lockedRange.start && d <= lockedRange.end

  const unlock = async () => {
    setUnlocking(true)
    const res = await callAction('unlockDates', { tripId: trip.id })
    setUnlocking(false)
    setConfirmUnlock(false)
    if (res.success) success('Dates unlocked')
    else error('Couldn’t unlock the dates', res.error)
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-[20px] bg-cf-surface px-[22px] py-5 lg:flex-[1.5_1_0%]" aria-label="Dates">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3" data-testid="dates-summary">
          {lockedRange ? (
            <>
              <h2 className="font-display tabular text-[28px]">{formatRange(lockedRange)}</h2>
              <Pill tone="ok">Locked</Pill>
            </>
          ) : (
            <>
              <h2 className="font-display text-[28px]">Dates</h2>
              <span className="text-sm text-cf-muted">Picking dates</span>
            </>
          )}
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            data-testid="dates-bar"
            className="inline-flex h-9 items-center rounded-full border border-cf-border px-3.5 text-[13px] text-cf-text transition-colors hover:bg-cf-surface-2"
          >
            Open calendar
          </PopoverTrigger>
          <PopoverContent
            align="end"
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
      </div>

      {/* Below 640px the 14 days scroll sideways, each at least 32px wide. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div
          className="grid min-w-[548px] grid-cols-[repeat(14,minmax(32px,1fr))] items-end gap-1.5 sm:min-w-0"
          role="list"
          aria-label={`People free per day, ${formatRange({ start: days[0], end: days[days.length - 1] })}`}
        >
          {days.map((d) => {
            const free = byDay.get(d)?.size ?? 0
            const share = n ? Math.round((free / n) * 100) : 0
            const locked = isLocked(d)
            return (
              <div key={d} role="listitem" className="flex flex-col items-center gap-1.5" data-testid="day-column">
                <div
                  className="flex h-[84px] w-full items-end overflow-hidden rounded-lg bg-cf-surface-2"
                  role="img"
                  aria-label={`${weekdayName(d)} ${formatRange({ start: d, end: d })}: ${free} of ${n} free${locked ? ', locked' : ''}`}
                >
                  <div className="w-full rounded-lg" style={{ height: `${share}%`, background: locked ? 'var(--cf-accent)' : 'var(--cf-neutral-bar)' }} />
                </div>
                <span className="text-[11px] text-cf-muted" aria-hidden>{weekdayLetter(d)}</span>
                <span className={locked ? 'tabular text-sm font-semibold text-cf-accent-ink' : 'tabular text-sm font-semibold'} aria-hidden>
                  {Number(d.slice(8))}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-[13px] text-cf-muted" data-testid="dates-free">
        {lockedRange
          ? `${freeAll === n ? `All ${n}` : `${freeAll} of ${n}`} free on the locked dates · bar height = people free that day`
          : 'Bar height = people free that day'}
      </p>

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
    </section>
  )
}
