import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveQuestion, scoreAnswer, type ResolverPlayer } from '../src/lib/eventResolvers.ts'
import type { EventQuestion, EventScore } from '../src/lib/eventQueries.ts'

const players: ResolverPlayer[] = [
  { id: 'p1', full_name: 'Pekka' },
  { id: 'p2', full_name: 'Matti' },
  { id: 'p3', full_name: 'Lauri' },
]

function question(key: string, parameters: Record<string, unknown> = {}, maxPoints = 3): EventQuestion {
  return { id: key, event_id: 'event', question_type_id: key, question_type_key: key, display_order: 1, question_text: key, points_possible: maxPoints, parameters, correct_answer: null, question_type: { id: key, key, display_name: key, description: '', max_points: maxPoints, requires_target_player: false, active: true } } as EventQuestion
}

function score(playerId: string, options: {
  points?: number
  strokes?: number | null
  hcp?: number | null
  complete?: boolean
  submittedAt?: string
  holes?: Array<{ hole: number; par?: number | null; strokes_played?: number | null; points?: number | null }>
} = {}): EventScore {
  const holes = (options.holes ?? []).map((hole, index) => ({
    id: `${playerId}-${index}`,
    event_score_id: `${playerId}-score`,
    hole: hole.hole,
    par: hole.par ?? 4,
    stroke_index: hole.hole,
    strokes_played: hole.strokes_played ?? null,
    hcp_strokes: null,
    points: hole.points ?? 0,
  }))
  return { id: `${playerId}-score`, event_id: 'event', player_id: playerId, hcp: options.hcp ?? 10, total_points: options.points ?? holes.reduce((sum, hole) => sum + hole.points, 0), total_strokes: options.strokes ?? null, has_complete_strokes: options.complete ?? false, submitted_at: options.submittedAt ?? `${playerId}-submitted`, is_corrected: false, holes } as EventScore
}

function fullStrokeCard(playerId: string, points = 36, strokes = 72, options: { hcp?: number; submittedAt?: string } = {}) {
  return score(playerId, {
    points,
    strokes,
    complete: true,
    hcp: options.hcp,
    submittedAt: options.submittedAt,
    holes: Array.from({ length: 18 }, (_, index) => ({ hole: index + 1, par: 4, strokes_played: 4, points: 2 })),
  })
}

test('field questions resolve over a partial entered field and use HCP tiebreaks', () => {
  const result = resolveQuestion(question('player_pick_best_total'), [
    fullStrokeCard('p1', 30, 80, { hcp: 12, submittedAt: '2026-01-02' }),
    fullStrokeCard('p2', 30, 80, { hcp: 10, submittedAt: '2026-01-01' }),
  ], players)
  assert.deepEqual(result, { status: 'resolved', answer: 'p1' })
})

test('scratch excludes incomplete cards and is unresolved when none are complete', () => {
  const incomplete = score('p1', { points: 40, strokes: 68, complete: false })
  const complete = fullStrokeCard('p2', 35, 72)
  assert.deepEqual(resolveQuestion(question('player_pick_best_scratch'), [incomplete, complete], players), { status: 'resolved', answer: 'p2' })
  const unresolved = resolveQuestion(question('player_pick_best_scratch'), [incomplete], players)
  assert.equal(unresolved.status, 'unresolved')
  if (unresolved.status === 'unresolved') assert.match(unresolved.reason, /kaikki 18 lyöntiä/)
})

test('front nine resolves with a missing back-nine hole', () => {
  const front = Array.from({ length: 9 }, (_, index) => ({ hole: index + 1, par: 4, strokes_played: 4, points: 3 }))
  const result = resolveQuestion(question('player_pick_best_front'), [score('p1', { points: 27, holes: front })], players)
  assert.deepEqual(result, { status: 'resolved', answer: 'p1' })
})

test('birdie threshold warns while cards are outstanding, but not after it is met', () => {
  const oneBirdie = score('p1', { holes: [{ hole: 1, par: 4, strokes_played: 3, points: 3 }] })
  const noBirdie = score('p2', { holes: [{ hole: 1, par: 4, strokes_played: 4, points: 2 }] })
  assert.deepEqual(resolveQuestion(question('yes_no_birdie', {}, 2), [oneBirdie, noBirdie], players), { status: 'resolved', answer: true })
  assert.deepEqual(resolveQuestion(question('yes_no_four_birdies', {}, 2), [oneBirdie, noBirdie], players), { status: 'resolved', answer: false, warning: '1 birdietä · 1 korttia puuttuu' })
  assert.deepEqual(resolveQuestion(question('yes_no_birdie', {}, 2), [noBirdie], players), { status: 'resolved', answer: false, warning: '0 birdietä · 2 korttia puuttuu' })
})

test('missing holes count as zero points for the zero-point threshold', () => {
  const result = resolveQuestion(question('yes_no_zero', {}, 2), [score('p1', { holes: [{ hole: 1, par: 4, strokes_played: 4, points: 2 }] })], players)
  assert.deepEqual(result, { status: 'resolved', answer: true })
})

test('slider scores exact, plus or minus one, and plus or minus two correctly', () => {
  const q = question('slider_player_points', { player_id: 'p1' }, 5)
  const resolution = resolveQuestion(q, [fullStrokeCard('p1', 36)], players)
  assert.equal(scoreAnswer(q, 36, resolution), 5)
  assert.equal(scoreAnswer(q, 35, resolution), 3)
  assert.equal(scoreAnswer(q, 37, resolution), 3)
  assert.equal(scoreAnswer(q, 34, resolution), 0)
  assert.equal(scoreAnswer(q, 38, resolution), 0)
})

test('head-to-head names the missing player', () => {
  const result = resolveQuestion(question('yes_no_head_to_head', { player_a_id: 'p1', player_b_id: 'p2' }, 2), [fullStrokeCard('p1')], players)
  assert.deepEqual(result, { status: 'unresolved', reason: 'Matti: ei korttia' })
})

test('podium scoring awards name hits, position hits, and the exact bonus', () => {
  const q = question('podium_top3', {}, 8)
  const resolution = resolveQuestion(q, [fullStrokeCard('p1', 40), fullStrokeCard('p2', 39), fullStrokeCard('p3', 38)], players)
  assert.equal(scoreAnswer(q, { first: 'x', second: 'x', third: 'x' }, resolution), 0)
  assert.equal(scoreAnswer(q, { first: 'p2', second: 'p3', third: 'x' }, resolution), 2)
  assert.equal(scoreAnswer(q, { first: 'p1', second: 'x', third: 'y' }, resolution), 2)
  assert.equal(scoreAnswer(q, { first: 'p1', second: 'p3', third: 'x' }, resolution), 3)
  assert.equal(scoreAnswer(q, { first: 'p1', second: 'p2', third: 'x' }, resolution), 4)
  assert.equal(scoreAnswer(q, { first: 'p1', second: 'p2', third: 'p3' }, resolution), 8)
})
