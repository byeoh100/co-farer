/**
 * One ranked list of the Additional section (spec §6 Activities, §7 Food):
 * suggest 10, search for more, paste a link or name, vote, remove. Ranked by
 * votes, never locked, no deadline. Prices are per person and for reference
 * only (never checked against a budget). Food places that might not suit
 * someone stay on the list with a warning triangle.
 */

import { useState, type FormEvent } from 'react'
import { AlertTriangle, ExternalLink, RefreshCw, Sparkles, ThumbsUp, Trash2 } from 'lucide-react'
import { Button, ConfirmModal, Input, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction } from '../../lib/actions-client'
import { foodWarning, type FoodWarning } from '../../lib/food'
import { RESEARCH_CALL_CAP, SUGGESTION_COUNT } from '../../lib/limits'
import { useSeenOptions } from '../../lib/seen-options'
import { rankOptions, useFoodPrefs, useOptions, useVotes, type EngineOption, type Member, type Trip } from '../../lib/trip-data'
import { MemberAvatar } from '../trip/MemberAvatar'

type ListModule = 'activities' | 'food'

const COPY: Record<ListModule, { noun: string; plural: string; placeholder: string; empty: string }> = {
  activities: { noun: 'activity', plural: 'activities', placeholder: 'Paste a link or type an activity', empty: 'No activities yet. Get suggestions, or paste a link.' },
  food: { noun: 'place to eat', plural: 'places to eat', placeholder: 'Paste a link or type a restaurant', empty: 'No places to eat yet. Get suggestions, or paste a link.' },
}

export function priceLabel(price: number | null): string {
  if (price == null) return 'Price not found'
  return price === 0 ? 'Free' : `$${price.toLocaleString()} / person`
}

/** The food warning for an option, from the active members' public food preferences. */
export function useFoodWarnings(tripId: string, members: Member[]) {
  const prefs = useFoodPrefs(tripId)
  const active = new Set(members.map((m) => m.userId))
  const groupPrefs = prefs.filter((p) => active.has(p.userId))
  return (o: EngineOption) => foodWarning(o.accommodates, groupPrefs)
}

