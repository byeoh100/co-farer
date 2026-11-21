/**
 * Landing page (spec "Screens and flow" 1): what the app is, plus sign in.
 * A STATIC page: no DeepSpace providers, no auth call, no websocket, and it
 * is prerendered at build. Keep it renderable without a browser.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const POINTS = [
  { title: 'Pick dates together', body: 'Everyone marks when they’re free; the overlap shows the best days.' },
  { title: 'Vote on where to stay', body: 'Suggestions, research and live voting, checked against the group’s budget.' },
  { title: 'Budgets stay private', body: 'Each budget is yours alone unless you switch it to public.' },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">Co-farer</p>
        <h1 className="mb-4 max-w-2xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Plan the group trip without the group chat chaos
        </h1>
        <p className="mb-8 max-w-md text-muted-foreground">
          Decide on dates, where to stay and how to get there, together, in one place that updates live for everyone.
        </p>
        <Link
          to="/trips"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Sign in to plan a trip
        </Link>
        <ul className="mt-14 grid max-w-3xl gap-4 text-left sm:grid-cols-3">
          {POINTS.map((p) => (
            <li key={p.title} className="rounded-xl border border-border bg-card p-4">
              <p className="font-medium text-foreground">{p.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
