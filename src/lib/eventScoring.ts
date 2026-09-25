import { scopedTable } from './leagueClient'
import { getEventPlayers, getEventQuestions, getEventScores, getEventParticipants, type EventQuestion } from './eventQueries'
import { resolveQuestion, scoreAnswer, type Resolution } from './eventResolvers'

function resolvedAnswer(resolution: Resolution): any {
  return resolution.status === 'resolved' ? resolution.answer : null
}

export async function scoreEvent(eventId: string) {
  const [questions, scores, eventPlayers, participants] = await Promise.all([
    getEventQuestions(eventId),
    getEventScores(eventId),
    getEventPlayers(eventId),
    getEventParticipants(eventId),
  ])
  const resolverPlayers = eventPlayers.map(({ player }) => ({ id: player.id, full_name: player.full_name }))
  const resolutions = new Map<EventQuestion, Resolution>()

  for (const question of questions) {
    const resolution = resolveQuestion(question, scores, resolverPlayers)
    resolutions.set(question, resolution)
    await scopedTable('betting_questions').update({ correct_answer: resolvedAnswer(resolution) }).eq('id', question.id)
  }

  const { data: bets, error } = await scopedTable('bets')
    .select('*, participant:betting_participants!inner(event_id, event:league_events!inner(league_id)), question:betting_questions!inner(event_id, question_type:betting_question_types(*))')
    .eq('participant.event_id', eventId)
  if (error) throw error

  const questionMap = new Map(questions.map(question => [question.id, question]))
  const totals = new Map(participants.map(participant => [participant.id, 0]))
  for (const bet of (bets ?? []) as any[]) {
    const question = questionMap.get(bet.question_id)
    if (!question) continue
    const resolution = resolutions.get(question) ?? resolveQuestion(question, scores, resolverPlayers)
    const awarded = scoreAnswer(question, bet.answer, resolution)
    totals.set(bet.participant_id, (totals.get(bet.participant_id) ?? 0) + awarded)
    await scopedTable('bets')
      .update({ points_awarded: awarded, points_breakdown: { correct: resolvedAnswer(resolution), awarded } })
      .eq('id', bet.id)
  }
  for (const participant of participants) {
    await scopedTable('betting_participants')
      .update({ total_points_awarded: totals.get(participant.id) ?? 0 })
      .eq('id', participant.id)
  }
}
