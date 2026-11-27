/**
 * The sign-in screen (co-farer-redesign/SPEC.md, Sign-in page;
 * co-farer-redesign/DECISIONS.md). It restyles only: sign-in still goes
 * through Amazon Cognito (src/server/cognito-auth.ts). Google is configured,
 * so it gets its button; email sign-in is by one-time code (no passwords),
 * so the form asks only for the address, which pre-fills Cognito's page.
 * "Create account" opens Cognito's sign-up page the same way.
 */

import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import nightLake from '../assets/sign-in-night.svg'

/** Where "Sign in" goes, coming back to `returnTo` afterwards. */
export function signInPath(returnTo?: string): string {
  return returnTo && returnTo !== '/sign-in' ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : '/sign-in'
}

/** The server route that hands off to Cognito (only same-site return paths survive it). */
export function cognitoUrl(provider: 'google' | 'email' | 'signup', returnTo: string, email?: string): string {
  const q = new URLSearchParams({ provider, returnTo })
  if (email) q.set('email', email)
  return `/auth/login?${q}`
}

/** Full sign-out: the app's session and Cognito's, then back to the home page. */
export function signOutEverywhere(): void {
  window.location.href = '/auth/logout'
}

function GoogleG() {
  // Google's "G" mark, as their sign-in branding guidelines require.
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export function SignInScreen({ returnTo: fixedReturnTo }: { returnTo?: string }) {
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'signup' ? 'signup' : 'signin'
  const returnTo = fixedReturnTo ?? params.get('returnTo') ?? '/trips'
  const failed = params.get('signin') === 'failed'
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const up = mode === 'signup'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return setEmailError('Enter your email address, like you@school.edu.')
    window.location.href = cognitoUrl(up ? 'signup' : 'email', returnTo, v)
  }
  const switchMode = () => {
    const next = new URLSearchParams(params)
    if (up) next.delete('mode')
    else next.set('mode', 'signup')
    setParams(next, { replace: true })
  }

  return (
    <div className="flex min-h-full flex-col bg-cf-bg text-cf-text min-[900px]:flex-row" data-testid="sign-in-screen">
      <section className="relative h-[260px] shrink-0 overflow-hidden min-[900px]:h-auto min-[900px]:min-h-[700px] min-[900px]:flex-[1.2_1_0%]">
        <img src={nightLake} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(17,17,17,0.92)_0%,rgba(17,17,17,0.2)_55%,rgba(17,17,17,0)_100%)]" />
        <div className="absolute bottom-6 left-4 right-4 flex flex-col gap-[18px] sm:left-8 sm:right-8 min-[900px]:bottom-9">
          <p className="font-display text-[56px] leading-[0.88] tracking-[-1px] min-[900px]:text-[96px]" aria-hidden>
            Plan it
            <br />
            together<span className="text-cf-accent-ink">.</span>
          </p>
          <p className="hidden max-w-[440px] text-base leading-normal text-cf-text-2 min-[900px]:block">
            Pick dates everyone’s free, vote on where to stay, split the rides. One page for the whole group.
          </p>
          <div className="hidden flex-wrap gap-2 min-[900px]:flex">
            {['✓ Dates everyone can make', '✓ Group votes', '✓ Seats and gas split'].map((c) => (
              <span key={c} className="rounded-full bg-[rgba(17,17,17,0.75)] px-3.5 py-2 text-[13px]">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="flex w-full max-w-[400px] flex-col gap-5">
          {failed && (
            <p role="alert" data-testid="signin-failed" className="rounded-[14px] border-l-[3px] border-cf-warn bg-cf-surface px-3.5 py-3 text-sm">
              That sign-in didn’t finish. Please try again.
            </p>
          )}
          <div>
            <h1 className="font-display text-[44px]">{up ? 'Create account' : 'Welcome back'}</h1>
            <p className="mt-1.5 text-cf-muted">{up ? 'Takes a minute. Your friends are waiting.' : 'Sign in to see your trips.'}</p>
          </div>

          <a
            href={cognitoUrl('google', returnTo)}
            data-testid="sign-in-google"
            className="flex h-12 items-center justify-center gap-2.5 rounded-full border border-[#8E918F] bg-[#131314] text-[15px] font-medium text-[#E3E3E3] hover:bg-[#1f1f20]"
          >
            <GoogleG />
            Continue with Google
          </a>

          <div className="flex items-center gap-3 text-xs text-cf-faint">
            <span className="h-px flex-1 bg-cf-line" />
            or with email
            <span className="h-px flex-1 bg-cf-line" />
          </div>

          <form className="flex flex-col gap-3.5" onSubmit={submit} noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Email</span>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setEmailError(null)
                }}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'sign-in-email-error' : 'sign-in-email-help'}
                data-testid="sign-in-email-input"
                className="h-[46px] rounded-xl border border-cf-border bg-cf-surface px-3.5 text-[15px] text-cf-text placeholder:text-cf-faint"
              />
              {emailError ? (
                <span id="sign-in-email-error" className="text-[13px] text-cf-warn">
                  {emailError}
                </span>
              ) : (
                <span id="sign-in-email-help" className="text-[13px] text-cf-muted">
                  We’ll email you a one-time code. No password needed.
                </span>
              )}
            </label>
            <button type="submit" data-testid="sign-in-email" className="mt-1 h-12 rounded-full bg-cf-accent text-[15px] font-semibold text-white hover:bg-[#3456b8]">
              {up ? 'Create account' : 'Send me a code'}
            </button>
          </form>

          <p className="text-center text-cf-muted">
            {up ? 'Already have an account?' : 'New to Co-farer?'}{' '}
            <button type="button" onClick={switchMode} className="rounded text-cf-accent-ink hover:underline">
              {up ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
      </section>
    </div>
  )
}
