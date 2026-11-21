/**
 * The trip page (docs/LAYOUT.md). Layout lives here and nowhere else: modules
 * only supply a <Name>Summary / <Name>Full pair for their slot.
 *
 * Module 1 ships the frame: header, the date bar and four section slots.
 * Module 2 fills the date bar. No section's module is built yet, so every
 * section renders disabled:
 *   - mobile (< 900px): a grayed card in the 2 × 2 grid;
 *   - desktop (≥ 900px): a thin bar, labeled, with no information;
 *   - clicking shows a notice instead of opening.
 * ExpandableSection (the expand animation) arrives with Module 3.
 */

import { Link } from 'react-router-dom'
import { Settings2 } from 'lucide-react'
import { useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { ESSENTIAL_CATEGORIES } from '../../schemas/trip-schemas'
import { summarizeMyBudget } from '../../lib/budget-fit'
import { useMyBudget, type Member, type Trip } from '../../lib/trip-data'
import { MembersStack } from './MembersStack'
import { DatesBar } from '../dates/DatesBar'

type SectionId = 'housing' | 'travel' | 'additional' | 'notes'

interface SectionSlot {
  id: SectionId
  label: string
  /** Shown as a toast when a disabled section is clicked. */
  notice: string
  available: boolean
}

const NOT_READY = 'This part isn’t ready yet.'

/** Each module flips its slot to available when it ships. */
const SECTIONS: SectionSlot[] = [
  { id: 'housing', label: 'Housing', notice: NOT_READY, available: false },
  { id: 'travel', label: 'Travel', notice: NOT_READY, available: false },
  { id: 'additional', label: 'Additional', notice: NOT_READY, available: false },
  { id: 'notes', label: 'Notes', notice: NOT_READY, available: false },
]

export function TripOverview({ trip, members, me }: { trip: Trip; members: Member[]; me: Member }) {
  const { info } = useToast()
  const isOrganizer = me.tripRole === 'organizer'
  const anyAvailable = SECTIONS.some((s) => s.available)

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-3 px-4 py-4 min-[900px]:py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight" data-testid="trip-name">
            {trip.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {trip.destination ? `${trip.destination} · ` : ''}
            {members.length} {members.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MembersStack trip={trip} members={members} isOrganizer={isOrganizer} />
        </div>
      </header>

      <MyEssentials tripId={trip.id} userId={me.userId} />

      <DatesBar trip={trip} members={members} me={me} />

      {!anyAvailable && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm" data-testid="getting-started">
          <p className="font-medium">Getting started</p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            <li>
              <Link to={`/trip/${trip.id}/settings`} className="text-primary underline-offset-4 hover:underline">
                Set your budgets
              </Link>{' '}
              (private unless you choose to share).
            </li>
            {isOrganizer && <li>Invite your group: tap the member circles above for the invite link.</li>}
          </ul>
        </div>
      )}

      <div
        className={cn(
          'grid flex-1 grid-cols-2 gap-3',
          'min-[900px]:flex min-[900px]:min-h-[360px] min-[900px]:items-stretch',
        )}
        data-testid="trip-sections"
      >
        {SECTIONS.map((s) =>
          s.available ? null /* Module 3+ renders ExpandableSection here. */ : (
            <DisabledSection key={s.id} section={s} onClick={() => info(s.label, s.notice)} />
          ),
        )}
      </div>
    </div>
  )
}

function DisabledSection({ section, onClick }: { section: SectionSlot; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-label={`${section.label}: not available yet`}
      data-testid={`section-${section.id}`}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/60 text-muted-foreground transition-colors hover:bg-muted',
        // Mobile: a grayed card in the 2 × 2 grid.
        'min-h-24 p-3',
        // Desktop: a thin labeled bar with no information.
        'min-[900px]:min-h-0 min-[900px]:w-12 min-[900px]:shrink-0 min-[900px]:p-0',
      )}
    >
      <span className="text-sm font-medium min-[900px]:[writing-mode:vertical-rl] min-[900px]:rotate-180">
        {section.label}
      </span>
    </button>
  )
}

/** Your essentials total (housing + gas). Only you see this; it's never sent to anyone. */
function MyEssentials({ tripId, userId }: { tripId: string; userId: string }) {
  const { budget } = useMyBudget(tripId, userId)
  // No estimates exist until housing locks (Module 3) or gas is computed (stretch).
  const summary = summarizeMyBudget(budget ?? {}, {}, ESSENTIAL_CATEGORIES)
  const hasBudget = summary.lines.some((l) => l.budget != null)
  const hasEstimate = summary.lines.some((l) => l.estimate != null)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm" data-testid="my-essentials">
      <span>
        <span className="text-muted-foreground">Your essentials: </span>
        {!hasBudget ? (
          <span className="text-muted-foreground">no budget set</span>
        ) : hasEstimate ? (
          <span className={cn(summary.totalOver && 'font-medium text-destructive')}>
            ${summary.totalEstimate} of ${summary.totalBudget}
          </span>
        ) : (
          <span>Budget ${summary.totalBudget} · no estimates yet</span>
        )}
        <span className="ml-1.5 text-xs text-muted-foreground">(only you see this)</span>
      </span>
      <Link
        to={`/trip/${tripId}/settings`}
        className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
        data-testid="my-settings-link"
      >
        <Settings2 className="h-4 w-4" aria-hidden /> My settings
      </Link>
    </div>
  )
}
