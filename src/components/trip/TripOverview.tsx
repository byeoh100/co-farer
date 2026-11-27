/**
 * The trip page (co-farer-redesign/SPEC.md, Page layout): one page of cards
 * in four bands. The header (wordmark, nav, avatars, Invite) is the app
 * header; the trip adds its parts through HeaderPortal (trip layout).
 *
 *   Hero    title and chips | dates card            (1 : 1.5)
 *   Row 1   housing | Getting there over essentials  (7 : 5)
 *   Row 2   Activities | Food | Notes                (equal, 400px, scroll inside)
 *
 * 640–1023px: the hero stacks, housing goes full width with Getting there
 * next to essentials, Row 2 is two columns with Notes below. Under 640px:
 * one column. Every card keeps its ExpandableSection: its open button grows
 * it into the Full view, as before.
 */

import { useRef } from 'react'
import type { Member, Trip } from '../../lib/trip-data'
import { DatesBar } from '../dates/DatesBar'
import { HousingCard } from '../housing/HousingCard'
import { HousingFull } from '../housing/HousingFull'
import { TravelCard } from '../travel/TravelCard'
import { TravelFull } from '../travel/TravelFull'
import { NotesBoard } from '../notes/NotesBoard'
import { NotesFull } from '../notes/NotesFull'
import { Leaderboard } from '../additional/Leaderboard'
import { AdditionalFull } from '../additional/AdditionalFull'
import { EssentialsCard } from './EssentialsCard'
import { ExpandableSection, SectionStageContext } from './ExpandableSection'
import { TripHero } from './TripHero'

export function TripOverview({ trip, members, me }: { trip: Trip; members: Member[]; me: Member }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const datesLocked = trip.datesStatus === 'locked'

  return (
    <div ref={stageRef} className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pb-10 pt-5 sm:px-8">
      <SectionStageContext.Provider value={stageRef}>
        <section className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <TripHero trip={trip} members={members} />
          <DatesBar trip={trip} members={members} me={me} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[7fr_5fr]">
          {datesLocked ? (
            <ExpandableSection id="housing" label="Housing" full={<HousingFull trip={trip} members={members} me={me} />}>
              {(control) => <HousingCard trip={trip} members={members} control={control} />}
            </ExpandableSection>
          ) : (
            <HousingCard trip={trip} members={members} control={null} />
          )}
          <div className="grid content-start gap-6 sm:grid-cols-2 lg:grid-cols-1">
            <ExpandableSection id="travel" label="Getting there" full={<TravelFull trip={trip} members={members} me={me} />}>
              {(control) => <TravelCard trip={trip} members={members} me={me} control={control} />}
            </ExpandableSection>
            <EssentialsCard trip={trip} members={members} userId={me.userId} />
          </div>
        </section>

        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="trip-sections">
          <ExpandableSection id="additional" label="Activities and food" full={<AdditionalFull trip={trip} members={members} me={me} />}>
            {(control) => (
              <div className="contents" data-testid="additional-summary">
                <Leaderboard module="activities" tripId={trip.id} members={members} control={control} />
                <Leaderboard module="food" tripId={trip.id} members={members} control={control} />
              </div>
            )}
          </ExpandableSection>
          <div className="sm:col-span-2 lg:col-span-1">
            <ExpandableSection id="notes" label="Notes" full={<NotesFull trip={trip} me={me} />}>
              {(control) => <NotesBoard tripId={trip.id} me={me} control={control} />}
            </ExpandableSection>
          </div>
        </section>
      </SectionStageContext.Provider>
    </div>
  )
}
