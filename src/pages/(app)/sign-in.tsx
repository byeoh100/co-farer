/** /sign-in (co-farer-redesign/SPEC.md, Sign-in page). Already signed in: straight back to where you were going. */

import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuthStatus } from 'deepspace'
import { SignInScreen } from '@/components/SignIn'

export default function SignInPage() {
  const { isSignedIn } = useAuthStatus()
  const [params] = useSearchParams()
  const back = params.get('returnTo')
  if (isSignedIn) return <Navigate to={back && back.startsWith('/') && !back.startsWith('//') ? back : '/trips'} replace />
  return (
    <>
      <title>Sign in · Co-farer</title>
      <SignInScreen />
    </>
  )
}
