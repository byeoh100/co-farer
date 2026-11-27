/**
 * Gated routes. Any file under src/pages/(app)/(protected)/ requires sign-in.
 * The `(protected)` folder is a Generouted route group — parentheses mean
 * it doesn't appear in the URL.
 *
 * Children may call data hooks like `useUser()` safely because the parent
 * (app)/_layout.tsx mounts <RecordProvider> above this layout.
 *
 * Signed out, the page shows the sign-in screen in place, and signing in
 * comes back to this same page (co-farer-redesign/SPEC.md, Sign-in page).
 */

import { Outlet, useLocation } from 'react-router-dom'
import { AuthGate } from 'deepspace'
import { SignInScreen } from '@/components/SignIn'

export default function ProtectedLayout() {
  const { pathname, search } = useLocation()
  // A failed sign-in lands on /trips?signin=failed; don't come back to that flag.
  const here = `${pathname}${search.replace(/([?&])signin=failed&?/, '$1').replace(/[?&]$/, '')}`
  return (
    <AuthGate fallback={<SignInScreen returnTo={here} />}>
      <Outlet />
    </AuthGate>
  )
}
