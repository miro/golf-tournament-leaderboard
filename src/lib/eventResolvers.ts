import type { EventQuestion, EventScore } from './eventQueries'
import { COMPOSITION_HOLE_PARS, compositionCounts, compositionPoints, type CompositionLineAnswer, type HoleCategory } from '../pages/proto/bet/types.ts'

export type ResolverPlayer = { id: string; full_name: string }

export type Resolved<T = unknown> = {
  status: 'resolved'
  answer: T
  warning?: string
}

export type Unresolved = {
  status: 'unresolved'
  reason: string
}

export type Resolution<T = unknown> = Resolved<T> | Unresolved
export type PodiumAnswer = { first: string | null; second: string | null; third: string | null }

const FIELD_KEYS = new Set([
  'player_pick_best_total',
  'player_pick_best_front',
  'player_pick_best_back',
  'player_pick_best_scratch',
  'yes_no_four_birdies',
  'yes_no_birdie',
  'yes_no_zero',
  'podium_top3',
])

function eventScores(scores: readonly EventScore[], players: readonly ResolverPlayer[]): EventScore[] {
  if (!players.length) return [...scores]
  const ids = new Set(players.map(player => player.id))
  return scores.filter(score => ids.has(score.player_id))
}

function playerName(playerId: string, players: readonly ResolverPlayer[]): string {
  return players.find(player => player.id === playerId)?.full_name ?? playerId
}

function hcp(score: EventScore): number {
  const value = score.hcp ?? score.player?.hcp_fallback
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY
}

function submittedAtCompare(a: EventScore, b: EventScore): number {
  if (a.submitted_at === b.submitted_at) return 0
  return a.submitted_at < b.submitted_at ? -1 : 1
}

function pointsCompare(a: EventScore, b: EventScore, points: (score: EventScore) => number): number {
  return points(b) - points(a) || hcp(b) - hcp(a) || submittedAtCompare(a, b)
}

function scratchCompare(a: EventScore, b: EventScore): number {
  return rawStrokes(a) - rawStrokes(b) || hcp(b) - hcp(a) || submittedAtCompare(a, b)
}

function rawStrokes(score: EventScore): number {
  if (score.total_strokes != null) return score.total_strokes
  return (score.holes ?? []).reduce((sum, hole) => sum + (hole.strokes_played ?? 0), 0)
}

function totalPoints(score: EventScore): number {
  return holePoints(score, 1, 18)
}

function holePoints(score: EventScore, start: number, end: number): number {
  return (score.holes ?? [])
    .filter(hole => hole.hole >= start && hole.hole <= end)
    .reduce((sum, hole) => sum + (hole.points ?? 0), 0)
}

function completeScratchScores(scores: readonly EventScore[]): EventScore[] {
  return scores.filter(score => score.has_complete_strokes)
}

function podium(scores: readonly EventScore[]): PodiumAnswer {
  const sorted = [...scores].sort((a, b) => pointsCompare(a, b, totalPoints))
  return { first: sorted[0]?.player_id ?? null, second: sorted[1]?.player_id ?? null, third: sorted[2]?.player_id ?? null }
}

function targetId(question: EventQuestion): string {
  return String(question.parameters.player_id ?? question.parameters.target_player_id ?? '')
}

function missingReason(playerIds: string[], players: readonly ResolverPlayer[]): string {
  return playerIds.map(id => `${playerName(id, players)}: ei korttia`).join(' · ')
}

function thresholdWarning(label: string, count: number, scores: readonly EventScore[], players: readonly ResolverPlayer[]): string | undefined {
  const entered = new Set(scores.map(score => score.player_id)).size
  const outstanding = Math.max(0, players.length - entered)
  return outstanding > 0 ? `${count} ${label} · ${outstanding} korttia puuttuu` : undefined
}

function birdieCount(scores: readonly EventScore[]): number {
  return scores.reduce((count, score) => count + (score.holes ?? []).filter(hole => hole.strokes_played != null && hole.par != null && hole.strokes_played === hole.par - 1).length, 0)
}

