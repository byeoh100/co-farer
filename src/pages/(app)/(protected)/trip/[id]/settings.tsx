/**
 * My settings for this trip (spec "Screens and flow" 5). New members land
 * here right after joining (?welcome=1), then continue to the trip page.
 * Food preferences join this page in Module 7.
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
import { useHousingEstimate, useMyBudget } from '../../../../../lib/trip-data'
import { useTripContext } from '../../../../../lib/trip-context'

const LABELS: Record<BudgetCategory, { title: string; hint: string }> = {
  housing: { title: 'Housing', hint: 'Your share for the whole stay' },
  gas: { title: 'Gas', hint: 'Your share of driving costs' },
  food: { title: 'Food', hint: 'For reference; not counted in your total' },
  activities: { title: 'Activities', hint: 'For reference; not counted in your total' },
}

type Draft = Record<BudgetCategory, string> & { publicCategories: BudgetCategory[] }

export default function TripSettingsPage() {
  const { trip, me } = useTripContext()
  const [params] = useSearchParams()
  const welcome = params.get('welcome') === '1'
  const navigate = useNavigate()
  const { success, error } = useToast()
  const { budget, status } = useMyBudget(trip.id, me.userId)
  const housingEstimate = useHousingEstimate(trip.id)

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
      publicCategories: budget?.publicCategories ?? [],
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
  // Locked housing's price per person is the housing estimate; gas comes with the stretch.
  const summary = summarizeMyBudget(asNumbers, { housing: housingEstimate }, BUDGET_CATEGORIES)

  const save = async () => {
    setSaving(true)
    const res = await callAction('setMyBudgets', { tripId: trip.id, ...asNumbers, publicCategories: draft.publicCategories })
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

  const togglePublic = (c: BudgetCategory, on: boolean) =>
    setDraft({
      ...draft,
      publicCategories: on ? [...draft.publicCategories, c] : draft.publicCategories.filter((x) => x !== c),
    })

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

      <p className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground" data-testid="privacy-note">
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        Only you can see private budgets. They count toward anonymous totals only.
      </p>

      <section className="mt-5 space-y-3" aria-label="Budgets">
        {BUDGET_CATEGORIES.map((c) => {
          const line = summary.lines.find((l) => l.category === c)!
          const isPublic = draft.publicCategories.includes(c)
          return (
            <div key={c} className="rounded-xl border border-border bg-card p-4" data-testid={`budget-${c}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label htmlFor={`budget-${c}-input`} className="text-sm font-medium">
                    {LABELS[c].title}
                  </Label>
                  <p className="text-xs text-muted-foreground">{LABELS[c].hint}</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  {isPublic ? <Users className="h-3.5 w-3.5" aria-hidden /> : <Lock className="h-3.5 w-3.5" aria-hidden />}
                  <span className="w-12">{isPublic ? 'Public' : 'Private'}</span>
                  <Switch
                    checked={isPublic}
                    onCheckedChange={(on) => togglePublic(c, on)}
                    aria-label={`Show my ${LABELS[c].title.toLowerCase()} budget to the group`}
                    data-testid={`budget-${c}-public`}
                  />
                </label>
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
              {isPublic && line.budget == null && (
                <p className="mt-2 text-xs text-muted-foreground">Set an amount to share it.</p>
              )}
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

      {me.tripRole === 'organizer' && <TripDetails tripId={trip.id} name={trip.name} destination={trip.destination ?? ''} />}

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

/** Organizer only: the trip's name and destination (both required). */
function TripDetails({ tripId, name, destination }: { tripId: string; name: string; destination: string }) {
  const { success, error } = useToast()
  const [draftName, setDraftName] = useState(name)
  const [draftDest, setDraftDest] = useState(destination)
  const [saving, setSaving] = useState(false)
  const changed = draftName.trim() !== name || draftDest.trim() !== destination

  const save = async () => {
    setSaving(true)
    const res = await callAction('updateTrip', { tripId, name: draftName, destination: draftDest })
    setSaving(false)
    if (res.success) success('Trip details saved')
    else error('Could not save', res.error)
  }

  return (
    <section className="mt-10 border-t border-border pt-6" data-testid="trip-details">
      <h2 className="text-sm font-medium">Trip details</h2>
      <p className="mt-1 text-xs text-muted-foreground">Only the organizer can change these. Housing research uses the destination.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="trip-name-edit">Trip name</Label>
          <Input id="trip-name-edit" maxLength={120} value={draftName} onChange={(e) => setDraftName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trip-destination-edit">Destination</Label>
          <Input id="trip-destination-edit" maxLength={200} value={draftDest} onChange={(e) => setDraftDest(e.target.value)} />
        </div>
      </div>
      <Button size="sm" className="mt-3" onClick={save} loading={saving} disabled={!changed || !draftName.trim() || !draftDest.trim()} data-testid="save-trip-details">
        Save trip details
      </Button>
    </section>
  )
}
