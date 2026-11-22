/**
 * The trip page (docs/LAYOUT.md). Layout lives here and nowhere else: modules
 * only supply a <Name>Summary / <Name>Full pair for their slot.
 *
 * Header, the date bar (Module 2), and four section slots. A section whose
 * module is built and usable renders as an ExpandableSection (Module 3+).
 * Otherwise it renders disabled:
 *   - mobile (< 900px): a grayed card in the 2 × 2 grid;
 *   - desktop (≥ 900px): a thin bar, labeled, with no information;
 *   - clicking shows a notice instead of opening.
 */

import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Settings2 } from 'lucide-react'
import { useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { ESSENTIAL_CATEGORIES } from '../../schemas/trip-schemas'
import { summarizeMyBudget } from '../../lib/budget-fit'
import { useHousingEstimate, useMyBudget, useMyGasEstimate, type Member, type Trip } from '../../lib/trip-data'
import { MembersStack } from './MembersStack'
import { DatesBar } from '../dates/DatesBar'
import { HousingFull } from '../housing/HousingFull'
import { HousingSummary } from '../housing/HousingSummary'
import { TravelFull } from '../travel/TravelFull'
import { TravelSummary } from '../travel/TravelSummary'
import { NotesFull } from '../notes/NotesFull'
import { NotesSummary } from '../notes/NotesSummary'
import { AdditionalFull } from '../additional/AdditionalFull'
import { AdditionalSummary } from '../additional/AdditionalSummary'
import { ExpandableSection, SectionStageContext } from './ExpandableSection'

type SectionId = 'housing' | 'travel' | 'additional' | 'notes'

interface SectionSlot {
  id: SectionId
  label: string
  /** Shown as a toast when a disabled section is clicked. */
  notice: string
  available: boolean
  summary?: ReactNode
  full?: ReactNode
}

const NOT_READY = 'This part isn’t ready yet.'

/** Each module fills its slot when it ships. */
function sectionsFor(trip: Trip, members: Member[], me: Member): SectionSlot[] {
  const datesLocked = trip.datesStatus === 'locked'
  return [
    {
      id: 'housing',
      label: 'Housing',
      notice: 'Housing opens once the dates are locked.',
      available: datesLocked,
      summary: <HousingSummary trip={trip} members={members} />,
      full: <HousingFull trip={trip} members={members} me={me} />,
    },
    {
      // Usable right away: cars can be sorted out before the dates lock.
      id: 'travel',
      label: 'Travel',
      notice: NOT_READY,
      available: true,
      summary: <TravelSummary tripId={trip.id} members={members} />,
      full: <TravelFull trip={trip} members={members} me={me} />,
    },
    {
      // Activities and Food (Modules 6–7, built together): usable right away.
      id: 'additional',
      label: 'Additional',
      notice: NOT_READY,
      available: true,
      summary: <AdditionalSummary tripId={trip.id} members={members} />,
      full: <AdditionalFull trip={trip} members={members} me={me} />,
    },
    {
      id: 'notes',
      label: 'Notes',
      notice: NOT_READY,
      available: true,
      summary: <NotesSummary tripId={trip.id} />,
      full: <NotesFull trip={trip} me={me} />,
    },
  ]
}

export function TripOverview({ trip, members, me }: { trip: Trip; members: Member[]; me: Member }) {
  const { info } = useToast()
  const stageRef = useRef<HTMLDivElement>(null)
  const isOrganizer = me.tripRole === 'organizer'
  const sections = sectionsFor(trip, members, me)
  const anyAvailable = sections.some((s) => s.available)

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

      {/* The stage: a section expands over this area on desktop. */}
      <div ref={stageRef} className="flex flex-1 flex-col gap-3">
      <SectionStageContext.Provider value={stageRef}>
      <MyEssentials trip={trip} members={members} userId={me.userId} />

      <DatesBar trip={trip} members={members} me={me} />

      {!anyAvailable && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm" data-testid="getting-started">
          <p className="font-medium">Getting started</p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            <li>
              <Link to={`/trip/${trip.id}/settings`} className="text-primary underline-offset-4 hover:underline">
                Set your budgets
              </Link>{' '}
              (shared with the trip unless you switch it off).
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
        {sections.map((s) =>
          s.available ? (
            <ExpandableSection key={s.id} id={s.id} label={s.label} summary={s.summary} full={s.full} />
          ) : (
            <DisabledSection key={s.id} section={s} onClick={() => info(s.label, s.notice)} />
          ),
        )}
      </div>
      </SectionStageContext.Provider>
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
function MyEssentials({ trip, members, userId }: { trip: Trip; members: Member[]; userId: string }) {
  const tripId = trip.id
  const { budget } = useMyBudget(tripId, userId)
  // Locked housing's price per person is the housing estimate; gas is your share of your car's gas.
  const housing = useHousingEstimate(tripId)
  const gas = useMyGasEstimate(trip, userId, members)
  const summary = summarizeMyBudget(budget ?? {}, { housing, gas }, ESSENTIAL_CATEGORIES)
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
