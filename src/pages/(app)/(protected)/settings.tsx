/**
 * Profile (one per person, shown in every trip but only to tripmates).
 * The name is saved by `updateMyProfile` to your own `profiles` row and
 * copied into each of your trips' member rows.
 *
 * Pictures are on hold while self-hosting (docs/MIGRATION.md 2c): everyone
 * gets the first letter of their name on a color. Saving clears any old
 * DeepSpace-hosted picture link. PictureCropper and src/lib/crop.ts stay for
 * when uploads come back (on S3).
 */

import { useEffect, useState } from 'react'
import { useAuthStatus, useQuery, useUser } from 'deepspace'
import { signOutEverywhere } from '@/components/SignIn'
import { Button, Input, Label, useToast } from '@/components/ui'
import { callAction } from '../../../lib/actions-client'
import { MemberAvatar } from '../../../components/trip/MemberAvatar'

export default function SettingsPage() {
  const { user } = useUser()
  const { userId } = useAuthStatus()
  // Your own profile row ('own' read rule): only you can see it.
  const { records: profileRows, status: profileStatus } = useQuery<{ displayName?: string }>('profiles', {
    where: { userId: userId ?? '' },
    limit: 1,
  })
  const { success, error } = useToast()

  const [name, setName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Start from the saved profile, else the sign-in name.
  useEffect(() => {
    if (!user || profileStatus !== 'ready') return
    const saved = profileRows[0]?.data
    if (name === null) setName(saved?.displayName || user.name || '')
  }, [user, profileRows, profileStatus, name])

  const save = async () => {
    setSaving(true)
    const res = await callAction('updateMyProfile', { name, imageUrl: null })
    setSaving(false)
    if (!res.success) return error('Could not save', res.error)
    success('Profile saved', 'Your trips now show this name.')
  }

  return (
    <div className="min-h-full text-foreground">
      <title>Profile · Co-farer</title>
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Shown to people in your trips, and only to them.</p>

        <section className="mt-5 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <MemberAvatar userId={userId ?? 'me'} name={name || user?.email || '?'} imageUrl={null} online size={64} />
            <p className="text-xs text-muted-foreground">Your circle shows the first letter of your name on your own color.</p>
          </div>

          <div className="mt-5 space-y-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" maxLength={80} value={name ?? ''} onChange={(e) => setName(e.target.value)} data-testid="profile-name" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Email: {user?.email ?? '—'}</p>

          <div className="mt-5 flex gap-2">
            <Button onClick={save} loading={saving} disabled={!name?.trim()} data-testid="save-profile">
              Save profile
            </Button>
            <Button variant="secondary" onClick={signOutEverywhere}>
              Sign out
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
