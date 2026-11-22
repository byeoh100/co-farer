/**
 * My settings for this trip (spec "Screens and flow" 5). New members land
 * here right after joining (?welcome=1), then continue to the trip page.
 * Food preferences (visible to the group) are below the budgets.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Lock, Users } from 'lucide-react'
import { Button, ConfirmModal, Input, Label, Switch, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { BUDGET_CATEGORIES, type BudgetCategory } from '../../../../../schemas/trip-schemas'
import { summarizeMyBudget } from '../../../../../lib/budget-fit'
import { MAX_BUDGET } from '../../../../../lib/core-input'
import { callAction } from '../../../../../lib/actions-client'
import { useFoodPrefs, useHousingEstimate, useMyBudget, useMyGasEstimate } from '../../../../../lib/trip-data'
import { DIETARY_LABELS, DIETARY_TAGS, MAX_CUISINE_TEXT, type DietaryTag } from '../../../../../lib/food'
import { useTripContext } from '../../../../../lib/trip-context'

const LABELS: Record<BudgetCategory, { title: string; hint: string }> = {
  housing: { title: 'Housing', hint: 'Your share for the whole stay' },
  gas: { title: 'Gas', hint: 'Your share of driving costs' },
  food: { title: 'Food', hint: 'For reference; not counted in your total' },
  activities: { title: 'Activities', hint: 'For reference; not counted in your total' },
}

type Draft = Record<BudgetCategory, string> & { isPublic: boolean }

export default function TripSettingsPage() {
  const { trip, me, members } = useTripContext()
  const [params] = useSearchParams()
  const welcome = params.get('welcome') === '1'
  const navigate = useNavigate()
  const { success, error } = useToast()
  const { budget, status } = useMyBudget(trip.id, me.userId)
  const housingEstimate = useHousingEstimate(trip.id)
  // Stretch (gas): your share of your car's gas, once the organizer sets the miles.
  const gasEstimate = useMyGasEstimate(trip, me.userId, members)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // Start the form from the saved row once it has loaded (or empty if none).
  useEffect(() => {
    if (draft || status !== 'ready') return
    setDraft({
      housing: budget?.housing?.toString() ?? '',
      gas: budget?.gas?.toString() ?? '',
      food: budget?.food?.toString() ?? '',
      activities: budget?.activities?.toString() ?? '',
      // New budgets are public (Planned Changes Spec, Change 1).
      isPublic: budget?.isPublic ?? true,
    })
  }, [budget, status, draft])

  if (!draft) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading your settings…</div>
  }

  const asNumbers = Object.fromEntries(
    BUDGET_CATEGORIES.map((c) => [c, draft[c] === '' ? null : Number(draft[c])]),
  ) as Record<BudgetCategory, number | null>
  const invalid = BUDGET_CATEGORIES.filter((c) => {
    const n = asNumbers[c]
    return n != null && (!Number.isInteger(n) || n < 0 || n > MAX_BUDGET)
  })
  // Locked housing's price per person is the housing estimate; gas is your share of your car's gas.
  const summary = summarizeMyBudget(asNumbers, { housing: housingEstimate, gas: gasEstimate }, BUDGET_CATEGORIES)

  const save = async () => {
    setSaving(true)
    const res = await callAction('setMyBudgets', { tripId: trip.id, ...asNumbers, isPublic: draft.isPublic })
    setSaving(false)
    if (!res.success) return error('Could not save', res.error)
    success('Budgets saved')
    if (welcome) navigate(`/trip/${trip.id}`)
  }

  const leave = async () => {
    setLeaving(true)
    const res = await callAction('leaveTrip', { tripId: trip.id })
    setLeaving(false)
    setConfirmLeave(false)
    if (!res.success) return error('Could not leave', res.error)
    success('You left the trip')
    navigate('/trips')
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <title>{`My settings · ${trip.name}`}</title>
      {!welcome && (
        <Link to={`/trip/${trip.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {trip.name}
        </Link>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">{welcome ? `Welcome to ${trip.name}` : 'My settings'}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {welcome ? 'Set your budgets first. You can change them any time.' : `Your budgets for ${trip.name}.`}
      </p>

      <div className="mt-4 rounded-lg bg-accent px-3 py-2.5 text-sm text-accent-foreground" data-testid="privacy-note">
        <label className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium">
            {draft.isPublic ? <Users className="h-4 w-4 shrink-0" aria-hidden /> : <Lock className="h-4 w-4 shrink-0" aria-hidden />}
            Share my budget with the trip
          </span>
          <Switch
            checked={draft.isPublic}
            onCheckedChange={(on) => setDraft({ ...draft, isPublic: on })}
            aria-label="Share my budget with the trip"
            data-testid="budget-public"
          />
        </label>
        <p className="mt-1 text-xs opacity-80">
          {draft.isPublic
            ? 'Everyone in the trip sees your budgets next to your name.'
            : 'Nobody else sees your numbers, but they still count toward the group’s fit and searches.'}
        </p>
      </div>

      <section className="mt-5 space-y-3" aria-label="Budgets">
        {BUDGET_CATEGORIES.map((c) => {
          const line = summary.lines.find((l) => l.category === c)!
          return (
            <div key={c} className="rounded-xl border border-border bg-card p-4" data-testid={`budget-${c}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label htmlFor={`budget-${c}-input`} className="text-sm font-medium">
                    {LABELS[c].title}
                  </Label>
                  <p className="text-xs text-muted-foreground">{LABELS[c].hint}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="relative w-36">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
                  <Input
                    id={`budget-${c}-input`}
                    inputMode="numeric"
                    placeholder="Not set"
                    value={draft[c]}
                    onChange={(e) => setDraft({ ...draft, [c]: e.target.value.replace(/[^\d]/g, '') })}
                    className={cn('pl-6', invalid.includes(c) && 'border-destructive')}
                    aria-invalid={invalid.includes(c)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Estimate: {line.estimate == null ? 'none yet' : `$${line.estimate}`}
                  {line.over && <span className="ml-1 font-medium text-destructive">· over budget</span>}
                </p>
              </div>
            </div>
          )
        })}
      </section>

      <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm" data-testid="essentials-total">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Essentials total</span>
          <span>
            {summary.totalBudget > 0 ? `$${summary.totalBudget}` : 'Not set'}
            <span className="ml-1 text-muted-foreground">· estimate {summary.totalEstimate > 0 ? `$${summary.totalEstimate}` : 'none yet'}</span>
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Housing and gas only. Going over is flagged, never blocked.</p>
        {summary.totalOver && <p className="mt-1 text-xs font-medium text-destructive">Estimated costs are over your essentials budget.</p>}
      </div>

      {invalid.length > 0 && (
        <p className="mt-3 text-sm text-destructive">Budgets must be whole dollars up to ${MAX_BUDGET.toLocaleString()}.</p>
      )}
      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} loading={saving} disabled={invalid.length > 0} data-testid="save-budgets">
          {welcome ? 'Save and go to the trip' : 'Save budgets'}
        </Button>
        {welcome && (
          <Link to={`/trip/${trip.id}`} className="text-sm text-muted-foreground hover:text-foreground">
            Skip for now
          </Link>
        )}
      </div>

      <FoodPreferences tripId={trip.id} userId={me.userId} />

      {me.tripRole === 'organizer' && (
        <TripDetails tripId={trip.id} name={trip.name} destination={trip.destination ?? ''} meetingPoint={trip.meetingPoint ?? ''} />
      )}

      {me.tripRole !== 'organizer' && (
        <section className="mt-10 border-t border-border pt-6">
          <h2 className="text-sm font-medium">Leave this trip</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Your public budgets are removed. You can rejoin later with an invite link.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setConfirmLeave(true)} data-testid="leave-trip">
            Leave trip
          </Button>
        </section>
      )}
      <ConfirmModal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={leave}
        loading={leaving}
        title={`Leave ${trip.name}?`}
        description="You’ll lose access to this trip until someone sends you an invite link again."
        confirmText="Leave trip"
        variant="destructive"
      />
    </div>
  )
}

/** Organizer only: the trip's name and destination (both required), and the meeting point. */
function TripDetails({ tripId, name, destination, meetingPoint }: { tripId: string; name: string; destination: string; meetingPoint: string }) {
  const { success, error } = useToast()
  const [draftName, setDraftName] = useState(name)
  const [draftDest, setDraftDest] = useState(destination)
  const [draftMeet, setDraftMeet] = useState(meetingPoint)
  const [saving, setSaving] = useState(false)
  const changed = draftName.trim() !== name || draftDest.trim() !== destination || draftMeet.trim() !== meetingPoint

  const save = async () => {
    setSaving(true)
    const res = await callAction('updateTrip', { tripId, name: draftName, destination: draftDest, meetingPoint: draftMeet })
    setSaving(false)
    if (res.success) success('Trip details saved')
    else error('Could not save', res.error)
  }

  return (
    <section className="mt-10 border-t border-border pt-6" data-testid="trip-details">
      <h2 className="text-sm font-medium">Trip details</h2>
      <p className="mt-1 text-xs text-muted-foreground">Only the organizer can change these. Housing research uses the destination; cars leave from the meeting point unless a driver sets their own.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="trip-name-edit">Trip name</Label>
          <Input id="trip-name-edit" maxLength={120} value={draftName} onChange={(e) => setDraftName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trip-destination-edit">Destination</Label>
          <Input id="trip-destination-edit" maxLength={200} value={draftDest} onChange={(e) => setDraftDest(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="trip-meeting-edit">Meeting point (optional)</Label>
          <Input
            id="trip-meeting-edit"
            maxLength={120}
            placeholder="e.g. Campus, Lot 22"
            value={draftMeet}
            onChange={(e) => setDraftMeet(e.target.value)}
            data-testid="meeting-point-input"
          />
        </div>
      </div>
      <Button size="sm" className="mt-3" onClick={save} loading={saving} disabled={!changed || !draftName.trim() || !draftDest.trim()} data-testid="save-trip-details">
        Save trip details
      </Button>
    </section>
  )
}

/** Your dietary needs and cuisines. Visible to everyone in the trip (spec §7). */
function FoodPreferences({ tripId, userId }: { tripId: string; userId: string }) {
  const { success, error } = useToast()
  const mine = useFoodPrefs(tripId).find((p) => p.userId === userId)
  const [draft, setDraft] = useState<{ dietary: DietaryTag[]; likes: string; avoids: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const current = draft ?? { dietary: mine?.dietary ?? [], likes: mine?.likes ?? '', avoids: mine?.avoids ?? '' }

  const toggle = (t: DietaryTag) =>
    setDraft({ ...current, dietary: current.dietary.includes(t) ? current.dietary.filter((x) => x !== t) : [...current.dietary, t] })

  const save = async () => {
    setSaving(true)
    const res = await callAction('setMyFoodPrefs', { tripId, ...current })
    setSaving(false)
    if (!res.success) return error('Could not save', res.error)
    setDraft(null)
    success('Food preferences saved')
  }

  return (
    <section id="food" className="mt-8 rounded-xl border border-border bg-card p-4" aria-label="Food preferences" data-testid="food-prefs">
      <h2 className="text-sm font-medium">Food preferences</h2>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" aria-hidden /> Everyone in the trip can see these. They shape the food suggestions.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Dietary needs">
        {DIETARY_TAGS.map((t) => {
          const on = current.dietary.includes(t)
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(t)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
              )}
              data-testid={`diet-${t}`}
            >
              {DIETARY_LABELS[t]}
            </button>
          )
        })}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="food-likes">Cuisines you like</Label>
          <Input
            id="food-likes"
            maxLength={MAX_CUISINE_TEXT}
            placeholder="e.g. Mexican, Thai, BBQ"
            value={current.likes}
            onChange={(e) => setDraft({ ...current, likes: e.target.value })}
            data-testid="food-likes"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="food-avoids">Cuisines to avoid</Label>
          <Input
            id="food-avoids"
            maxLength={MAX_CUISINE_TEXT}
            placeholder="e.g. very spicy food"
            value={current.avoids}
            onChange={(e) => setDraft({ ...current, avoids: e.target.value })}
            data-testid="food-avoids"
          />
        </div>
      </div>
      <Button size="sm" className="mt-3" onClick={save} loading={saving} disabled={!draft} data-testid="save-food-prefs">
        Save food preferences
      </Button>
    </section>
  )
}
