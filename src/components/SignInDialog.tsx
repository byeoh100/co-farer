/**
 * Sign-in (docs/MIGRATION.md, Phase 2b): Google, or a one-time code sent by
 * email, both through Amazon Cognito's managed login. Replaces the SDK's
 * DeepSpace <AuthOverlay>. The server does the rest
 * (src/server/cognito-auth.ts): after sign-in the browser comes back to the
 * page it started from, and the SDK's session hooks pick it up.
 */

import { Button, Modal } from './ui'

export function signInUrl(provider: 'google' | 'email'): string {
  const here = `${window.location.pathname}${window.location.search}`
  return `/auth/login?provider=${provider}&returnTo=${encodeURIComponent(here)}`
}

/** Full sign-out: the app's session and Cognito's, then back to the home page. */
export function signOutEverywhere(): void {
  window.location.href = '/auth/logout'
}

export function SignInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} size="sm" data-testid="sign-in-dialog">
      <Modal.Header>
        <Modal.Title>Sign in to Co-farer</Modal.Title>
        <Modal.Description>Plan the trip together. New here? Signing in creates your account.</Modal.Description>
      </Modal.Header>
      <Modal.Body className="flex flex-col gap-3 pb-6">
        <Button data-testid="sign-in-google" onClick={() => (window.location.href = signInUrl('google'))}>
          Continue with Google
        </Button>
        <Button data-testid="sign-in-email" variant="secondary" onClick={() => (window.location.href = signInUrl('email'))}>
          Sign in with an email code
        </Button>
      </Modal.Body>
    </Modal>
  )
}
