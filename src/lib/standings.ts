import type { LeaderboardEntry, RoundWithDetails } from './database.types'

/** In-memory equivalent of queries.ts's getLeaderboard, for building a standings
 * snapshot from an already-fetched (and possibly time-filtered) set of rounds. */
export function buildStandingsFromRounds(rounds: RoundWithDetails[]): LeaderboardEntry[] {
  const map = new Map<string, LeaderboardEntry>()
  for (const r of rounds) {
    if (!r.player) continue
    const existing = map.get(r.player_id)
    if (existing) {
      existing.total_points += r.total_points
      existing.rounds_played += 1
      existing.courses_played.push(r.course_id)
      existing.points_by_course[r.course_id] = (existing.points_by_course[r.course_id] ?? 0) + r.total_points
    } else {
      map.set(r.player_id, {
        player: r.player,
        total_points: r.total_points,
        rounds_played: 1,
        rank: 0,
        courses_played: [r.course_id],
        points_by_course: { [r.course_id]: r.total_points },
      })
    }
  }

  const sorted = [...map.values()].sort((a, b) => b.total_points - a.total_points)
  sorted.forEach((e, i) => { e.rank = i + 1 })
  return sorted
}

/** Bracket target for the jälkikortti TAVOITE section: the best total among active
 * players (outside the given group) who had exactly `roundsPlayed + 1` rounds in the
 * given standings snapshot. No nearest-bracket fallback — absent pool means no target. */
export function findBracketTarget(
  roundsPlayedBefore: number,
  standings: LeaderboardEntry[],
  excludeIds: Set<string>,
): LeaderboardEntry | null {
  const coursesAfter = roundsPlayedBefore + 1
  const pool = standings.filter(e => e.player.active && !excludeIds.has(e.player.id) && e.rounds_played === coursesAfter)
  return pool.reduce<LeaderboardEntry | null>(
    (best, e) => (!best || e.total_points > best.total_points ? e : best),
    null,
  )
}

/** Rank 1 plus every player in requiredIds, sorted by rank, with 'gap' markers
 * inserted wherever the rank sequence skips — same shape as StarttipakettCard's
 * SARJATILANNE list, reused here for the jälkikortti's SARJATAULUKKO section. */
export function buildRelevantStandingsList(
  standings: LeaderboardEntry[],
  requiredIds: Set<string>,
): (LeaderboardEntry | 'gap')[] {
  if (standings.length === 0) return []

  const ids = new Set(requiredIds)
  ids.add(standings[0].player.id)

  const relevant = standings
    .filter(e => ids.has(e.player.id))
    .sort((a, b) => a.rank - b.rank)

  const result: (LeaderboardEntry | 'gap')[] = []
  relevant.forEach((e, i) => {
    if (i > 0 && e.rank - relevant[i - 1].rank > 1) result.push('gap')
    result.push(e)
  })
  return result
}
