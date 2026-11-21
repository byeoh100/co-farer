/**
 * Profile (one per person, shown in every trip but only to tripmates).
 * Name and picture are saved by `updateMyProfile` to your own `profiles` row
 * (DeepSpace manages the sign-in name/picture on `users`), and copied into
 * each of your trips' member rows. Pictures go to the app's public file
 * storage: anyone with a picture's link can open it, and links are random.
 */

import { useEffect, useRef, useState } from 'react'
import { signOut, useAuthStatus, useQuery, useR2Files, useUser } from 'deepspace'
import { Camera, Trash2 } from 'lucide-react'
import { Button, Input, Label, useToast } from '@/components/ui'
import { callAction } from '../../../lib/actions-client'
import { parseImageUrl, toStoredImagePath } from '../../../lib/core-input'
import { MemberAvatar } from '../../../components/trip/MemberAvatar'
import { PictureCropper } from '../../../components/PictureCropper'

/** Limit on the chosen file before cropping; the cropped upload is ~20 KB. */
const MAX_PICTURE_BYTES = 15 * 1024 * 1024

export default function SettingsPage() {
  const { user } = useUser()
  const { userId } = useAuthStatus()
  // Your own profile row ('own' read rule): only you can see it.
  const { records: profileRows, status: profileStatus } = useQuery<{ displayName?: string; imageUrl?: string }>('profiles', {
    where: { userId: userId ?? '' },
    limit: 1,
  })
  const { upload, isUploading } = useR2Files({ scope: 'app' })
  const { success, error } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)

  const [name, setName] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [cropping, setCropping] = useState<File | null>(null)

  // Start from the saved profile, else the sign-in name. A sign-in picture
  // (e.g. Google) isn't app-hosted, so it isn't used; the letter avatar shows.
  useEffect(() => {
    if (!user || profileStatus !== 'ready') return
    const saved = profileRows[0]?.data
    if (name === null) setName(saved?.displayName || user.name || '')
    if (imageUrl === undefined) {
      const stored = parseImageUrl(saved?.imageUrl)
      setImageUrl(stored.ok ? stored.value : null)
    }
  }, [user, profileRows, profileStatus, name, imageUrl])

  // Choosing a file opens the cropper; its result is what gets uploaded.
  const pick = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return error('Not a picture', 'Choose a JPG, PNG, GIF or WebP image.')
    if (file.size > MAX_PICTURE_BYTES) return error('Picture too large', 'Choose one under 15 MB.')
    setCropping(file)
  }

  const uploadCropped = async (blob: Blob) => {
    setCropping(null)
    const res = await upload(blob, 'profile.jpg')
    const path = res.success && res.url ? toStoredImagePath(res.url) : null
    if (!path) return error('Upload failed', res.error ?? 'Please try again.')
    setImageUrl(path)
  }

  const save = async () => {
    setSaving(true)
    const res = await callAction('updateMyProfile', { name, imageUrl })
    setSaving(false)
    if (!res.success) return error('Could not save', res.error)
    success('Profile saved', 'Your trips now show this name and picture.')
  }

  return (
    <div className="min-h-full text-foreground">
      <title>Profile · Co-farer</title>
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Shown to people in your trips, and only to them.</p>

        <section className="mt-5 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <MemberAvatar userId={userId ?? 'me'} name={name || user?.email || '?'} imageUrl={imageUrl ?? null} online size={64} />
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  pick(e.target.files?.[0])
                  e.target.value = ''
                }}
                data-testid="picture-input"
              />
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} loading={isUploading}>
                <Camera className="h-4 w-4" aria-hidden /> {imageUrl ? 'Change picture' : 'Upload picture'}
              </Button>
              {imageUrl && (
                <Button variant="ghost" size="sm" onClick={() => setImageUrl(null)}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Without a picture, you get the first letter of your name on a color. Pictures can be opened by anyone with their link.
          </p>

          <div className="mt-5 space-y-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" maxLength={80} value={name ?? ''} onChange={(e) => setName(e.target.value)} data-testid="profile-name" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Email: {user?.email ?? '—'}</p>

          <div className="mt-5 flex gap-2">
            <Button onClick={save} loading={saving} disabled={!name?.trim() || isUploading} data-testid="save-profile">
              Save profile
            </Button>
            <Button variant="secondary" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </section>
      </div>
      <PictureCropper file={cropping} onCancel={() => setCropping(null)} onDone={(b) => void uploadCropped(b)} />
    </div>
  )
}
