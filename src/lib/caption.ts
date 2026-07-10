import type { Player, Course, LeaderboardEntry, RoundWithDetails, HoleResult } from './database.types'
import { buildStandingsFromRounds } from './standings'

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

export function generatePostRoundCaption(
  selectedRounds: RoundWithDetails[],
  cutoffTimestamp: string | null,
  allSeasonRounds: RoundWithDetails[],
  leaderboard: LeaderboardEntry[],
): string {
  const playerMap = new Map<string, Player>()
  selectedRounds.forEach(r => { if (r.player && !playerMap.has(r.player_id)) playerMap.set(r.player_id, r.player) })
  const players = [...playerMap.values()]
  const names = players.map(p => p.full_name)

  const courseMap = new Map<string, Course>()
  selectedRounds.forEach(r => { if (r.course && !courseMap.has(r.course_id)) courseMap.set(r.course_id, r.course) })
  const courses = [...courseMap.values()]
  const isMulti = courses.length > 1

  const namesJoined = names.length === 1
    ? names[0]
    : names.length === 2
    ? `${names[0]} ja ${names[1]}`
    : `${names.slice(0, -1).join(', ')} ja ${names[names.length - 1]}`

  let intro: string
  if (isMulti) {
    const courseNames = courses.map(c => c.name)
    const coursesJoined = courseNames.length === 2
      ? `${courseNames[0]} ja ${courseNames[1]}`
      : `${courseNames.slice(0, -1).join(', ')} ja ${courseNames[courseNames.length - 1]}`
    intro = `⛳ ${namesJoined} pelasivat — ${coursesJoined}.`
  } else {
    const genitive = COURSE_GENITIVE[courses[0]?.slug ?? ''] ?? courses[0]?.name ?? ''
    intro = names.length === 1
      ? `⛳ ${namesJoined} pelasi ${genitive}.`
      : `⛳ ${namesJoined} pelasivat ${genitive}.`
  }

  const beforeRounds = cutoffTimestamp === null ? [] : allSeasonRounds.filter(r => r.submitted_at < cutoffTimestamp)
  const beforeStandings = buildStandingsFromRounds(beforeRounds)
  const afterStandings = leaderboard

  const resultLines = players.map(p => {
    const points = selectedRounds.filter(r => r.player_id === p.id).reduce((sum, r) => sum + r.total_points, 0)
    const stblDelta = 36 - points
    const stblText = stblDelta < 0 ? `${stblDelta}` : stblDelta === 0 ? 'E' : `+${stblDelta}`

    const before = beforeStandings.find(e => e.player.id === p.id)
    const afterRank = afterStandings.find(e => e.player.id === p.id)?.rank

    let rankChangeText = ''
    if (!before) {
      rankChangeText = afterRank ? `debytoi sijalla ${afterRank}` : 'debytoi sarjassa'
    } else if (afterRank !== undefined) {
      if (afterRank < before.rank) rankChangeText = `nousi sijalle ${afterRank}`
      else if (afterRank > before.rank) rankChangeText = `putosi sijalle ${afterRank}`
      else rankChangeText = `pysyi sijalla ${afterRank}`
    }

    return `${p.full_name}: ${points}p (${stblText})${rankChangeText ? `, ${rankChangeText}` : ''}.`
  })

  const beforeLeaderId = beforeStandings[0]?.player.id
  const afterLeader = afterStandings[0]
  const standingsLine = afterLeader
    ? (beforeLeaderId && beforeLeaderId !== afterLeader.player.id
      ? `${afterLeader.player.full_name} nousi kärkeen!`
      : `${afterLeader.player.full_name} johtaa ${afterLeader.total_points}p:llä.`)
    : ''

  return [intro, ...resultLines, standingsLine, 'Sarjataulukko: liekkipoika.com'].filter(Boolean).join('\n')
}
