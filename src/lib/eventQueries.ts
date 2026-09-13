import { scopedTable, getActiveLeagueId } from './leagueClient'
import type { Course, Player } from './database.types'

export type EventStatus = 'draft' | 'betting_open' | 'betting_closed' | 'scoring' | 'results_ready' | 'presented'
export type EventRow = {
  id: string; league_id: string; name: string; event_date: string; course_id: string | null
  status: EventStatus; betting_url_token: string; participant_code: string | null; created_at: string; course?: Pick<Course, 'name' | 'par_total'> | null
}
export type EventPlayer = { event_id: string; player_id: string; display_order: number; player: Player }
export type QuestionType = { id: string; key: string; display_name: string; description: string; max_points: number; requires_target_player: boolean; active: boolean }
export type EventQuestion = { id: string; event_id: string; question_type_id: string; question_type_key: string | null; display_order: number; question_text: string | null; points_possible: number | null; parameters: Record<string, unknown>; correct_answer: unknown; question_type: QuestionType }
export type EventParticipant = { id: string; event_id: string; display_name: string; emoji_pin: string | null; pin: string | null; identity_token: string | null; bettor_account_id: string | null; is_event_player: boolean; submitted_at: string; total_points_awarded: number }
export type EventScore = { id: string; event_id: string; player_id: string; played_date: string; total_points: number; total_strokes: number | null; submitted_at: string; is_corrected: boolean; player?: Player; holes?: Array<{ id: string; event_score_id: string; hole_number: number; points: number }> }

export function canonicalQuestionTypeKey(row: any): string {
  if (typeof row.key === 'string' && row.key.trim()) return row.key
  if (typeof row.question_type_key === 'string' && row.question_type_key.trim()) return row.question_type_key
  if (typeof row.type_key === 'string' && row.type_key.trim()) return row.type_key
  const text = `${row.display_name ?? ''} ${row.description ?? ''}`.toLocaleLowerCase()
  if (text.includes('päihittää') || text.includes('johtaj')) return 'beat_the_leader'
  if (text.includes('scratch')) return 'player_pick_best_scratch'
  if (text.includes('etuyhdeksän') || text.includes('etuysi')) return 'player_pick_best_front'
  if (text.includes('takayhdeksän') || text.includes('takaysi')) return 'player_pick_best_back'
  if (text.includes('parhaan tuloksen') || text.includes('eniten stableford')) return 'player_pick_best_total'
  if (text.includes('yksittäinen pelaaja') || text.includes('paljonko pisteitä')) return 'slider_player_points'
  if (text.includes('neljä birdie') || text.includes('vähintään 4 birdie')) return 'yes_no_four_birdies'
  if (text.includes('nollatulos') || text.includes('nollapiste')) return 'yes_no_zero'
  if (text.includes('birdie')) return 'yes_no_birdie'
  if (text.includes('top 3') || text.includes('podium')) return 'podium_top3'
  if (text.includes('pää vastaan pää') || text.includes('kaksintaistelu')) return 'yes_no_head_to_head'
  return String(row.slug ?? row.display_name ?? '')
}

export function normalizeEventQuestion(row: any): EventQuestion {
  const embeddedType = Array.isArray(row.question_type)
    ? row.question_type[0] ?? {}
    : row.question_type ?? {}
  const questionType = {
    ...embeddedType,
    question_type_key: embeddedType.question_type_key ?? row.question_type_key,
    type_key: embeddedType.type_key ?? row.type_key,
    slug: embeddedType.slug ?? row.slug,
    id: embeddedType.id ?? row.question_type_id,
    display_name: embeddedType.display_name ?? row.question_text ?? '',
    description: embeddedType.description ?? '',
    max_points: embeddedType.max_points ?? row.points_possible ?? 0,
    requires_target_player: embeddedType.requires_target_player ?? false,
  }
  return {
    ...row,
    question_type: {
      ...questionType,
      key: canonicalQuestionTypeKey(questionType),
    },
  } as EventQuestion
}

export async function getLeagueEvents(): Promise<EventRow[]> {
  const { data, error } = await scopedTable('league_events').select('*, course:courses(name)').order('event_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as EventRow[]
}

export async function getLeagueEvent(id: string): Promise<EventRow> {
  const { data, error } = await scopedTable('league_events').select('*, course:courses(name)').eq('id', id).single()
  if (error) throw error
  return data as unknown as EventRow
}

export async function getEventPlayers(eventId: string): Promise<EventPlayer[]> {
  const { data, error } = await scopedTable('league_event_players').select('*, player:players(*), event:league_events!inner(league_id)').eq('event_id', eventId).order('display_order')
  if (error) throw error
  return (data ?? []) as unknown as EventPlayer[]
}

export async function getActiveQuestionTypes(): Promise<QuestionType[]> {
  const { data, error } = await scopedTable('betting_question_types').select('*').eq('active', true).order('display_name')
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row, key: canonicalQuestionTypeKey(row) })) as QuestionType[]
}

export async function getEventQuestions(eventId: string): Promise<EventQuestion[]> {
  const { data, error } = await scopedTable('betting_questions').select('*, question_type:betting_question_types(*), event:league_events!inner(league_id)').eq('event_id', eventId).order('display_order')
  if (error) throw error
  return (data ?? []).map(normalizeEventQuestion)
}

export async function getEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const { data, error } = await scopedTable('betting_participants').select('*, event:league_events!inner(league_id)').eq('event_id', eventId).order('submitted_at')
  if (error) throw error
  return (data ?? []) as EventParticipant[]
}

export async function getEventScores(eventId: string): Promise<EventScore[]> {
  const [{ data: scores, error }, { data: holes, error: holeError }] = await Promise.all([
    scopedTable('event_scores').select('*, player:players(*), event:league_events!inner(league_id)').eq('event_id', eventId).order('submitted_at'),
    scopedTable('event_hole_results').select('*, score:event_scores!inner(event_id, event:league_events!inner(league_id))').eq('score.event_id', eventId).order('hole_number'),
  ])
  if (error) throw error
  if (holeError) throw holeError
  const byScore = new Map<string, EventScore>()
  for (const score of (scores ?? []) as unknown as EventScore[]) byScore.set(score.id, { ...score, holes: [] })
  for (const hole of (holes ?? []) as any[]) byScore.get(hole.event_score_id)?.holes?.push(hole)
  return [...byScore.values()]
}

export async function createEvent(payload: { name: string; event_date: string; course_id: string | null; participant_code: string | null; playerIds: string[]; questions: Array<{ question_type_id: string; question_type_key: string; question_text: string; points_possible: number; display_order: number; parameters: Record<string, unknown> }> }) {
  const { data: event, error } = await scopedTable('league_events').insert({ league_id: getActiveLeagueId(), name: payload.name, event_date: payload.event_date, course_id: payload.course_id, participant_code: payload.participant_code, status: 'draft' }).select().single()
  if (error) throw error
  const eventId = (event as any).id as string
  const players = payload.playerIds.map((player_id, i) => ({ event_id: eventId, player_id, display_order: i + 1 }))
  if (players.length) {
    const { error: playerError } = await scopedTable('league_event_players').insert(players)
    if (playerError) throw playerError
  }
  const { error: questionError } = await scopedTable('betting_questions').insert(payload.questions.map(q => ({ event_id: eventId, question_type_id: q.question_type_id, question_type_key: q.question_type_key, question_text: q.question_text, points_possible: q.points_possible, display_order: q.display_order, parameters: q.parameters })))
  if (questionError) throw questionError
  return eventId
}
