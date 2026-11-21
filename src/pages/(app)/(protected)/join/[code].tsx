/**
 * Join page (spec "Screens and flow" 3): where an invite link lands. Shows
 * the trip name and a Join button. After joining, the new member goes to
 * their settings; the data scope is remounted first (join-refresh workaround,
 * src/lib/scope-refresh.ts) so the trip appears without a manual reload.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui'
import { callAction } from '../../../../lib/actions-client'
import { useRefreshScope } from '../../../../lib/scope-refresh'

type Preview = { tripName: string; alreadyMember: boolean; tripId?: string }

export default function JoinPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const refreshScope = useRefreshScope()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    let live = true
    void callAction<Preview>('getInvite', { inviteCode: code }).then((res) => {
      if (!live) return
      if (res.success) setPreview(res.data)
      else setProblem(res.error)
    })
    return () => {
      live = false
    }
  }, [code])

  const join = async () => {
    setJoining(true)
    const res = await callAction<{ tripId: string }>('joinTrip', { inviteCode: code })
    if (!res.success) {
      setJoining(false)
      return setProblem(res.error)
    }
    refreshScope()
    navigate(`/trip/${res.data.tripId}/settings?welcome=1`, { replace: true })
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <title>Join a trip · Co-farer</title>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center" data-testid="join-card">
        {problem ? (
          <>
            <h1 className="text-lg font-semibold">Can’t join</h1>
            <p className="mt-2 text-sm text-muted-foreground" data-testid="join-error">{problem}</p>
            <Link to="/trips" className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline">
              Go to my trips
            </Link>
          </>
        ) : !preview ? (
          <p className="text-sm text-muted-foreground">Checking the invite…</p>
        ) : (
          <>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">You’re invited to</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight" data-testid="join-trip-name">{preview.tripName}</h1>
            {preview.alreadyMember && preview.tripId ? (
              <>
                <p className="mt-3 text-sm text-muted-foreground">You’re already in this trip.</p>
                <Button className="mt-6 w-full" onClick={() => navigate(`/trip/${preview.tripId}`)}>
                  Open the trip
                </Button>
              </>
            ) : (
              <Button className="mt-6 w-full" onClick={join} loading={joining} data-testid="join-button">
                Join trip
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
