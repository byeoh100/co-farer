/**
 * The calendar inside the date bar's pop-up (Module 2).
 *  - Each day shows the circles of the people free that day ("+N" past 3).
 *    Locked dates are outlined.
 *  - Tap a start day, then an end day, to select a range; tap a day to see who's free.
 *  - "My dates" mode adds your availability; the organizer's "Final dates"
 *    mode picks and locks the trip dates. While locked, it's read-only.
 *  - Stretch: in "Final dates", the organizer can tick "Help me find the
 *    best window", enter a trip length, and the top stretches are marked;
 *    tapping one selects it, ready to lock.
 */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock, Trash2, Unlock } from 'lucide-react'
import { Button, Checkbox, Input, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction } from '../../lib/actions-client'
import {
  MAX_RANGE_DAYS, bestWindows, formatRange, freeByDay, localToday, monthGrid, monthLabel, rangeLength, shiftMonth, type DateRange,
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
  const [helper, setHelper] = useState(false)
  const [nightsInput, setNightsInput] = useState('2')

  const activeIds = useMemo(() => members.map((m) => m.userId), [members])
  const byDay = useMemo(() => freeByDay(ranges, activeIds), [ranges, activeIds])
  const names = useMemo(() => new Map(members.map((m) => [m.userId, m.displayName])), [members])
  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members])
  const responded = useMemo(() => new Set(ranges.map((r) => r.userId).filter((u) => names.has(u))), [ranges, names])
  const myRanges = ranges.filter((r) => r.userId === me.userId).sort((a, b) => a.start.localeCompare(b.start))
  const total = members.length

  // Best-window helper (organizer, final dates mode, unlocked).
  const nights = Number(nightsInput)
  const nightsValid = Number.isInteger(nights) && nights >= 1 && nights < MAX_RANGE_DAYS
  const showHelper = !locked && isOrganizer && mode === 'final'
  const windows = useMemo(
    () => (showHelper && helper && nightsValid ? bestWindows(byDay, nights, today) : []),
    [showHelper, helper, nightsValid, byDay, nights, today],
  )
  const bestRank = (d: string) => windows.findIndex((w) => d >= w.start && d <= w.end)

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
          const rank = bestRank(day)
          return (
            <button
              key={day}
              type="button"
              data-testid={`day-${day}`}
              data-free={free}
              data-best={rank >= 0 ? rank + 1 : undefined}
              onClick={() => tap(day)}
              aria-pressed={inSel(day)}
              aria-label={`${formatRange({ start: day, end: day })}: ${free} of ${total} free${free ? ` (${freeIds.map((m) => m.displayName).join(', ')})` : ''}${inLocked(day) ? ', locked trip date' : ''}`}
              className={cn(
                'relative flex h-14 flex-col items-center justify-start gap-1 rounded-md bg-muted/50 pt-1 text-xs transition-colors hover:bg-muted',
                past && 'text-muted-foreground/60 opacity-70',
                inLocked(day) && 'bg-accent ring-2 ring-primary ring-inset',
                rank === 0 && 'bg-primary/15 ring-2 ring-primary/70 ring-inset',
                rank > 0 && 'bg-primary/5 ring-1 ring-primary/40 ring-inset',
                inSel(day) && 'outline-2 outline-offset-[-2px] outline-foreground',
                focusDay === day && 'font-semibold',
              )}
            >
              <span>{Number(day.slice(8))}</span>
              {rank >= 0 && (
                <span className="absolute right-0.5 top-0.5 rounded-full bg-primary px-1 text-[8px] font-semibold leading-3 text-primary-foreground" aria-hidden>
                  {rank + 1}
                </span>
              )}
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

      {showHelper && (
        <div className="mt-3 rounded-lg border border-border p-3 text-sm" data-testid="best-window">
          <label className="flex items-center gap-2">
            <Checkbox checked={helper} onCheckedChange={(on) => setHelper(!!on)} data-testid="best-window-toggle" />
            Help me find the best window
          </label>
          {helper && (
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Trip length
                <Input
                  className="h-8 w-14 px-2 text-center"
                  inputMode="numeric"
                  value={nightsInput}
                  onChange={(e) => setNightsInput(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                  aria-label="Trip length in nights"
                  aria-invalid={!nightsValid}
                  data-testid="best-window-nights"
                />
                {nights === 1 ? 'night' : 'nights'} ({nightsValid ? nights + 1 : '?'} days)
              </label>
              {windows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {nightsValid ? 'No stretch that long has anyone free every day yet.' : `Enter 1 to ${MAX_RANGE_DAYS - 1} nights.`}
                </p>
              ) : (
                <ol className="space-y-1">
                  {windows.map((w, i) => (
                    <li key={w.start}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setSelection({ start: w.start, end: w.end })
                          setAnchor(null)
                          setMonth(w.start.slice(0, 7))
                        }}
                        data-testid="best-window-option"
                      >
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">{i + 1}</span>
                        <span className="font-medium">{formatRange(w)}</span>
                        <span className="text-xs text-muted-foreground">· {w.freeAll} of {total} free every day</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <p className="text-[11px] text-muted-foreground">Tap one to select it, then lock.</p>
            </div>
          )}
        </div>
      )}

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
