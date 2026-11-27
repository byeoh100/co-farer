/**
 * My trips (co-farer-redesign/SPEC.md, Homepage): the hero, "Next up" (the
 * soonest dated trip, else the newest), "Waiting on you" (things only you
 * can do, from data the app already has), and every trip as a card.
 *
 * Reads go across all your trips at once (one query per collection; the
 * 'team' and 'own' read rules decide what you get). No writes here except
 * the existing createTrip action.
 */

import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStatus, useQuery, useUser } from 'deepspace'
import { Tent } from 'lucide-react'
import { Input, Label, Modal, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction } from '../../../lib/actions-client'
import { formatRange, localToday } from '../../../lib/dates'
import { daysUntil, leadOption } from '../../../lib/overview'
import { initials, personColors } from '../../../lib/personColor'
import { useMyTrips, type Trip } from '../../../lib/trip-data'
import { PillButton } from '../../../components/trip/cards'

type Row<T> = { recordId: string; createdAt: string; data: T }
type MemberRow = { teamId: string; userId: string; status?: string; displayName?: string | null }
type Step = 'done' | 'current' | 'todo'

interface TripView {
  trip: Trip
  members: Array<{ userId: string; name: string; color: string }>
  photo: string | null
  stage: { label: string; tone: 'ink' | 'gold' | 'ok' | 'muted' }
  steps: Array<{ label: string; state: Step }>
  deadline: string | null
  past: boolean
  housingOpen: boolean
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Everything the homepage shows, from cross-trip queries. */
function useHome(myId: string) {
  const { trips, status } = useMyTrips()
  const today = localToday()
  const { records: memberRows } = useQuery<MemberRow>('team_members', {})
  const { records: boardRows } = useQuery<{ tripId: string; status?: string; deadline?: string | null; winningOptionId?: string | null }>('boards', { where: { module: 'housing' } })
  const { records: optionRows } = useQuery<{ tripId: string; module: string; imageUrl?: string | null }>('options', {})
  const { records: voteRows } = useQuery<{ tripId: string; optionId: string; userId: string }>('votes', {})
  const { records: travelRows } = useQuery<{ tripId: string; userId: string; mode?: string }>('travel', {})
  const { records: noteRows } = useQuery<{ tripId: string }>('notes', {})
  const { records: myRanges } = useQuery<{ tripId: string }>('availability', { where: { userId: myId } })
  const { records: rangeRows } = useQuery<{ tripId: string; userId: string }>('availability', {})
  const { records: myBudgets } = useQuery<Record<string, unknown>>('budgets', { where: { userId: myId } })

  return useMemo(() => {
    const by = <T extends { tripId?: string; teamId?: string }>(rows: Row<T>[]) => {
      const m = new Map<string, Row<T>[]>()
      for (const r of rows) {
        const k = (r.data.tripId ?? r.data.teamId) as string
        m.set(k, [...(m.get(k) ?? []), r])
      }
      return m
    }
    const members = by(memberRows)
    const boards = by(boardRows)
    const options = by(optionRows)
    const votes = by(voteRows)
    const travel = by(travelRows)
    const notes = by(noteRows)
    const ranges = by(rangeRows)
    const myRangeTrips = new Set(myRanges.map((r) => r.data.tripId))
    const budgeted = new Set(
      myBudgets.filter((b) => ['housing', 'gas', 'food', 'activities'].some((c) => typeof b.data[c] === 'number')).map((b) => String(b.data.tripId)),
    )

    const views: TripView[] = trips.map((trip) => {
      const all = (members.get(trip.id) ?? []).map((r) => ({
        userId: r.data.userId,
        joinedAt: r.createdAt,
        status: r.data.status === 'left' ? ('left' as const) : ('active' as const),
        name: r.data.displayName || 'Traveler',
      }))
      const colors = personColors(all)
      const active = all.filter((m) => m.status === 'active').sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      const board = boards.get(trip.id)?.[0]?.data
      const housing = (options.get(trip.id) ?? []).filter((o) => o.data.module === 'housing')
      const voteMap = new Map<string, string[]>()
      for (const v of votes.get(trip.id) ?? []) voteMap.set(v.data.optionId, [...(voteMap.get(v.data.optionId) ?? []), v.data.userId])
      const lead = leadOption(
        housing.map((o) => ({ id: o.recordId, createdAt: o.createdAt, imageUrl: o.data.imageUrl })),
        voteMap,
        board?.status === 'locked' ? board.winningOptionId ?? null : null,
      )
      const locked = trip.datesStatus === 'locked'
      const housingLocked = board?.status === 'locked'
      const extras = (options.get(trip.id) ?? []).some((o) => o.data.module !== 'housing')
      const decided = (travel.get(trip.id) ?? []).filter((t) => t.data.mode && t.data.mode !== 'undecided').length
      const past = !!trip.datesEnd && trip.datesEnd < today
      return {
        trip,
        members: active.map((m) => ({ userId: m.userId, name: m.name, color: colors.get(m.userId)! })),
        photo: lead?.imageUrl && lead.imageUrl.startsWith('https://') ? lead.imageUrl : null,
        stage: past
          ? { label: 'Past', tone: 'muted' }
          : !locked
            ? { label: 'Picking dates', tone: 'gold' }
            : housingLocked
              ? { label: 'Housing booked', tone: 'ok' }
              : { label: 'Voting on housing', tone: 'ink' },
        steps: [
          { label: 'Dates', state: locked ? 'done' : 'current' },
          { label: 'Housing', state: housingLocked ? 'done' : locked ? 'current' : 'todo' },
          { label: 'Travel', state: active.length > 0 && decided >= active.length ? 'done' : decided > 0 ? 'current' : 'todo' },
          { label: 'Activities', state: extras ? 'current' : 'todo' },
          { label: 'Notes', state: (notes.get(trip.id) ?? []).length > 0 ? 'current' : 'todo' },
        ],
        deadline: !locked ? 'Dates not picked yet' : !housingLocked && board?.deadline ? `Housing vote closes ${shortDate(board.deadline)}` : null,
        past,
        housingOpen: locked && !housingLocked && housing.length > 0,
      }
    })

    // Next up: the soonest dated trip still ahead, else the newest trip.
    const upcoming = views.filter((v) => !v.past)
    const dated = upcoming.filter((v) => v.trip.datesStart).sort((a, b) => a.trip.datesStart!.localeCompare(b.trip.datesStart!))
    const next = dated[0] ?? upcoming[0] ?? null

    // Waiting on you: only from data the app already has (no pending-invite data exists).
    const todos: Array<{ key: string; what: string; trip: string; cta: string; to: string; edge: string }> = []
    for (const v of upcoming) {
      const t = v.trip
      const voted = (votes.get(t.id) ?? []).some((r) => r.data.userId === myId && (options.get(t.id) ?? []).some((o) => o.recordId === r.data.optionId && o.data.module === 'housing'))
      if (v.housingOpen && !voted) todos.push({ key: `${t.id}-vote`, what: 'Vote on housing', trip: `${t.name}${v.deadline?.startsWith('Housing') ? ` · ${v.deadline.replace('Housing vote ', '')}` : ''}`, cta: 'Vote', to: `/trip/${t.id}?section=housing`, edge: 'var(--cf-accent)' })
      if (t.datesStatus !== 'locked' && !myRangeTrips.has(t.id)) {
        const have = new Set((ranges.get(t.id) ?? []).map((r) => r.data.userId)).size
        todos.push({ key: `${t.id}-dates`, what: 'Add your free days', trip: `${t.name} · ${have} of ${v.members.length} have`, cta: 'Add', to: `/trip/${t.id}`, edge: 'var(--cf-accent)' })
      }
      if (!budgeted.has(t.id)) todos.push({ key: `${t.id}-budget`, what: 'Set your budget', trip: t.name, cta: 'Set', to: `/trip/${t.id}/settings`, edge: 'var(--cf-warn)' })
    }

    return { views, next, todos: todos.slice(0, 5), status, today }
  }, [trips, status, today, memberRows, boardRows, optionRows, voteRows, travelRows, noteRows, myRanges, rangeRows, myBudgets, myId])
}

export default function MyTripsPage() {
  const { userId } = useAuthStatus()
  const { user } = useUser()
  const { views, next, todos, status, today } = useHome(userId ?? '')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming')
  const first = (user?.name ?? '').trim().split(/\s+/)[0]
  const active = views.filter((v) => !v.past).length
  const shown = views.filter((v) => (filter === 'past' ? v.past : !v.past))

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pb-10 pt-5 sm:px-8">
      <title>My trips · Co-farer</title>

      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-2.5 text-[13px] uppercase tracking-[1.5px] text-cf-muted">
            {first ? `Hi ${first} · ` : ''}
            {active} {active === 1 ? 'trip' : 'trips'} on the go
          </p>
          <h1 className="font-display text-[56px] leading-[0.9] tracking-[-1px] sm:text-[92px]">
            Where to <br />
            next<span className="text-cf-accent-ink">?</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <PillButton className="h-11 px-5" onClick={() => setJoining(true)}>
            Join with a code
          </PillButton>
          <PillButton variant="primary" className="h-11 px-[22px]" onClick={() => setCreating(true)} data-testid="new-trip">
            + Plan a trip
          </PillButton>
        </div>
      </section>

      {views.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-[7fr_5fr]">
          {next && <NextUp view={next} today={today} />}
          <WaitingOnYou todos={todos} />
        </section>
      )}

