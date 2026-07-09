import type { Player, Course, LeaderboardEntry, RoundWithDetails, HoleResult } from './database.types'

const COURSE_LOCATIVE: Record<string, string> = {
  kajaani: 'Kajaanille',
  nuas: 'Nuasille',
  tenetti: 'Tenetille',
  paltamo: 'Paltamolle',
}

const COURSE_GENITIVE: Record<string, string> = {
  kajaani: 'Kajaanin',
  nuas: 'Nuasin',
  tenetti: 'Tenetin',
  paltamo: 'Paltamon',
}

export function computeSkinsKing(
  courseRounds: RoundWithDetails[],
  holeResults: HoleResult[],
): { name: string; count: number } | null {
  if (courseRounds.length === 0) return null

  const roundById = new Map(courseRounds.map(r => [r.id, r]))
  const counts = new Map<string, number>()

  for (let holeNum = 1; holeNum <= 18; holeNum++) {
    const holeData = holeResults.filter(hr => hr.hole_number === holeNum && hr.strokes_played != null && roundById.has(hr.round_id))
    if (holeData.length === 0) continue

    const minStrokes = Math.min(...holeData.map(hr => hr.strokes_played!))
    const candidates = holeData.filter(hr => hr.strokes_played === minStrokes)
    candidates.sort((a, b) => {
      const ra = roundById.get(a.round_id)
      const rb = roundById.get(b.round_id)
      const pd = (rb?.total_points ?? 0) - (ra?.total_points ?? 0)
      if (pd !== 0) return pd
      const hd = (rb?.hcp_at_time ?? 0) - (ra?.hcp_at_time ?? 0)
      if (hd !== 0) return hd
      return (ra?.submitted_at ?? '') < (rb?.submitted_at ?? '') ? -1 : 1
    })

    const winnerId = roundById.get(candidates[0].round_id)?.player_id
    if (winnerId) counts.set(winnerId, (counts.get(winnerId) ?? 0) + 1)
  }

  if (counts.size === 0) return null
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const [topId, topCount] = sorted[0]
  if (sorted.length > 1 && sorted[1][1] === topCount) return null

  const name = courseRounds.find(r => r.player_id === topId)?.player?.full_name
  return name ? { name, count: topCount } : null
}

export function generateCaption(
  selectedPlayers: Player[],
  course: Course,
  leaderboard: LeaderboardEntry[],
  courseRounds: RoundWithDetails[],
  skinsKing: { name: string; count: number } | null,
): string {
  const names = selectedPlayers.map(p => p.full_name)
  const locative = COURSE_LOCATIVE[course.slug] ?? `${course.name}lle`
  const genitive = COURSE_GENITIVE[course.slug] ?? course.name

  let intro: string
  if (names.length === 1) {
    intro = `⛳ ${names[0]} lähtee ${locative}.`
  } else if (names.length === 2) {
    intro = `⛳ ${names[0]} ja ${names[1]} lähtevät ${locative}.`
  } else {
    intro = `⛳ ${names.slice(0, -1).join(', ')} ja ${names[names.length - 1]} lähtevät ${locative}.`
  }

  const standingsLines = selectedPlayers
    .map(p => leaderboard.find(e => e.player.id === p.id))
    .filter((e): e is LeaderboardEntry => !!e && e.rounds_played > 0)
    .map(e => {
      const coursesPlayed = new Set(e.courses_played).size
      const holesPlayed = e.rounds_played * 18
      const avg = (e.total_points / holesPlayed).toFixed(1)
      return `${e.player.full_name} ${e.rank}. (${e.total_points}p, ${coursesPlayed}/4 kenttää, ${avg}p/väylä)`
    })

  const anyNotPlayed = selectedPlayers.some(p => !courseRounds.find(r => r.player_id === p.id))
  const tikkariLine = anyNotPlayed ? 'Tikkarit jaossa 🍭' : ''

  const skinsLine = skinsKing ? `${skinsKing.name} hallitsee ${genitive} skinejä — ${skinsKing.count} skiniä 👑` : ''

  return [intro, ...standingsLines, tikkariLine, skinsLine, 'Seuraa tilannetta: liekkipoika.com'].filter(Boolean).join('\n')
}
