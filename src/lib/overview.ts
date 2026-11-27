/**
 * Pure helpers for the redesigned overview and homepage
 * (co-farer-redesign/SPEC.md, Data rules). No reads or writes here.
 */

export interface RankableOption {
  id: string
  createdAt: string
}

/**
 * The housing option to feature: the locked one if housing is locked;
 * otherwise the most votes, ties going to the earliest added. Null when
 * there are no options.
 */
export function leadOption<T extends RankableOption>(options: T[], votes: Map<string, string[]>, lockedId: string | null): T | null {
  if (lockedId) {
    const locked = options.find((o) => o.id === lockedId)
    if (locked) return locked
  }
  return leaderboard(options, votes)[0] ?? null
}

/** Votes (most first), then when added (oldest first). */
export function leaderboard<T extends RankableOption>(options: T[], votes: Map<string, string[]>): T[] {
  const n = (o: T) => votes.get(o.id)?.length ?? 0
  return [...options].sort((a, b) => n(b) - n(a) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

/** A vote bar's width: votes ÷ current members, as a percentage, capped at 100. */
export function voteShare(votes: number, memberCount: number): number {
  if (memberCount <= 0 || votes <= 0) return 0
  return Math.min(100, Math.round((votes / memberCount) * 100))
}

/** Seats left across cars: the sum of (seats − riders) over cars that still have room. */
export function seatsLeft(cars: Array<{ seats: number; riders: string[] }>): number {
  return cars.reduce((sum, c) => sum + Math.max(0, c.seats - c.riders.length), 0)
}

/** "Picked by Maya, Jordan and Sam" / "Picked by Maya" / "No picks yet". */
export function pickedByLabel(names: string[]): string {
  if (!names.length) return 'No picks yet'
  if (names.length === 1) return `Picked by ${names[0]}`
  return `Picked by ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Whole days from `today` (YYYY-MM-DD) until `date` (YYYY-MM-DD); negative if past. */
export function daysUntil(date: string, today: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}
