/**
 * Activities and Food on the trip overview (co-farer-redesign/SPEC.md,
 * Leaderboard): the same component for both lists, ranked by votes then by
 * when added, inside a 400px card that scrolls. "+ Suggest" opens the
 * existing Additional view, where both lists' add flows live.
 */

import { cn } from '@/lib/utils'
import { leaderboard, voteShare } from '../../lib/overview'
import { useOptions, useVotes, type EngineOption, type Member } from '../../lib/trip-data'
import { Bar, CardHeader, CardShell, PillButton } from '../trip/cards'
import type { SectionControl } from '../trip/ExpandableSection'
import { ScrollArea } from '../trip/ScrollArea'
import { Thumb } from '../trip/Thumb'
import { useFoodWarnings } from './RankedList'

const COPY = {
  activities: { title: 'Activities', noun: ['idea', 'ideas'] },
  food: { title: 'Food', noun: ['spot', 'spots'] },
} as const

export function Leaderboard({
  module, tripId, members, control,
}: {
  module: 'activities' | 'food'
  tripId: string
  members: Member[]
  control: SectionControl
}) {
  const { options } = useOptions(tripId, module)
  const votes = useVotes(tripId)
  const warningFor = useFoodWarnings(tripId, members)
  const rows = leaderboard(options, votes)
  const copy = COPY[module]

  return (
    <CardShell sectionId="additional" className="h-[400px] gap-2.5" testId={`summary-${module}`}>
      <CardHeader
        title={copy.title}
        sub={`${rows.length} ${rows.length === 1 ? copy.noun[0] : copy.noun[1]} · ranked by votes`}
        action={
          <PillButton size="sm" data-testid={module === 'activities' ? 'section-additional' : 'section-additional-food'} onClick={control.open} {...control.buttonProps}>
            + Suggest
          </PillButton>
        }
      />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-cf-muted">No ideas yet</p>
      ) : (
        <ScrollArea label={`${copy.title}, ranked by votes`}>
          <ol>
            {rows.map((o, i) => (
              <Row key={o.id} option={o} rank={i + 1} votes={votes.get(o.id)?.length ?? 0} memberCount={members.length} warning={module === 'food' ? warningFor(o) : null} module={module} />
            ))}
          </ol>
        </ScrollArea>
      )}
    </CardShell>
  )
}

function Row({
  option, rank, votes, memberCount, warning, module,
}: {
  option: EngineOption
  rank: number
  votes: number
  memberCount: number
  warning: { text: string } | null
  module: 'activities' | 'food'
}) {
  const first = rank === 1
  const cost = option.price == null ? 'Price not found' : option.price === 0 ? 'Free' : `~$${option.price} / person`
  const voteText = `${votes} ${votes === 1 ? 'vote' : 'votes'}`
  return (
    <li className="flex items-center gap-3 border-t border-cf-line py-[9px]" data-testid="summary-tile">
      <span className={cn('font-display tabular w-[22px] shrink-0 text-[26px]', first ? 'text-cf-accent-ink' : 'text-cf-faint')} aria-label={`Rank ${rank}`}>
        {rank}
      </span>
      <Thumb src={option.imageUrl} name={option.title} kind={module} iconSize={18} className="h-11 w-[60px] rounded-[10px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <div className="flex justify-between gap-2">
          <span className="truncate font-semibold">{option.title}</span>
          <span className="shrink-0 text-xs text-cf-muted">{voteText}</span>
        </div>
        <Bar
          value={voteShare(votes, memberCount)}
          label={`${voteText} of ${memberCount} ${memberCount === 1 ? 'member' : 'members'}`}
          height={6}
          track="var(--cf-line)"
          color={first ? 'var(--cf-accent)' : 'var(--cf-neutral-bar)'}
        />
        <span className={cn('truncate text-xs tabular', warning ? 'text-cf-warn' : 'text-cf-muted')}>
          {warning ? (
            <span data-testid="tile-warning">▲ {warning.text}</span>
          ) : (
            <>
              {cost}
              {option.research?.summary && ` · ${option.research.summary}`}
            </>
          )}
        </span>
      </div>
    </li>
  )
}
