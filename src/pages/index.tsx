/**
 * Landing page (co-farer-landing/LANDING-SPEC.md). A STATIC page: no
 * providers, no auth call, no websocket, prerendered at build so search
 * engines and link previews read it. Signed-in visitors never see it: the
 * worker sends `/` to `/trips` first (src/server/landing.ts).
 *
 *   Sign in            → the sign-in page, back to /trips
 *   Plan a trip        → /trips?new=1 (opens "Plan a trip"; signed out, via sign-in)
 *   I have an invite   → the sign-in page, back to /trips?join=1 ("Join with a code")
 *
 * Invite links (/join/<code>) are untouched.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'
import landingLake from '../assets/landing-lake.svg'

const PLAN = '/trips?new=1'
const SIGN_IN = `/sign-in?returnTo=${encodeURIComponent('/trips')}`
const INVITE = `/sign-in?returnTo=${encodeURIComponent('/trips?join=1')}`

/** Decorative, matching the app's person palette and VoterSegments. */
const SLOTS = ['#F26B3A', '#E9C46A', '#7FB7BE', '#B8A1D9', 'var(--cf-border)', 'var(--cf-border)']
const FREE = [2, 3, 4, 5, 6, 6, 6, 4, 3, 2]

const pill = 'inline-flex items-center rounded-full whitespace-nowrap transition-colors'
const primary = `${pill} bg-cf-accent font-semibold text-white hover:bg-[#3456b8]`
const outline = `${pill} border border-cf-border text-cf-text hover:bg-cf-surface-2`

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Co-farer home">
      <img src="/logo-mark.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
      <span className="font-display text-[26px] tracking-[0.5px]">Co-farer</span>
    </Link>
  )
}

