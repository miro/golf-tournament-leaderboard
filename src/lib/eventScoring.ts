import { scopedTable } from './leagueClient'
import { getEventQuestions, getEventScores, getEventParticipants, type EventQuestion, type EventScore } from './eventQueries'

const value = (answer: any) => answer && typeof answer === 'object' && 'value' in answer ? answer.value : answer
const same = (a: any, b: any) => JSON.stringify(value(a)) === JSON.stringify(value(b))

function derive(question: EventQuestion, scores: EventScore[]): any {
  const key = question.question_type.key
  const sorted = [...scores].sort((a, b) => b.total_points - a.total_points || a.submitted_at.localeCompare(b.submitted_at))
  const target = String(question.parameters.player_id ?? question.parameters.target_player_id ?? '')
  if (key === 'slider_player_points') return scores.find(s => s.player_id === target)?.total_points ?? null
  if (key === 'player_pick_best_total') return sorted[0]?.player_id ?? null
  if (key === 'player_pick_best_scratch') return [...scores].sort((a, b) => (a.total_strokes ?? 999) - (b.total_strokes ?? 999) || a.submitted_at.localeCompare(b.submitted_at))[0]?.player_id ?? null
  if (key === 'player_pick_best_front' || key === 'player_pick_best_back') {
    const front = key.endsWith('front')
    const totals = scores.map(score => ({ id: score.player_id, points: (score.holes ?? []).filter(h => front ? h.hole_number <= 9 : h.hole_number >= 10).reduce((sum, h) => sum + h.points, 0) }))
    return totals.sort((a, b) => b.points - a.points)[0]?.id ?? null
  }
  if (key === 'yes_no_birdie') return scores.some(s => (s.holes ?? []).some(h => h.points >= 3))
  if (key === 'yes_no_zero') return scores.some(s => (s.holes ?? []).some(h => h.points === 0))
  if (key === 'yes_no_four_birdies') return scores.some(s => (s.holes ?? []).filter(h => h.points >= 3).length >= 4)
  if (key === 'yes_no_head_to_head') {
    const a = scores.find(s => s.player_id === question.parameters.player_a_id)?.total_points ?? -1
    const b = scores.find(s => s.player_id === question.parameters.player_b_id)?.total_points ?? -1
    return a >= b ? question.parameters.player_a_id : question.parameters.player_b_id
  }
  if (key === 'podium_top3') return { first: sorted[0]?.player_id ?? null, second: sorted[1]?.player_id ?? null, third: sorted[2]?.player_id ?? null }
  if (key === 'beat_the_leader') {
    const targetScore = scores.find(s => s.player_id === target)?.total_points ?? -1
    return sorted.find(s => s.player_id !== target && s.total_points > targetScore)?.player_id ?? null
  }
  return null
}

function pointsFor(question: EventQuestion, answer: any, correct: any): number {
  const key = question.question_type.key
  if (key === 'slider_player_points') { const diff = Math.abs(Number(value(answer)) - Number(correct)); return diff <= 2 ? 5 : diff <= 5 ? 2 : 0 }
  if (key === 'podium_top3') {
    const a = value(answer) ?? {}; const c = value(correct) ?? {}; const positions = ['first', 'second', 'third']; const exact = positions.filter(p => a[p] === c[p]).length; const any = positions.filter(p => Object.values(c).includes(a[p])).length
    return exact === 3 ? 8 : any === 3 ? 4 : any === 2 ? 2 : any === 1 ? 1 : 0
  }
  return same(answer, correct) ? question.question_type.max_points : 0
}

export async function scoreEvent(eventId: string) {
  const [questions, scores, participants] = await Promise.all([getEventQuestions(eventId), getEventScores(eventId), getEventParticipants(eventId)])
  for (const question of questions) {
    const correct = derive(question, scores)
    await scopedTable('betting_questions').update({ correct_answer: correct }).eq('id', question.id)
  }
  const { data: bets, error } = await scopedTable('bets').select('*, participant:betting_participants!inner(event_id), question:betting_questions!inner(event_id, question_type:betting_question_types(*))').eq('participant.event_id', eventId)
  if (error) throw error
  const questionMap = new Map(questions.map(q => [q.id, q]))
  const totals = new Map(participants.map(p => [p.id, 0]))
  for (const bet of (bets ?? []) as any[]) {
    const question = questionMap.get(bet.question_id)
    if (!question) continue
    const awarded = pointsFor(question, bet.answer, derive(question, scores))
    totals.set(bet.participant_id, (totals.get(bet.participant_id) ?? 0) + awarded)
    await scopedTable('bets').update({ points_awarded: awarded, points_breakdown: { correct: derive(question, scores), awarded } }).eq('id', bet.id)
  }
  for (const participant of participants) await scopedTable('betting_participants').update({ total_points_awarded: totals.get(participant.id) ?? 0 }).eq('id', participant.id)
}