function zeroPointHoleCount(scores: readonly EventScore[]): number {
  return scores.reduce((count, score) => {
    const holes = new Map((score.holes ?? []).map(hole => [hole.hole, hole]))
    return count + Array.from({ length: 18 }, (_, index) => holes.get(index + 1)?.points ?? 0).filter(points => points === 0).length
  }, 0)
}

function compositionCategory(points: number): HoleCategory {
  if (points >= 3) return 'birdie'
  if (points === 2) return 'par'
  if (points === 1) return 'bogey'
  return 'worse'
}

function compositionAnswer(question: EventQuestion, scores: readonly EventScore[]): CompositionLineAnswer | null {
  const target = targetId(question)
  const score = scores.find(item => item.player_id === target)
  const holePars = Array.isArray(question.parameters.hole_pars) && question.parameters.hole_pars.length === 18
    ? question.parameters.hole_pars.map(Number)
    : COMPOSITION_HOLE_PARS
  if (!target || !score?.holes) return null
  const holes = holePars.map((par, index) => {
    const result = score.holes?.find(hole => hole.hole === index + 1)
    return result ? { hole: index + 1, category: compositionCategory(result.points), par } : null
  })
  if (holes.some(hole => hole === null)) return null
  const completeHoles = holes as { hole: number; category: HoleCategory; par: number }[]
  const categoryAnswer = { holes: completeHoles.map(hole => hole.category) } as any
  const predicted_points = compositionPoints(categoryAnswer)
  return {
    type: 'composition_line',
    featured_player_id: target,
    holes: completeHoles,
    summary: { ...compositionCounts(categoryAnswer), predicted_points, stbl_delta: 36 - predicted_points },
  }
}

function resolveFieldQuestion(question: EventQuestion, scores: EventScore[], players: readonly ResolverPlayer[]): Resolution {
  const key = question.question_type.key
  if (key === 'player_pick_best_total') {
    const winner = [...scores].sort((a, b) => pointsCompare(a, b, totalPoints))[0]
    return { status: 'resolved', answer: winner?.player_id ?? null }
  }
  if (key === 'player_pick_best_front' || key === 'player_pick_best_back') {
    const start = key.endsWith('front') ? 1 : 10
    const end = key.endsWith('front') ? 9 : 18
    const winner = [...scores].sort((a, b) => pointsCompare(a, b, score => holePoints(score, start, end)))[0]
    return { status: 'resolved', answer: winner?.player_id ?? null }
  }
  if (key === 'player_pick_best_scratch') {
    const complete = completeScratchScores(scores)
    if (!complete.length) return { status: 'unresolved', reason: 'Ei yhtään korttia, jossa kaikki 18 lyöntiä on kirjattu' }
    const winner = [...complete].sort(scratchCompare)[0]
    return { status: 'resolved', answer: winner.player_id }
  }
  if (key === 'podium_top3') return { status: 'resolved', answer: podium(scores) }
  if (key === 'yes_no_birdie') {
    const count = birdieCount(scores)
    const warning = count > 0 ? undefined : thresholdWarning('birdietä', count, scores, players)
    return warning ? { status: 'resolved', answer: count > 0, warning } : { status: 'resolved', answer: count > 0 }
  }
  if (key === 'yes_no_four_birdies') {
    const count = birdieCount(scores)
    const warning = count >= 4 ? undefined : thresholdWarning('birdietä', count, scores, players)
    return warning ? { status: 'resolved', answer: count >= 4, warning } : { status: 'resolved', answer: count >= 4 }
  }
  if (key === 'yes_no_zero') {
    const count = zeroPointHoleCount(scores)
    const warning = count > 0 ? undefined : thresholdWarning('pisteetöntä reikää', count, scores, players)
    return warning ? { status: 'resolved', answer: count > 0, warning } : { status: 'resolved', answer: count > 0 }
  }
  return { status: 'unresolved', reason: `Tuntematon kysymystyyppi: ${key}` }
}