      <section className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[30px]">All trips</h2>
          <div className="flex gap-2" role="group" aria-label="Filter trips">
            {(['upcoming', 'past'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn('h-9 rounded-full px-3.5 text-[13px]', filter === f ? 'bg-cf-accent font-semibold text-white' : 'bg-cf-line text-cf-text')}
              >
                {f === 'upcoming' ? 'Upcoming' : 'Past'}
              </button>
            ))}
          </div>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6" data-testid="trip-list">
          {shown.map((v) => (
            <li key={v.trip.id}>
              <TripCard view={v} />
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-cf-border text-[15px] text-cf-muted hover:text-cf-text"
            >
              <span className="font-display text-[44px] text-cf-accent-ink">+</span>
              Start a new trip
            </button>
          </li>
        </ul>
        {status === 'ready' && views.length === 0 && (
          <p className="text-sm text-cf-muted" data-testid="no-trips">
            No trips yet. Plan one, or open an invite link a friend sent you.
          </p>
        )}
      </section>

      <CreateTripModal open={creating} onClose={() => setCreating(false)} />
      <JoinModal open={joining} onClose={() => setJoining(false)} />
    </div>
  )
}

function Photo({ src, className, icon = 32 }: { src: string | null; className: string; icon?: number }) {
  const [failed, setFailed] = useState(false)
  return src && !failed ? (
    <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn('object-cover', className)} />
  ) : (
    <span className={cn('flex items-center justify-center bg-cf-surface-2 text-cf-muted', className)}>
      <Tent style={{ width: icon, height: icon }} aria-hidden strokeWidth={1.75} />
    </span>
  )
}

