import type { HoleResult, Player, RoundWithDetails } from './database.types'

/** A hole's sole owner holds the skin ("mestari"); players tied on the low score
 * are "jaettu" and hold nothing. This mirrors the väylämestari/Skins ranking on the
 * front page — HomePage.tsx still carries its own copy of this algorithm. */

export interface CourseInfo {
  id: string
  name: string
  slug: string
  color_hex: string | null
}

export interface PlayerVaylamestariStats {
  player: Player
  totalMestari: number
  totalJaettu: number
  mestariPerCourse: Record<string, number>
  mestariHolesPerCourse: Record<string, number[]>
}

export function computeVaylamestariRanking(
  allRounds: RoundWithDetails[],
  allHoleResults: HoleResult[],
  courses: CourseInfo[],
): PlayerVaylamestariStats[] {
  const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)
  const roundById = new Map(allRounds.map(r => [r.id, r]))

  const statsMap = new Map<string, PlayerVaylamestariStats>()

  for (const course of courses) {
    const courseRoundIds = new Set(allRounds.filter(r => r.course_id === course.id).map(r => r.id))
    const courseHoleResults = allHoleResults.filter(hr => courseRoundIds.has(hr.round_id))

    for (const holeNum of HOLES) {
      const allForHole = courseHoleResults.filter(
        hr => hr.hole_number === holeNum && hr.strokes_played != null,
      )
      if (allForHole.length === 0) continue

      const minStrokes = Math.min(...allForHole.map(hr => hr.strokes_played!))
      const candidates = allForHole.filter(hr => hr.strokes_played === minStrokes)

      candidates.sort((a, b) => {
        const ra = roundById.get(a.round_id)
        const rb = roundById.get(b.round_id)
        const pd = (rb?.total_points ?? 0) - (ra?.total_points ?? 0)
        if (pd !== 0) return pd
        const hd = (rb?.hcp_at_time ?? 0) - (ra?.hcp_at_time ?? 0)
        if (hd !== 0) return hd
        return (ra?.submitted_at ?? '') < (rb?.submitted_at ?? '') ? -1 : 1
      })

      // Deduplicate by player_id (keep best per player after sort)
      const seenPlayers = new Set<string>()
      const deduped = candidates.filter(hr => {
        const pid = roundById.get(hr.round_id)?.player_id
        if (!pid || seenPlayers.has(pid)) return false
        seenPlayers.add(pid)
        return true
      })

      const winnerId = roundById.get(deduped[0]?.round_id ?? '')?.player_id ?? null

      for (const hr of deduped) {
        const round = roundById.get(hr.round_id)
        if (!round) continue
        const player = round.player as Player | undefined
        if (!player?.id) continue

        if (!statsMap.has(player.id)) {
          statsMap.set(player.id, {
            player,
            totalMestari: 0,
            totalJaettu: 0,
            mestariPerCourse: {},
            mestariHolesPerCourse: {},
          })
        }
        const s = statsMap.get(player.id)!

        if (round.player_id === winnerId) {
          s.mestariPerCourse[course.id] = (s.mestariPerCourse[course.id] ?? 0) + 1
          s.mestariHolesPerCourse[course.id] = [...(s.mestariHolesPerCourse[course.id] ?? []), holeNum]
          s.totalMestari += 1
        } else {
          s.totalJaettu += 1
        }
      }
    }
  }

  return [...statsMap.values()]
    .filter(s => s.totalMestari > 0)
    .sort((a, b) =>
      b.totalMestari !== a.totalMestari ? b.totalMestari - a.totalMestari : b.totalJaettu - a.totalJaettu,
    )
}

/** Skins held per player id, across every course in the season. Players with none
 * are absent from the ranking, so callers should default to 0. */
export function skinsByPlayerId(
  allRounds: RoundWithDetails[],
  allHoleResults: HoleResult[],
  courses: CourseInfo[],
): Map<string, number> {
  const ranking = computeVaylamestariRanking(allRounds, allHoleResults, courses)
  return new Map(ranking.map(s => [s.player.id, s.totalMestari]))
}
