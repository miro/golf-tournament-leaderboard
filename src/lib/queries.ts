import { supabase } from './supabase'
import type { Season, Course, Player, LeaderboardEntry, RoundWithDetails, HoleResult } from './database.types'

export async function getCurrentSeason(): Promise<Season> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('status', 'active')
    .order('year', { ascending: false })
    .limit(1)
    .single()
  if (error) throw error
  return data as unknown as Season
}

export async function getSeasonCourses(seasonId: string): Promise<Array<{ id: string; season_id: string; course_id: string; display_order: number; course: Course }>> {
  const { data, error } = await supabase
    .from('season_courses')
    .select('*, course:courses(*)')
    .eq('season_id', seasonId)
    .order('display_order')
  if (error) throw error
  return (data ?? []) as unknown as Array<{ id: string; season_id: string; course_id: string; display_order: number; course: Course }>
}

export async function getLeaderboard(seasonId: string): Promise<LeaderboardEntry[]> {
  const { data: rounds, error } = await supabase
    .from('rounds')
    .select('player_id, total_points, course_id, player:players(*)')
    .eq('season_id', seasonId)
    .eq('status', 'published')

  if (error) throw error

  const map = new Map<string, LeaderboardEntry>()
  for (const r of (rounds ?? []) as unknown as Array<{ player_id: string; total_points: number; course_id: string; player: Player | Player[] }>) {
    const existing = map.get(r.player_id)
    const player = Array.isArray(r.player) ? r.player[0] : r.player
    if (!player) continue
    if (existing) {
      existing.total_points += r.total_points
      existing.rounds_played += 1
      existing.courses_played.push(r.course_id)
    } else {
      map.set(r.player_id, {
        player,
        total_points: r.total_points,
        rounds_played: 1,
        rank: 0,
        courses_played: [r.course_id],
      })
    }
  }

  const sorted = [...map.values()].sort((a, b) => b.total_points - a.total_points)
  sorted.forEach((e, i) => { e.rank = i + 1 })
  return sorted
}

export async function getRecentRounds(seasonId: string, limit = 10): Promise<RoundWithDetails[]> {
  const { data, error } = await supabase
    .from('rounds')
    .select('*, player:players(*), course:courses(*)')
    .eq('season_id', seasonId)
    .eq('status', 'published')
    .order('submitted_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as RoundWithDetails[]).map(r => ({
    ...r,
    player: Array.isArray(r.player) ? r.player[0] : r.player,
    course: Array.isArray(r.course) ? r.course[0] : r.course,
  }))
}

export async function getAllSeasonRounds(seasonId: string): Promise<RoundWithDetails[]> {
  const { data, error } = await supabase
    .from('rounds')
    .select('*, player:players(*), course:courses(*)')
    .eq('season_id', seasonId)
    .eq('status', 'published')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as RoundWithDetails[]).map(r => ({
    ...r,
    player: Array.isArray(r.player) ? r.player[0] : r.player,
    course: Array.isArray(r.course) ? r.course[0] : r.course,
  }))
}

export async function getActivePlayers(): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('active', true)
    .order('full_name')
  if (error) throw error
  return (data ?? []) as unknown as Player[]
}

export async function getCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('name')
  if (error) throw error
  return (data ?? []) as unknown as Course[]
}

export async function getPlayerBySlug(slug: string): Promise<Player> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('slug', slug)
    .single()
  if (error) throw error
  return data as unknown as Player
}

export async function getPlayerRounds(playerId: string, seasonId: string): Promise<RoundWithDetails[]> {
  const { data, error } = await supabase
    .from('rounds')
    .select('*, player:players(*), course:courses(*)')
    .eq('player_id', playerId)
    .eq('season_id', seasonId)
    .eq('status', 'published')
    .order('played_date', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as RoundWithDetails[]).map(r => ({
    ...r,
    player: Array.isArray(r.player) ? r.player[0] : r.player,
    course: Array.isArray(r.course) ? r.course[0] : r.course,
  }))
}

export async function getCourseBySlug(slug: string): Promise<Course> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .single()
  if (error) throw error
  return data as unknown as Course
}

export async function getCourseRounds(courseId: string, seasonId: string): Promise<RoundWithDetails[]> {
  const { data, error } = await supabase
    .from('rounds')
    .select('*, player:players(*), course:courses(*)')
    .eq('course_id', courseId)
    .eq('season_id', seasonId)
    .eq('status', 'published')
    .order('total_points', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as RoundWithDetails[]).map(r => ({
    ...r,
    player: Array.isArray(r.player) ? r.player[0] : r.player,
    course: Array.isArray(r.course) ? r.course[0] : r.course,
  }))
}

export async function getHoleResultsForRounds(roundIds: string[]): Promise<HoleResult[]> {
  if (roundIds.length === 0) return []
  const { data, error } = await supabase
    .from('hole_results')
    .select('*')
    .in('round_id', roundIds)
  if (error) throw error
  return (data ?? []) as unknown as HoleResult[]
}

export async function getSeasonRoundAverages(seasonId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('rounds')
    .select('course_id, total_points')
    .eq('season_id', seasonId)
    .eq('status', 'published')
  if (error) throw error
  const byCourse = new Map<string, number[]>()
  for (const r of (data ?? []) as Array<{ course_id: string; total_points: number }>) {
    const arr = byCourse.get(r.course_id) ?? []
    arr.push(r.total_points)
    byCourse.set(r.course_id, arr)
  }
  const result: Record<string, number> = {}
  for (const [id, pts] of byCourse.entries()) {
    if (pts.length >= 2) {
      result[id] = pts.reduce((a, b) => a + b, 0) / pts.length
    }
  }
  return result
}

export function generateWhatsAppText(
  playerName: string,
  courseName: string,
  points: number,
  rank: number,
  totalPlayers: number,
  isBackfill: boolean,
  playedDate?: string,
): string {
  const rankText =
    rank === 1 ? '🥇 Johtopaikalla' :
    rank === 2 ? '🥈 Toisena' :
    rank === 3 ? '🥉 Kolmantena' :
    `${rank}. sijalla`
  const backfillNote = isBackfill && playedDate ? ` (pelattiin ${playedDate})` : ''
  return (
    `⛳ Golf Company Liekkipoika Kesäkisa 2026\n\n` +
    `${playerName} pelasi kentällä ${courseName}${backfillNote}\n` +
    `Tulos: ${points} pistettä\n\n` +
    `${rankText} — ${rank}/${totalPlayers} pelaajaa\n\n` +
    `#GolfCompany #Liekkipoika2026 #kesäkisa`
  )
}
