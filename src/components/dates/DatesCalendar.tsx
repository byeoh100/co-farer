/**
 * The calendar inside the date bar's pop-up (Module 2).
 *  - Each day shows the circles of the people free that day ("+N" past 3).
 *    Locked dates are outlined.
 *  - Tap a start day, then an end day, to select a range; tap a day to see who's free.
 *  - "My dates" mode adds your availability; the organizer's "Final dates"
 *    mode picks and locks the trip dates. While locked, it's read-only.
 */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock, Trash2, Unlock } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction } from '../../lib/actions-client'
import {
  MAX_RANGE_DAYS, formatRange, freeByDay, localToday, monthGrid, monthLabel, rangeLength, shiftMonth, type DateRange,
} from '../../lib/dates'
import type { AvailabilityRange, Member, Trip } from '../../lib/trip-data'
import { MemberAvatar } from '../trip/MemberAvatar'

type Mode = 'mine' | 'final'
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
/** Fits a phone-width day cell; more show as "+N". */
const MAX_DAY_AVATARS = 3

export function DatesCalendar({
  trip,
  members,
  me,
  ranges,
  onRequestUnlock,
}: {
  trip: Trip
  members: Member[]
  me: Member
  ranges: AvailabilityRange[]
  /** The confirm dialog lives outside the pop-up (DatesBar), or clicking it would close the pop-up. */
  onRequestUnlock: () => void
}) {
  const { success, error } = useToast()
  const today = localToday()
  const locked = trip.datesStatus === 'locked' && trip.datesStart && trip.datesEnd
  const isOrganizer = me.tripRole === 'organizer'

  const [month, setMonth] = useState((locked ? trip.datesStart! : today).slice(0, 7))
  const [mode, setMode] = useState<Mode>('mine')
  const [anchor, setAnchor] = useState<string | null>(null)
  const [selection, setSelection] = useState<DateRange | null>(null)
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const activeIds = useMemo(() => members.map((m) => m.userId), [members])
  const byDay = useMemo(() => freeByDay(ranges, activeIds), [ranges, activeIds])
  const names = useMemo(() => new Map(members.map((m) => [m.userId, m.displayName])), [members])
  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members])
  const responded = useMemo(() => new Set(ranges.map((r) => r.userId).filter((u) => names.has(u))), [ranges, names])
  const myRanges = ranges.filter((r) => r.userId === me.userId).sort((a, b) => a.start.localeCompare(b.start))
  const total = members.length

  const tap = (day: string) => {
    setFocusDay(day)
    if (locked) return
    if (mode === 'mine' && day < today) return
    if (!anchor) {
      setAnchor(day)
      setSelection({ start: day, end: day })
    } else {
      const r = day < anchor ? { start: day, end: anchor } : { start: anchor, end: day }
      setSelection(r)
      setAnchor(null)
    }
  }
  const clearSelection = () => {
    setAnchor(null)
    setSelection(null)
  }

  const tooLong = selection ? rangeLength(selection) > MAX_RANGE_DAYS : false

  const run = async (name: string, params: Record<string, unknown>, done: string) => {
    setBusy(true)
    const res = await callAction(name, { tripId: trip.id, ...params })
    setBusy(false)
    if (!res.success) {
      error('Couldn’t do that', res.error)
      return false
    }
    success(done)
    return true
  }

  const addMine = async () => {
    if (selection && (await run('addAvailability', { ...selection }, 'Dates added'))) clearSelection()
  }
  const lock = async () => {
    if (selection && (await run('lockDates', { ...selection }, 'Dates locked'))) clearSelection()
  }

  const inSel = (d: string) => !!selection && d >= selection.start && d <= selection.end
  const inLocked = (d: string) => !!locked && d >= trip.datesStart! && d <= trip.datesEnd!
  const focusFree = focusDay ? [...(byDay.get(focusDay) ?? [])] : []

  return (
    <div className="w-full p-4" data-testid="dates-calendar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {locked ? (
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Lock className="h-4 w-4" aria-hidden /> Locked: {formatRange({ start: trip.datesStart!, end: trip.datesEnd! })}
          </p>
        ) : isOrganizer ? (
          <div className="flex rounded-lg bg-muted p-0.5 text-xs" role="tablist" aria-label="What to pick">
            {(['mine', 'final'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                data-testid={`mode-${m}`}
                onClick={() => {
                  setMode(m)
                  clearSelection()
                }}
                className={cn('rounded-md px-2.5 py-1', mode === m ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}
              >
                {m === 'mine' ? 'My dates' : 'Final dates'}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm font-medium">When are you free?</p>
        )}
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-32 text-center text-sm font-medium" data-testid="calendar-month">
            {monthLabel(month)}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground" aria-hidden>
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label={`${monthLabel(month)} availability`}>
        {monthGrid(month).flat().map((day, i) => {
          if (!day) return <span key={`pad-${i}`} />
          const freeIds = [...(byDay.get(day) ?? [])]
            .map((u) => memberById.get(u))
            .filter((m): m is Member => !!m)
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
          const free = freeIds.length
          const shown = freeIds.slice(0, MAX_DAY_AVATARS)
          const extra = free - shown.length
          const past = day < today
          return (
            <button
              key={day}
              type="button"
              data-testid={`day-${day}`}
              data-free={free}
              onClick={() => tap(day)}
              aria-pressed={inSel(day)}
              aria-label={`${formatRange({ start: day, end: day })}: ${free} of ${total} free${free ? ` (${freeIds.map((m) => m.displayName).join(', ')})` : ''}${inLocked(day) ? ', locked trip date' : ''}`}
              className={cn(
                'relative flex h-14 flex-col items-center justify-start gap-1 rounded-md bg-muted/50 pt-1 text-xs transition-colors hover:bg-muted',
                past && 'text-muted-foreground/60 opacity-70',
                inLocked(day) && 'bg-accent ring-2 ring-primary ring-inset',
                inSel(day) && 'outline-2 outline-offset-[-2px] outline-foreground',
                focusDay === day && 'font-semibold',
              )}
            >
              <span>{Number(day.slice(8))}</span>
              {free > 0 && (
                <span className="flex items-center -space-x-1.5" aria-hidden>
                  {shown.map((m) => (
                    <MemberAvatar
                      key={m.userId}
                      userId={m.userId}
                      name={m.displayName}
                      imageUrl={m.imageUrl}
                      online
                      size={16}
                      className="ring-1"
                    />
                  ))}
                  {extra > 0 && (
                    <span className="relative z-10 rounded-full bg-card px-1 text-[9px] font-medium leading-4 text-muted-foreground ring-1 ring-card">
                      +{extra}
                    </span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Circles show who’s free each day{locked ? '. Outlined = locked dates.' : '. Tap a start day, then an end day.'}
      </p>

      {focusDay && (
        <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs" data-testid="day-detail">
          <p className="font-medium">
            {formatRange({ start: focusDay, end: focusDay })}: {focusFree.length} of {total} free
          </p>
          {focusFree.length > 0 && <p className="mt-0.5 text-muted-foreground">{focusFree.map((u) => names.get(u)).join(', ')}</p>}
          {total - responded.size > 0 && (
            <p className="mt-0.5 text-muted-foreground">{total - responded.size} haven’t added dates yet</p>
          )}
        </div>
      )}

      {!locked && selection && (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="selection-bar">
          <span className="text-sm">
            {formatRange(selection)}
            {anchor && <span className="text-muted-foreground"> · tap an end day</span>}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Clear
            </Button>
            {mode === 'mine' ? (
              <Button size="sm" onClick={addMine} loading={busy} disabled={tooLong} data-testid="add-range">
                Add my dates
              </Button>
            ) : (
              <Button size="sm" onClick={lock} loading={busy} disabled={tooLong} data-testid="lock-dates">
                <Lock className="h-3.5 w-3.5" aria-hidden /> Lock these dates
              </Button>
            )}
          </div>
          {tooLong && <p className="w-full text-xs text-destructive">A range can be at most {MAX_RANGE_DAYS} days.</p>}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground">Your dates</p>
        {myRanges.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">None yet.</p>
        ) : (
          <ul className="mt-1 space-y-1" data-testid="my-ranges">
            {myRanges.map((r) => (
              <li key={r.recordId} className="flex items-center justify-between text-sm">
                <span>{formatRange(r)}</span>
                {!locked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${formatRange(r)}`}
                    onClick={() => run('removeAvailability', { rangeId: r.recordId }, 'Dates removed')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {locked && <p className="mt-1 text-xs text-muted-foreground">Availability can’t change while the dates are locked.</p>}
      </div>

      {locked && isOrganizer && (
        <Button size="sm" variant="outline" className="mt-3" onClick={onRequestUnlock} data-testid="unlock-dates">
          <Unlock className="h-3.5 w-3.5" aria-hidden /> Unlock dates
        </Button>
      )}
    </div>
  )
}
