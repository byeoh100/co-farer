/** My trips (spec "Screens and flow" 2): your trips and a button to create one. */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MapPin, Plus } from 'lucide-react'
import { Button, Input, Label, useToast } from '@/components/ui'
import { callAction } from '../../../lib/actions-client'
import { useMyTrips } from '../../../lib/trip-data'

export default function MyTripsPage() {
  const { trips, status } = useMyTrips()
  const [creating, setCreating] = useState(false)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <title>My trips · Co-farer</title>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">My trips</h1>
        {!creating && (
          <Button onClick={() => setCreating(true)} data-testid="new-trip">
            <Plus className="h-4 w-4" aria-hidden /> New trip
          </Button>
        )}
      </div>

      {creating && <CreateTripForm onCancel={() => setCreating(false)} />}

      <ul className="mt-5 space-y-2" data-testid="trip-list">
        {trips.map((t) => (
          <li key={t.id}>
            <Link
              to={`/trip/${t.id}`}
              className="block rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-ring/50"
              data-testid="trip-card"
            >
              <p className="font-medium">{t.name}</p>
              {t.destination && (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> {t.destination}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {status === 'ready' && trips.length === 0 && !creating && (
        <div className="mt-10 rounded-xl border border-dashed border-border p-8 text-center" data-testid="no-trips">
          <p className="font-medium">No trips yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one, or open an invite link a friend sent you.</p>
        </div>
      )}
    </div>
  )
}

function CreateTripForm({ onCancel }: { onCancel: () => void }) {
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
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4" data-testid="create-trip-form">
      <div className="space-y-1.5">
        <Label htmlFor="trip-name">Trip name</Label>
        <Input id="trip-name" required maxLength={120} placeholder="Spring break" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="trip-destination">Destination (optional)</Label>
        <Input id="trip-destination" maxLength={200} placeholder="Cachuma Lake" value={destination} onChange={(e) => setDestination(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={!name.trim()} data-testid="create-trip">
          Create trip
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