export function RankedList({ module, trip, members, me }: { module: ListModule; trip: Trip; members: Member[]; me: Member }) {
  const { options } = useOptions(trip.id, module)
  const votes = useVotes(trip.id)
  const warningFor = useFoodWarnings(trip.id, members)
  const { isNew, markSeen } = useSeenOptions(trip.id, me.userId)
  const { success, error, info } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [removing, setRemoving] = useState<EngineOption | null>(null)
  const ranked = rankOptions(options, votes)
  const names = new Map(members.map((m) => [m.userId, m]))
  const capLeft = Math.max(0, RESEARCH_CALL_CAP - trip.researchCallsUsed)
  const copy = COPY[module]

  const run = async (key: string, name: string, params: Record<string, unknown>, done?: string) => {
    setBusy(key)
    const res = await callAction<Record<string, unknown>>(name, { tripId: trip.id, module, ...params })
    setBusy(null)
    if (!res.success) {
      error('Couldn’t do that', res.error)
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
    <section className="min-w-0 space-y-3" aria-label={copy.plural} data-testid={`list-${module}`}>
      <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
        {capLeft === 0 && (
          <p className="text-sm text-destructive" data-testid="cap-message">
            This trip has used all {RESEARCH_CALL_CAP} AI research calls. You can still add {copy.plural} by hand.
          </p>
        )}
        <Button
          onClick={() => run('suggest', 'suggestOptions', {}, 'Suggestions added')}
          loading={busy === 'suggest'}
          disabled={!!busy || capLeft === 0}
          data-testid={`suggest-${module}`}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {options.some((o) => o.source === 'ai') ? 'Search for more' : `Suggest ${SUGGESTION_COUNT[module]} ${copy.plural}`}
        </Button>
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            maxLength={1000}
            data-testid={`add-input-${module}`}
          />
          <Button type="submit" variant="outline" loading={busy === 'add'} disabled={!!busy || !input.trim()} data-testid={`add-${module}`}>
            Add
          </Button>
        </form>
        {(busy === 'suggest' || busy === 'add') && <p className="text-xs text-muted-foreground">Researching. This can take up to a minute.</p>}
      </div>

      {ranked.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <ul className="space-y-3">
          {ranked.map(({ option, voters }) => (
            <ListCard
              key={option.id}
              module={module}
              option={option}
              voters={voters}
              names={names}
              meId={me.userId}
              warning={module === 'food' ? warningFor(option) : null}
              isNew={isNew(option.id)}
              onSeen={() => markSeen(option.id)}
              canRemove={me.tripRole === 'organizer' || option.addedBy === me.userId}
              busy={busy}
              onVote={() => run(`vote-${option.id}`, 'toggleVote', { optionId: option.id })}
              onRemove={() => setRemoving(option)}
              onResearch={() => run(`research-${option.id}`, 'researchOption', { optionId: option.id }, 'Researched')}
              onPrice={(price) => run(`price-${option.id}`, 'setOptionPrice', { optionId: option.id, pricePerPerson: price }, 'Price saved')}
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
        title={`Remove ${removing?.title ?? `this ${copy.noun}`}?`}
        description="It’s removed for everyone, along with its votes."
        confirmText="Remove"
        variant="destructive"
      />
    </section>
  )
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function ListCard({
  module, option, voters, names, meId, warning, isNew, onSeen, canRemove, busy, onVote, onRemove, onResearch, onPrice,
}: {
  module: ListModule
  option: EngineOption
  voters: string[]
  names: Map<string, Member>
  meId: string
  warning: FoodWarning | null
  isNew: boolean
  onSeen: () => void
  canRemove: boolean
  busy: string | null
  onVote: () => void
  onRemove: () => void
  onResearch: () => void
  onPrice: (price: number | null) => void
}) {
  const [editingPrice, setEditingPrice] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [imageFailed, setImageFailed] = useState(false)
  const mine = voters.includes(meId)
  const r = option.research

  return (
    <li
      className={cn('rounded-xl border border-border bg-card p-3 transition-shadow duration-300', isNew && 'border-primary ring-2 ring-primary/50')}
      onPointerEnter={isNew ? onSeen : undefined}
      onFocusCapture={isNew ? onSeen : undefined}
      data-testid={`card-${module}`}
      data-option-id={option.id}
      data-option-title={option.title}
      data-new={isNew ? 'true' : undefined}
    >
      <div className="flex gap-3">
        {option.imageUrl && !imageFailed && (
          <img
            src={option.imageUrl}
            alt={`Photo of ${option.title}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="h-16 w-20 shrink-0 rounded-md bg-muted object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
            {option.url ? (
              <a href={option.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">{option.title}</a>
            ) : (
              option.title
            )}
            {isNew && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">New</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {option.source === 'ai' ? 'Suggested by AI' : `Added by ${names.get(option.addedBy ?? '')?.displayName ?? 'a member'}`}
            {' · '}
            <span data-testid="price">{priceLabel(option.price)}</span>
            {option.price != null && option.priceSource === 'member' && ' (added by a member)'}
            {!editingPrice && (
              <button
                className="ml-1.5 text-primary hover:underline"
                onClick={() => {
                  setPriceInput(option.price?.toString() ?? '')
                  setEditingPrice(true)
                }}
                data-testid="edit-price"
              >
                {option.price == null ? 'Add price' : 'Change'}
              </button>
            )}
          </p>
        </div>
      </div>

      {editingPrice && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onPrice(priceInput === '' ? null : Number(priceInput))
            setEditingPrice(false)
          }}
        >
          <span className="text-sm text-muted-foreground">Per person $</span>
          <Input
            className="w-24"
            inputMode="numeric"
            autoFocus
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value.replace(/[^\d]/g, ''))}
            aria-label={`Price per person for ${option.title}`}
            data-testid="price-input"
          />
          <Button size="sm" type="submit" data-testid="save-price">Save</Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setEditingPrice(false)}>Cancel</Button>
          <span className="w-full text-[11px] text-muted-foreground">0 means free. For reference only; not checked against budgets.</span>
        </form>
      )}

      {warning && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-foreground" data-testid="food-warning">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-label="Warning" />
          <span className="text-foreground">{warning.text}</span>
        </p>
      )}

      {option.researchStatus === 'pending' && <p className="mt-2 text-sm text-muted-foreground">Researching…</p>}
      {option.researchStatus === 'failed' && <p className="mt-2 text-sm text-muted-foreground">Couldn’t research this yet.</p>}
      {r?.summary && <p className="mt-2 text-sm">{r.summary}</p>}
      {r && (r.pros.length > 0 || r.cons.length > 0) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {r.pros.map((p) => `+ ${p}`).concat(r.cons.map((c) => `− ${c}`)).join(' · ')}
        </p>
      )}
      {r && r.sources.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs" data-testid="option-sources">
          {r.sources.map((s) => (
            <a key={s} href={s} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 text-primary hover:underline">
              {hostname(s)} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ))}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <Button size="sm" variant={mine ? 'default' : 'outline'} aria-pressed={mine} disabled={!!busy} onClick={onVote} data-testid="vote">
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> {mine ? 'Voted' : 'Vote'}
        </Button>
        <span className="text-sm" data-testid="vote-count">{voters.length} {voters.length === 1 ? 'vote' : 'votes'}</span>
        <span className="flex -space-x-1.5">
          {voters.slice(0, 6).map((u) => {
            const m = names.get(u)
            return m ? <MemberAvatar key={u} userId={u} name={m.displayName} imageUrl={m.imageUrl} online size={20} /> : null
          })}
        </span>
        <span className="ml-auto flex gap-1">
          {option.researchStatus === 'failed' && (
            <Button size="sm" variant="ghost" onClick={onResearch} loading={busy === `research-${option.id}`} disabled={!!busy} data-testid="research">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Research again
            </Button>
          )}
          {canRemove && (
            <Button size="sm" variant="ghost" onClick={onRemove} disabled={!!busy} aria-label={`Remove ${option.title}`} data-testid="remove-option">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
        </span>
      </div>
    </li>
  )
}