export function resolveQuestion(question: EventQuestion, allScores: readonly EventScore[], eventPlayers: readonly ResolverPlayer[] = []): Resolution {
  const scores = eventScores(allScores, eventPlayers)
  const key = question.question_type.key

  if (FIELD_KEYS.has(key)) return resolveFieldQuestion(question, scores, eventPlayers)

  if (key === 'slider_player_points') {
    const target = targetId(question)
    const score = scores.find(item => item.player_id === target)
    if (!score) return { status: 'unresolved', reason: `${playerName(target || 'Kohdepelaaja', eventPlayers)}: ei korttia` }
    return { status: 'resolved', answer: totalPoints(score) }
  }

  if (key === 'yes_no_head_to_head') {
    const playerA = String(question.parameters.player_a_id ?? '')
    const playerB = String(question.parameters.player_b_id ?? '')
    const missing = [playerA, playerB].filter(id => id && !scores.some(score => score.player_id === id))
    if (missing.length) return { status: 'unresolved', reason: missingReason(missing, eventPlayers) }
    const ordered = scores.filter(score => score.player_id === playerA || score.player_id === playerB).sort((a, b) => pointsCompare(a, b, totalPoints))
    return { status: 'resolved', answer: ordered[0].player_id }
  }

  if (key === 'composition_player_line') {
    const target = targetId(question)
    if (!scores.some(score => score.player_id === target)) return { status: 'unresolved', reason: `${playerName(target || 'Kohdepelaaja', eventPlayers)}: ei korttia` }
    const answer = compositionAnswer(question, scores)
    return answer ? { status: 'resolved', answer } : { status: 'unresolved', reason: `${playerName(target, eventPlayers)}: kortista puuttuu väyliä` }
  }

  if (key === 'beat_the_leader') {
    const target = targetId(question)
    const targetScore = scores.find(score => score.player_id === target)
    if (!targetScore) return { status: 'unresolved', reason: `${playerName(target || 'Kohdepelaaja', eventPlayers)}: ei korttia` }
    const winner = [...scores]
      .filter(score => score.player_id !== target && totalPoints(score) > totalPoints(targetScore))
      .sort((a, b) => pointsCompare(a, b, totalPoints))[0]
    return { status: 'resolved', answer: winner?.player_id ?? null }
  }

  return { status: 'unresolved', reason: `Tuntematon kysymystyyppi: ${key}` }
}

export function scoreAnswer(question: EventQuestion, betAnswer: any, resolution: Resolution): number {
  if (resolution.status === 'unresolved') return 0
  const key = question.question_type.key
  const correct = resolution.answer
  if (key === 'slider_player_points') {
    const difference = Math.abs(Number(betAnswer) - Number(correct))
    return difference === 0 ? 5 : difference === 1 ? 3 : 0
  }
  if (key === 'podium_top3') {
    const guessed = betAnswer ?? {}
    const positions = ['first', 'second', 'third'] as const
    const actualIds = positions.map(position => (correct as PodiumAnswer)[position])
    const guessedIds = positions.map(position => guessed[position] ?? null)
    const anywhere = guessedIds.filter(id => id != null && actualIds.includes(id)).length
    const correctPositions = positions.filter(position => guessedIds[position === 'first' ? 0 : position === 'second' ? 1 : 2] === (correct as PodiumAnswer)[position]).length
    const exact = correctPositions === 3 && guessedIds.every((id, index) => id != null && id === actualIds[index])
    return Math.min(8, anywhere + correctPositions + (exact ? 2 : 0))
  }
  if (key === 'composition_player_line') {
    const predicted = betAnswer?.holes
    const actual = (correct as any)?.holes
    if (!Array.isArray(predicted) || !Array.isArray(actual) || actual.length !== 18) return 0
    const exact = actual.filter((hole: any, index: number) => predicted[index]?.category === hole.category).length
    return Math.round(exact / 18 * question.question_type.max_points)
  }
  return Object.is(betAnswer, correct) ? question.question_type.max_points : 0
}
