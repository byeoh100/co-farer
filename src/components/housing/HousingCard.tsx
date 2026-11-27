/**
 * "Where we stay" on the trip overview (co-farer-redesign/SPEC.md,
 * HousingCard). The lead option as a big photo: the locked one ("Booked"),
 * else the most votes, ties to the earliest added ("Leading"). Then up to two
 * other options. Voting shows as VoterSegments, never "N of M".
 */

import { useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { rangeLength } from '../../lib/dates'
import { shortFit } from '../../lib/fit-text'
import { leadOption, leaderboard } from '../../lib/overview'
import { useBoard, useOptions, useVotes, type EngineOption, type Member, type Trip } from '../../lib/trip-data'
import { CardHeader, CardShell, Pill, PillButton, VoterSegments, money } from '../trip/cards'
import type { SectionControl } from '../trip/ExpandableSection'
import { Thumb } from '../trip/Thumb'

const WAITING = 'Housing opens once the dates are locked.'

function deadlineLabel(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** `control` is null while housing waits for the dates (the open button then explains). */
export function HousingCard({ trip, members, control }: { trip: Trip; members: Member[]; control: SectionControl | null }) {
  const { info } = useToast()
  const { board } = useBoard(trip.id, 'housing')
  const { options } = useOptions(trip.id, 'housing')
  const votes = useVotes(trip.id)
  const locked = board?.status === 'locked'
  const lead = leadOption(options, votes, locked ? board?.winningOptionId ?? null : null)
  const others = lead ? leaderboard(options.filter((o) => o.id !== lead.id), votes) : []
  const closes = deadlineLabel(board?.deadline ?? null)
  const nights = trip.datesStart && trip.datesEnd ? Math.max(1, rangeLength({ start: trip.datesStart, end: trip.datesEnd }) - 1) : null

  const openButton = !control ? (
    <PillButton variant="primary" aria-disabled="true" data-testid="section-housing" onClick={() => info('Housing', WAITING)}>
      Open housing
    </PillButton>
  ) : (
    <PillButton variant="primary" data-testid="section-housing" onClick={control.open} {...control.buttonProps}>
      Open housing
    </PillButton>
  )

  const sub = !control
    ? 'Waiting for the dates'
    : locked
      ? 'Booked'
      : `${options.length} ${options.length === 1 ? 'option' : 'options'}${closes ? ` · voting closes ${closes}` : ''}`

  return (
    <CardShell sectionId="housing" className="min-[1024px]:flex-[7_1_0%]">
      <CardHeader title="Where we stay" sub={sub} action={openButton} />
      <div data-testid="housing-summary" className="flex flex-col gap-3">
        {!control ? (
          <p className="rounded-[14px] bg-cf-surface-2 p-4 text-sm text-cf-muted">{WAITING}</p>
        ) : !lead ? (
          <p className="rounded-[14px] bg-cf-surface-2 p-4 text-sm text-cf-muted">No places yet. Open housing to get suggestions.</p>
        ) : (
          <>
            <LeadPhoto option={lead} members={members} voters={votes.get(lead.id) ?? []} locked={locked} nights={nights} />
            {!locked && others.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {others.slice(0, 2).map((o) => (
                  <OtherOption key={o.id} option={o} members={members} voters={votes.get(o.id) ?? []} />
                ))}
              </div>
            )}
            {!locked && others.length > 2 && (
              <button type="button" onClick={control.open} className="self-start rounded text-[13px] text-cf-accent-ink hover:underline">
                +{others.length - 2} more
              </button>
            )}
          </>
        )}
      </div>
    </CardShell>
  )
}

function LeadPhoto({ option, members, voters, locked, nights }: { option: EngineOption; members: Member[]; voters: string[]; locked: boolean; nights: number | null }) {
  const fit = shortFit(option.fit)
  const nightsText = nights != null && `${nights} ${nights === 1 ? 'night' : 'nights'}`
  const details = locked
    ? [nightsText, option.price != null && `$${option.price.toLocaleString()} / person`, option.total != null && `$${option.total.toLocaleString()} total`]
        .filter(Boolean)
        .join(' · ') || 'Price not found'
    : [nightsText, fit && (fit.tone === 'ok' ? 'fits everyone’s housing budget' : `▲ ${fit.text}`)].filter(Boolean).join(' · ')
  return (
    <div className="relative h-[300px] overflow-hidden rounded-2xl">
      <Thumb src={option.imageUrl} name={option.title} kind="housing" iconSize={40} className="absolute inset-0 h-full w-full items-start pt-12" />
      <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 max-w-full flex-col gap-1 rounded-[14px] bg-[rgba(17,17,17,0.85)] px-4 py-3.5">
          {locked ? <Pill tone="ok" className="self-start">Booked</Pill> : <Pill tone="accent" className="self-start">Leading</Pill>}
          <span className="font-display truncate text-[30px]" data-testid={locked ? 'locked-name' : 'lead-name'}>
            {option.title}
          </span>
          {details && (
            <span className="tabular text-[13px] text-cf-text-2" data-testid={locked ? 'locked-details' : 'lead-details'}>
              {details}
            </span>
          )}
          {!locked && (
            <div className="mt-1.5 min-w-[180px]">
              <VoterSegments members={members} voters={voters} />
            </div>
          )}
        </div>
        <div className="rounded-[14px] bg-[rgba(17,17,17,0.85)] px-4 py-3 text-right">
          {option.price != null ? (
            <>
              <span className="font-display tabular block text-[34px]">{money(option.price)}</span>
              <span className="tabular text-xs text-cf-text-2">
                per person{option.total != null && ` · ${money(option.total)} total`}
              </span>
            </>
          ) : (
            <span className="text-xs text-cf-text-2">Price not found</span>
          )}
        </div>
      </div>
    </div>
  )
}

function OtherOption({ option, members, voters }: { option: EngineOption; members: Member[]; voters: string[] }) {
  const fit = shortFit(option.fit)
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-cf-surface-2 p-2.5" data-testid="housing-other">
      <Thumb src={option.imageUrl} name={option.title} kind="housing" className="h-[72px] w-24 rounded-[10px] bg-cf-track" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate font-semibold">{option.title}</span>
        <span className="tabular text-[13px] text-cf-muted">
          {option.price != null ? `$${option.price.toLocaleString()} / person` : 'Price not found'}
          {fit && (
            <span className={cn(fit.tone === 'ok' ? 'text-cf-ok' : 'text-cf-warn')}>
              {' · '}
              {fit.tone === 'over' && '▲ '}
              {fit.text}
            </span>
          )}
        </span>
        <VoterSegments members={members} voters={voters} size="sm" />
      </div>
    </div>
  )
}