function NextUp({ view, today }: { view: TripView; today: string }) {
  const t = view.trip
  const days = t.datesStart ? daysUntil(t.datesStart, today) : null
  return (
    <article className="relative min-h-[420px] overflow-hidden rounded-[20px]" data-testid="next-up">
      <Photo src={view.photo} className="absolute inset-0 h-full w-full items-start pt-24" icon={56} />
      {days != null && days >= 0 && (
        <span className="absolute left-4 top-4 rounded-full bg-cf-accent px-3 py-1 text-xs font-semibold text-white">
          Next up · {days === 0 ? 'today' : `in ${days} ${days === 1 ? 'day' : 'days'}`}
        </span>
      )}
      <div className="absolute inset-x-4 bottom-4 flex flex-col gap-3.5 rounded-2xl bg-[rgba(17,17,17,0.88)] p-[18px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display truncate text-[44px] leading-[0.95]">{t.name}</h2>
            <span className="tabular text-[13px] text-cf-text-2">
              {[t.datesStart && t.datesEnd ? formatRange({ start: t.datesStart, end: t.datesEnd }) : 'Dates not picked', t.destination].filter(Boolean).join(' · ')}
            </span>
          </div>
          <Faces members={view.members} size={32} max={6} />
        </div>
        <div
          className="grid grid-cols-5 gap-1.5"
          role="img"
          aria-label={view.steps.map((s) => `${s.label} ${s.state === 'done' ? 'done' : s.state === 'current' ? 'in progress' : 'not started'}`).join(', ')}
        >
          {view.steps.map((s) => (
            <div key={s.label} className="flex flex-col gap-1.5">
              <span className="h-1.5 rounded-[3px]" style={{ background: s.state === 'done' ? 'var(--cf-ok)' : s.state === 'current' ? 'var(--cf-accent)' : 'var(--cf-border)' }} />
              <span className={cn('truncate text-xs', s.state === 'done' ? 'text-cf-ok' : s.state === 'current' ? 'text-cf-text' : 'text-cf-muted')}>
                {s.label}
                {s.state === 'done' && ' ✓'}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-cf-text-2">{view.deadline ?? ''}</span>
          <Link to={`/trip/${t.id}`} className="inline-flex h-10 items-center rounded-full bg-cf-accent px-[18px] text-sm font-semibold text-white hover:bg-[#3456b8]">
            Open trip
          </Link>
        </div>
      </div>
    </article>
  )
}

function WaitingOnYou({ todos }: { todos: Array<{ key: string; what: string; trip: string; cta: string; to: string; edge: string }> }) {
  return (
    <article className="flex flex-col gap-3 rounded-[20px] bg-cf-surface p-5" data-testid="waiting-on-you">
      <div>
        <h2 className="font-display text-[30px]">Waiting on you</h2>
        <p className="mt-0.5 text-[13px] text-cf-muted">Things only you can do, across all trips</p>
      </div>
      {todos.length === 0 ? (
        <p className="rounded-[14px] bg-cf-surface-2 p-4 text-sm text-cf-muted">You’re all caught up</p>
      ) : (
        todos.map((t) => (
          <div key={t.key} className="flex items-center gap-3 rounded-[14px] bg-cf-surface-2 p-3">
            <span className="w-1 self-stretch rounded-sm" style={{ background: t.edge }} aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-semibold">{t.what}</span>
              <span className="truncate text-xs text-cf-muted">{t.trip}</span>
            </div>
            <Link to={t.to} className="inline-flex h-9 shrink-0 items-center rounded-full border border-cf-accent-ink px-3.5 text-[13px] text-cf-text hover:bg-cf-surface">
              {t.cta}
            </Link>
          </div>
        ))
      )}
    </article>
  )
}

function Faces({ members, size, max }: { members: TripView['members']; size: number; max: number }) {
  const shown = members.slice(0, max)
  return (
    <div className="flex" aria-label={members.map((m) => m.name).join(', ')} role="img">
      {shown.map((m, i) => (
        <span
          key={m.userId}
          title={m.name}
          className="flex items-center justify-center rounded-full border-2 border-cf-surface text-[11px] font-semibold text-[#111111]"
          style={{ width: size, height: size, background: m.color, marginLeft: i ? -9 : 0 }}
        >
          {size >= 30 ? initials(m.name) : ''}
        </span>
      ))}
    </div>
  )
}

const STAGE_COLOR = { ink: 'var(--cf-accent-ink)', gold: '#E9C46A', ok: 'var(--cf-ok)', muted: 'var(--cf-muted)' }

function TripCard({ view }: { view: TripView }) {
  const t = view.trip
  return (
    <Link
      to={`/trip/${t.id}`}
      data-testid="trip-card"
      className={cn('flex h-full flex-col overflow-hidden rounded-[20px] bg-cf-surface transition-colors hover:bg-cf-surface-2', view.past && 'opacity-60')}
    >
      <span className="relative block h-[150px]">
        <Photo src={view.photo} className="h-full w-full" />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-[rgba(17,17,17,0.85)] px-2.5 py-[3px] text-xs font-semibold" style={{ color: STAGE_COLOR[view.stage.tone] }}>
          {view.stage.label}
        </span>
      </span>
      <span className="flex flex-col gap-1.5 px-4 pb-4 pt-3.5">
        <span className="font-display truncate text-[26px]">{t.name}</span>
        <span className="tabular truncate text-[13px] text-cf-muted">
          {[t.datesStart && t.datesEnd ? formatRange({ start: t.datesStart, end: t.datesEnd }) : 'Dates not picked', t.destination].filter(Boolean).join(' · ')}
        </span>
        <span className="mt-1 flex items-center justify-between">
          <Faces members={view.members} size={26} max={4} />
          <span className="text-xs text-cf-muted">{view.members.length} going</span>
        </span>
      </span>
    </Link>
  )
}

function CreateTripModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { error } = useToast()
  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const res = await callAction<{ tripId: string }>('createTrip', { name, destination })
    setBusy(false)
    if (!res.success) return error('Could not create the trip', res.error)
    navigate(`/trip/${res.data.tripId}/settings?welcome=1`)
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" aria-label="Plan a trip">
      <form onSubmit={submit} className="flex flex-col gap-4 p-6" data-testid="create-trip-form">
        <h2 className="font-display text-[30px]">Plan a trip</h2>
        <div className="space-y-1.5">
          <Label htmlFor="trip-name">Trip name</Label>
          <Input id="trip-name" required maxLength={120} placeholder="Spring break" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trip-destination">Destination</Label>
          <Input id="trip-destination" required maxLength={200} placeholder="Cachuma Lake" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <PillButton type="submit" variant="primary" disabled={busy || !name.trim() || !destination.trim()} data-testid="create-trip">
            {busy ? 'Creating…' : 'Create trip'}
          </PillButton>
          <PillButton type="button" onClick={onClose}>
            Cancel
          </PillButton>
        </div>
      </form>
    </Modal>
  )
}

/** Joining by code uses the existing invite page (/join/<code>); a pasted link works too. */
function JoinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const code = (() => {
    const v = value.trim()
    const fromLink = /\/join\/([A-Za-z0-9_-]+)/.exec(v)?.[1]
    return fromLink ?? (/^[A-Za-z0-9_-]{4,64}$/.test(v) ? v : null)
  })()
  return (
    <Modal open={open} onClose={onClose} size="sm" aria-label="Join with a code">
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (code) navigate(`/join/${code}`)
        }}
      >
        <h2 className="font-display text-[30px]">Join with a code</h2>
        <div className="space-y-1.5">
          <Label htmlFor="join-code">Invite code or link</Label>
          <Input id="join-code" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…/join/abc123" autoFocus />
        </div>
        <div className="flex gap-2">
          <PillButton type="submit" variant="primary" disabled={!code}>
            Continue
          </PillButton>
          <PillButton type="button" onClick={onClose}>
            Cancel
          </PillButton>
        </div>
      </form>
    </Modal>
  )
}