function Segments({ height }: { height: number }) {
  return (
    <div className="grid grid-cols-6" style={{ gap: height > 6 ? 4 : 3 }}>
      {SLOTS.map((c, i) => (
        <span key={i} style={{ height, borderRadius: height / 2, background: c }} />
      ))}
    </div>
  )
}

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-cf-bg text-cf-text">
        <header className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <Logo />
          <nav aria-label="Account" className="flex gap-2.5">
            <Link to={SIGN_IN} className={`${outline} h-10 px-[18px] text-sm`}>
              Sign in
            </Link>
            <Link to={PLAN} className={`${primary} h-10 px-[18px] text-sm max-[420px]:hidden`}>
              Plan a trip
            </Link>
          </nav>
        </header>

        <main>
          <section className="mx-auto max-w-[1280px] px-4 sm:px-8">
            <div className="relative overflow-hidden rounded-3xl min-[900px]:h-[560px]">
              <img src={landingLake} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-[rgba(17,17,17,0.55)] min-[900px]:bg-transparent min-[900px]:bg-[linear-gradient(to_right,rgba(17,17,17,0.92)_0%,rgba(17,17,17,0.6)_45%,rgba(17,17,17,0)_75%)]" />
              <div className="relative flex max-w-[620px] flex-col justify-center gap-[22px] px-6 py-12 min-[900px]:h-full min-[900px]:px-12 min-[900px]:py-0">
                <p className="text-[13px] uppercase tracking-[1.5px] text-cf-muted">Group trip planner</p>
                <h1 className="font-display text-[56px] leading-[0.88] tracking-[-1px] min-[900px]:text-[96px]">
                  Plan the trip, <br />
                  not the group <br />
                  chat<span className="text-cf-accent-ink">.</span>
                </h1>
                <p className="max-w-[460px] text-[17px] leading-normal text-cf-text-2">
                  Find the days everyone’s free, vote on where to stay, and fill the cars, all on one page that updates live for the whole group.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <Link to={PLAN} className={`${primary} h-[50px] px-6 text-[15px]`}>
                    Plan a trip, it’s free
                  </Link>
                  <Link to={INVITE} className={`${outline} h-[50px] bg-[rgba(17,17,17,0.7)] px-[22px] text-[15px]`}>
                    I have an invite
                  </Link>
                </div>
              </div>
              <div aria-hidden className="absolute bottom-9 right-9 hidden w-[330px] flex-col gap-2.5 rounded-[18px] bg-[rgba(27,27,27,0.94)] p-4 min-[900px]:flex">
                <div className="flex items-center justify-between">
                  <span className="font-display text-[22px]">Lakeview Yurt</span>
                  <span className="rounded-full bg-cf-accent px-2.5 py-[3px] text-xs font-semibold text-white">Leading</span>
                </div>
                <span className="text-[13px] text-cf-muted">$48 per person · fits everyone’s budget</span>
                <Segments height={8} />
              </div>
            </div>
          </section>

          <section className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 pt-14 sm:px-8" aria-labelledby="how-it-works">
            <h2 id="how-it-works" className="font-display text-[44px]">
              How it works
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-6">
              <Step n="01" title="Pick the dates" body="Everyone marks when they’re free. The overlap shows the best days, and you lock them in.">
                <div className="grid h-[70px] grid-cols-10 items-end gap-1">
                  {FREE.map((f, i) => (
                    <div key={i} className="flex h-[70px] items-end overflow-hidden rounded-md bg-cf-surface-2">
                      <span className="w-full rounded-md" style={{ height: `${Math.round((f / 6) * 100)}%`, background: i >= 4 && i <= 6 ? 'var(--cf-accent)' : 'var(--cf-neutral-bar)' }} />
                    </div>
                  ))}
                </div>
              </Step>
              <Step n="02" title="Vote on where to stay" body="Suggest places, get them researched, and vote live. Options over someone’s budget get flagged.">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2.5 rounded-xl bg-cf-surface-2 p-2">
                    <span className="h-10 w-[54px] shrink-0 rounded-lg bg-[linear-gradient(135deg,#2a4aa8,#7fb7be)]" />
                    <div className="flex flex-1 flex-col gap-[5px]">
                      <span className="text-[13px] font-semibold">Lakeview Yurt</span>
                      <Segments height={5} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl bg-cf-surface-2 p-2">
                    <span className="h-10 w-[54px] shrink-0 rounded-lg bg-[linear-gradient(135deg,#3a3f7a,#e8875a)]" />
                    <div className="flex flex-1 flex-col gap-[3px]">
                      <span className="text-[13px] font-semibold">Lakeside cabin</span>
                      <span className="text-xs text-cf-warn">▲ Over budget for 2</span>
                    </div>
                  </div>
                </div>
              </Step>
              <Step n="03" title="Keep it in budget" body="Each person’s budget shapes the plan. Share it with the group or keep it private; it counts either way.">
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[13px]">
                    <span>Housing</span>
                    <span className="text-cf-muted">$48 of $60</span>
                  </div>
                  <div className="h-2 rounded bg-cf-track">
                    <div className="h-2 w-4/5 rounded bg-cf-accent" />
                  </div>
                  <div className="mt-1 flex justify-between text-[13px]">
                    <span>Gas</span>
                    <span className="text-cf-muted">$15 of $30</span>
                  </div>
                  <div className="h-2 rounded bg-cf-track">
                    <div className="h-2 w-1/2 rounded bg-cf-accent" />
                  </div>
                </div>
              </Step>
            </div>
          </section>

          <section className="mx-auto max-w-[1280px] px-4 py-14 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl bg-cf-surface px-6 py-9 sm:px-10">
              <div className="flex flex-col gap-2">
                <h2 className="font-display text-[40px] leading-[0.95] sm:text-[52px]">
                  Got a trip in mind<span className="text-cf-accent-ink">?</span>
                </h2>
                <p className="text-[15px] text-cf-muted">Start it in a minute, then send the link to your group.</p>
              </div>
              <Link to={PLAN} className={`${primary} h-[52px] px-[26px] text-[15px]`}>
                Plan a trip
              </Link>
            </div>
          </section>
        </main>

        <footer className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-3 px-4 pb-8 text-[13px] text-cf-faint sm:px-8">
          <div className="flex w-full flex-wrap justify-between gap-3 border-t border-cf-line pt-5">
            <span>© {new Date().getFullYear()} Co-farer</span>
            {/* Terms and Privacy are left out until those pages exist (LANDING-SPEC.md §2). */}
            <Link to={SIGN_IN} className="rounded text-cf-muted hover:text-cf-text">
              Sign in
            </Link>
          </div>
        </footer>
      </div>
    </>
  )
}

function Step({ n, title, body, children }: { n: string; title: string; body: string; children: ReactNode }) {
  return (
    <article className="flex flex-col gap-3.5 rounded-[20px] bg-cf-surface p-[22px]">
      <span className="font-display text-[40px] text-cf-accent-ink" aria-hidden>
        {n}
      </span>
      <h3 className="font-display text-[28px]">{title}</h3>
      <p className="leading-normal text-cf-muted">{body}</p>
      <div className="mt-auto" aria-hidden>
        {children}
      </div>
    </article>
  )
}
