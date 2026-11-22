/**
 * Housing's expanded view: suggest, paste a link, vote live, set prices,
 * deadline and lock (organizer). Uses the shared engine actions.
 */

import { useState, type FormEvent } from 'react'
import { ExternalLink, Lock, RefreshCw, Sparkles, ThumbsUp, Trash2 } from 'lucide-react'
import { Button, ConfirmModal, Input, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction } from '../../lib/actions-client'
import { fitText } from '../../lib/fit-text'
import { RESEARCH_CALL_CAP, SUGGESTION_COUNT } from '../../lib/limits'
import { rankOptions, useBoard, useOptions, useVotes, type EngineOption, type Member, type Trip } from '../../lib/trip-data'
import { useSeenOptions } from '../../lib/seen-options'
import { MemberAvatar } from '../trip/MemberAvatar'

const MODULE = 'housing'

const MAX_DEADLINE_DAYS = 30

/** "in 3 days", "in 5 hours", "in 12 minutes": a count, not a timestamp. */
function timeLeft(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (ms >= 24 * 3600_000) return `in ${plural(Math.round(ms / (24 * 3600_000)), 'day')}`
  if (ms >= 3600_000) return `in ${plural(Math.round(ms / 3600_000), 'hour')}`
  return `in ${plural(Math.max(1, Math.round(ms / 60_000)), 'minute')}`
}

const exactTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function HousingFull({ trip, members, me }: { trip: Trip; members: Member[]; me: Member }) {
  const { board } = useBoard(trip.id, MODULE)
  const { options } = useOptions(trip.id, MODULE)
  const votes = useVotes(trip.id)
  const { success, error, info } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [deadlineDays, setDeadlineDays] = useState('3')
  const [tied, setTied] = useState<string[]>([])
  const [removing, setRemoving] = useState<EngineOption | null>(null)
  const { isNew, markSeen } = useSeenOptions(trip.id, me.userId)
  const days = Number(deadlineDays)
  const daysValid = Number.isInteger(days) && days >= 1 && days <= MAX_DEADLINE_DAYS

  const isOrganizer = me.tripRole === 'organizer'
  const locked = board?.status === 'locked'
  const deadlinePassed = !!board?.deadline && Date.parse(board.deadline) <= Date.now()
  const votingClosed = locked || deadlinePassed
  const capLeft = Math.max(0, RESEARCH_CALL_CAP - trip.researchCallsUsed)
  const ranked = rankOptions(options, votes)
  const names = new Map(members.map((m) => [m.userId, m]))

  const run = async (key: string, name: string, params: Record<string, unknown>, done?: string) => {
    setBusy(key)
    const res = await callAction<Record<string, unknown>>(name, { tripId: trip.id, module: MODULE, ...params })
    setBusy(null)
    if (!res.success) {
      if (res.code === 'tie') {
        const top = Math.max(...ranked.map((r) => r.voters.length))
        setTied(ranked.filter((r) => r.voters.length === top).map((r) => r.option.id))
        info('It’s a tie', 'Pick one of the tied options to lock.')
      } else error('Couldn’t do that', res.error)
      return null
    }
    if (done) success(done)
    return res.data
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const data = await run('add', 'addOption', { input })
    if (data) {
      setInput('')
      if (data.researched === false && typeof data.note === 'string') info('Added, but not researched', data.note)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4" data-testid="housing-full">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {locked ? (
          <span className="flex items-center gap-1 font-medium text-primary" data-testid="housing-status">
            <Lock className="h-4 w-4" aria-hidden /> Housing is locked
          </span>
        ) : board?.deadline ? (
          <span data-testid="housing-status">
            {deadlinePassed
              ? board.tieAtDeadline
                ? 'Voting closed at the deadline: it’s a tie, so the organizer picks.'
                : 'Voting closed at the deadline.'
              : <span title={exactTime(board.deadline)}>Voting closes {timeLeft(board.deadline)}</span>}
          </span>
        ) : (
          <span className="text-muted-foreground" data-testid="housing-status">Vote for every place you’d be happy with.</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground" data-testid="research-usage">
          AI research: {trip.researchCallsUsed} of {RESEARCH_CALL_CAP} used
        </span>
      </div>

      {!locked && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
          {capLeft === 0 && (
            <p className="text-sm text-destructive" data-testid="cap-message">
              This trip has used all {RESEARCH_CALL_CAP} AI research calls. You can still add places and prices by hand.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => run('suggest', 'suggestOptions', {}, 'Suggestions added')}
              loading={busy === 'suggest'}
              disabled={!!busy || capLeft === 0}
              data-testid="suggest"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {options.some((o) => o.source === 'ai') ? 'Search for more' : `Suggest ${SUGGESTION_COUNT.housing} places`}
            </Button>
            <form onSubmit={add} className="flex min-w-[240px] flex-1 gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste a link or type a place’s name"
                aria-label="Paste a link or type a place’s name"
                maxLength={1000}
                data-testid="add-option-input"
              />
              <Button type="submit" variant="outline" loading={busy === 'add'} disabled={!!busy || !input.trim()} data-testid="add-option">
                Add
              </Button>
            </form>
          </div>
          {(busy === 'suggest' || busy === 'add') && (
            <p className="text-xs text-muted-foreground">Researching. This can take up to a minute.</p>
          )}
        </div>
      )}

      {isOrganizer && !locked && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm" data-testid="organizer-controls">
          <span className="font-medium">Organizer</span>
          <label className="flex items-center gap-1.5">
            Decide within
            <Input
              className="h-8 w-14 px-2 text-center"
              inputMode="numeric"
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
              aria-label="Days to decide"
              aria-invalid={!daysValid}
              data-testid="deadline-days"
            />
            {days === 1 ? 'day' : 'days'}
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={!daysValid || !!busy}
            onClick={() => run('deadline', 'setDeadline', { days }, 'Deadline set')}
            data-testid="set-deadline"
          >
            {board?.deadline ? 'Change deadline' : 'Set deadline'}
          </Button>
          {board?.deadline && (
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run('clear', 'clearDeadline', {}, 'Deadline removed')}>
              Remove deadline
            </Button>
          )}
          <Button
            size="sm"
            className="ml-auto"
            disabled={!!busy || options.length === 0}
            loading={busy === 'lock'}
            onClick={() => run('lock', 'lockBoard', {}, 'Housing locked')}
            data-testid="lock-top"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden /> Lock the top option
          </Button>
        </div>
      )}

      {ranked.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No places yet. Get suggestions, or paste a link.</p>
      ) : (
        <ul className="space-y-3" data-testid="option-list">
          {ranked.map(({ option, voters }) => (
            <OptionCard
              key={option.id}
              option={option}
              voters={voters}
              names={names}
              meId={me.userId}
              groupSize={members.length}
              isNew={isNew(option.id)}
              onSeen={() => markSeen(option.id)}
              canRemove={!locked && (isOrganizer || option.addedBy === me.userId)}
              onRemove={() => setRemoving(option)}
              winner={locked && board?.winningOptionId === option.id}
              faded={locked && board?.winningOptionId !== option.id}
              tied={tied.includes(option.id) || (!!board?.tieAtDeadline && voters.length > 0 && voters.length === ranked[0].voters.length)}
              votingClosed={votingClosed}
              canLock={isOrganizer && !locked}
              busy={busy}
              onVote={() => run(`vote-${option.id}`, 'toggleVote', { optionId: option.id })}
              onLock={() => run(`lock-${option.id}`, 'lockBoard', { optionId: option.id }, 'Housing locked')}
              onResearch={() => run(`research-${option.id}`, 'researchOption', { optionId: option.id }, 'Researched')}
              onPrice={(total) => run(`price-${option.id}`, 'setOptionPrice', { optionId: option.id, totalPrice: total }, 'Price saved')}
            />
          ))}
        </ul>
      )}
      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const o = removing
          if (!o) return
          await run(`remove-${o.id}`, 'removeOption', { optionId: o.id }, 'Removed')
          setRemoving(null)
        }}
        loading={!!removing && busy === `remove-${removing.id}`}
        title={`Remove ${removing?.title ?? 'this place'}?`}
        description="It’s removed for everyone, along with its votes."
        confirmText="Remove"
        variant="destructive"
      />
    </div>
  )
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function OptionCard({
  option, voters, names, meId, groupSize, isNew, onSeen, canRemove, onRemove,
  winner, faded, tied, votingClosed, canLock, busy, onVote, onLock, onResearch, onPrice,
}: {
  option: EngineOption
  voters: string[]
  names: Map<string, Member>
  meId: string
  groupSize: number
  isNew: boolean
  onSeen: () => void
  canRemove: boolean
  onRemove: () => void
  winner: boolean
  faded: boolean
  tied: boolean
  votingClosed: boolean
  canLock: boolean
  busy: string | null
  onVote: () => void
  onLock: () => void
  onResearch: () => void
  onPrice: (price: number | null) => void
}) {
  const [editingPrice, setEditingPrice] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [imageFailed, setImageFailed] = useState(false)
  const mine = voters.includes(meId)
  const people = `${groupSize} ${groupSize === 1 ? 'person' : 'people'}`
  const fit = fitText(option.fit)
  const r = option.research

  return (
    <li
      className={cn(
        'rounded-xl border border-border bg-card p-4 transition-shadow duration-300',
        isNew && 'border-primary ring-2 ring-primary/50',
        winner && 'border-primary ring-2 ring-primary/30',
        faded && 'opacity-60',
        tied && 'border-warning',
      )}
      // Pointing at (or tapping, or tabbing into) a card marks it as seen.
      onPointerEnter={isNew ? onSeen : undefined}
      onFocusCapture={isNew ? onSeen : undefined}
      data-testid="option-card"
      data-option-id={option.id}
      data-option-title={option.title}
      data-new={isNew ? 'true' : undefined}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      {option.imageUrl && !imageFailed && (
        <img
          src={option.imageUrl}
          alt={`Photo of ${option.title}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="h-40 w-full shrink-0 rounded-lg bg-muted object-cover sm:h-24 sm:w-32"
          data-testid="option-image"
        />
      )}
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {option.url ? (
              <a href={option.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                {option.title}
              </a>
            ) : (
              option.title
            )}
            {isNew && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary" data-testid="new-badge">New</span>}
            {winner && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">Chosen</span>}
            {tied && <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[11px]">Tied</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {option.source === 'ai' ? 'Suggested by AI' : `Added by ${names.get(option.addedBy ?? '')?.displayName ?? 'a member'}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {option.price != null && option.total != null ? (
            <>
              <p className="font-medium" data-testid="option-price">
                ${option.price.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">/ person</span>
              </p>
              <p className="text-xs text-muted-foreground" data-testid="option-total">
                ${option.total.toLocaleString()} total · {people}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="option-price">Price not found</p>
          )}
          {option.price != null && (
            <p className="text-[11px] text-muted-foreground">{option.priceSource === 'member' ? 'added by a member' : 'researched'}</p>
          )}
          {!faded && !winner && !editingPrice && (
            <button className="text-[11px] text-primary hover:underline" onClick={() => { setPriceInput(option.total?.toString() ?? ''); setEditingPrice(true) }} data-testid="edit-price">
              {option.price == null ? 'Add price' : 'Change price'}
            </button>
          )}
        </div>
      </div>
      </div>

      {editingPrice && (
        <form
          className="mt-2 flex flex-wrap items-center justify-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onPrice(priceInput === '' ? null : Number(priceInput))
            setEditingPrice(false)
          }}
        >
          <span className="text-sm text-muted-foreground">Total for the whole stay $</span>
          <Input
            className="w-24"
            inputMode="numeric"
            autoFocus
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value.replace(/[^\d]/g, ''))}
            aria-label={`Total price for the whole stay at ${option.title}`}
            data-testid="price-input"
          />
          {priceInput !== '' && Number(priceInput) > 0 && (
            <span className="text-xs text-muted-foreground">
              ≈ ${Math.max(1, Math.round(Number(priceInput) / Math.max(1, groupSize))).toLocaleString()} / person
            </span>
          )}
          <Button size="sm" type="submit" data-testid="save-price">Save</Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setEditingPrice(false)}>Cancel</Button>
        </form>
      )}

      {option.researchStatus === 'pending' && <p className="mt-2 text-sm text-muted-foreground">Researching…</p>}
      {option.researchStatus === 'failed' && <p className="mt-2 text-sm text-muted-foreground">Couldn’t research this yet.</p>}
      {r && (
        <div className="mt-2 space-y-2 text-sm">
          {r.summary && <p>{r.summary}</p>}
          {(r.pros.length > 0 || r.cons.length > 0) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {r.pros.length > 0 && (
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {r.pros.map((p, i) => (
                    <li key={i}><span className="text-foreground">+</span> {p}</li>
                  ))}
                </ul>
              )}
              {r.cons.length > 0 && (
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {r.cons.map((c, i) => (
                    <li key={i}><span className="text-foreground">−</span> {c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {r.sources.length > 0 && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs" data-testid="option-sources">
              <span className="text-muted-foreground">Sources:</span>
              {r.sources.map((s) => (
                <a key={s} href={s} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                  {hostname(s)} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ))}
            </p>
          )}
        </div>
      )}
      {fit && (
        <p className={cn('mt-2 text-xs', fit.tone === 'over' ? 'text-destructive' : 'text-muted-foreground')} data-testid="option-fit">
          {fit.text}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          size="sm"
          variant={mine ? 'default' : 'outline'}
          aria-pressed={mine}
          disabled={votingClosed || !!busy}
          onClick={onVote}
          data-testid="vote"
        >
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> {mine ? 'Voted' : 'Vote'}
        </Button>
        <span className="text-sm" data-testid="vote-count">{voters.length} {voters.length === 1 ? 'vote' : 'votes'}</span>
        <span className="flex -space-x-1.5">
          {voters.slice(0, 6).map((u) => {
            const m = names.get(u)
            return m ? <MemberAvatar key={u} userId={u} name={m.displayName} imageUrl={m.imageUrl} online size={20} /> : null
          })}
        </span>
        <span className="ml-auto flex gap-2">
          {option.researchStatus === 'failed' && !faded && (
            <Button size="sm" variant="ghost" onClick={onResearch} loading={busy === `research-${option.id}`} disabled={!!busy} data-testid="research">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Research again
            </Button>
          )}
          {canLock && (
            <Button size="sm" variant="ghost" onClick={onLock} disabled={!!busy} data-testid="lock-option">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Lock this one
            </Button>
          )}
          {canRemove && (
            <Button size="sm" variant="ghost" onClick={onRemove} disabled={!!busy} aria-label={`Remove ${option.title}`} data-testid="remove-option">
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
            </Button>
          )}
        </span>
      </div>
    </li>
  )
}
