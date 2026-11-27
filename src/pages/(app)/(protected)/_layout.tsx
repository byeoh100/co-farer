/**
 * Gated routes. Any file under src/pages/(app)/(protected)/ requires sign-in.
 * The `(protected)` folder is a Generouted route group — parentheses mean
 * it doesn't appear in the URL. For a dynamic page that does NOT require
 * sign-in, put it directly under src/pages/(app)/; for a static page, put it
 * at the top level of src/pages/.
 *
 * Children may call data hooks like `useUser()` safely because the parent
 * (app)/_layout.tsx mounts <RecordProvider> above this layout.
 *
 * The `fallback` keeps signed-out visitors inside the app's own chrome
 * (without it, AuthGate shows the SDK's full-screen, non-dismissible
 * overlay). The sign-in overlay opens on demand and can be dismissed.
 */

import { useState } from 'react'
import { Link, Outlet, useSearchParams } from 'react-router-dom'
import { AuthGate } from 'deepspace'
import { Button } from '@/components/ui'
import { SignInDialog } from '@/components/SignInDialog'

export default function ProtectedLayout() {
  return (
    <AuthGate fallback={<SignedOutPanel />}>
      <Outlet />
    </AuthGate>
  )
}

function SignedOutPanel() {
  const [showAuthModal, setShowAuthModal] = useState(false)
  // Set by /auth/callback (src/server/cognito-auth.ts) when a sign-in didn't finish.
  const [params] = useSearchParams()
  const signInFailed = params.get('signin') === 'failed'

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center">
        {signInFailed && (
          <p role="alert" data-testid="signin-failed" className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
            That sign-in didn’t finish. Please try again.
          </p>
        )}
        <h1 className="text-lg font-semibold text-foreground">Sign in to continue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page is only available to signed-in users.
        </p>
        <Button className="mt-6 w-full" onClick={() => setShowAuthModal(true)}>
          Sign in
        </Button>
        <Link
          to="/"
          className="mt-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to home
        </Link>
      </div>

      <SignInDialog open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  )
}
