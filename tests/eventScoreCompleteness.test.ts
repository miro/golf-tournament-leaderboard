import assert from 'node:assert/strict'
import test from 'node:test'
import { allEventScoresComplete, isCompleteEventScore } from '../src/lib/eventScoreCompleteness.ts'

function holes(missing: number[] = [], missingStrokes: number[] = []) {
  return Array.from({ length: 18 }, (_, index) => index + 1)
    .filter(hole => !missing.includes(hole))
    .map(hole => ({ hole, points: 2, strokes_played: missingStrokes.includes(hole) ? null : 4 }))
}

test('an event score is complete only with every hole and both values', () => {
  assert.equal(isCompleteEventScore({ holes: holes() }), true)
  assert.equal(isCompleteEventScore({ holes: holes([18]) }), false)
  assert.equal(isCompleteEventScore({ holes: holes([], [18]) }), false)
})

test('all event scores must be complete for every roster player', () => {
  const scores = [
    { player_id: 'alice', holes: holes() },
    { player_id: 'bob', holes: holes([18]) },
  ]
  assert.equal(allEventScoresComplete(scores, ['alice', 'bob'], score => (score as { player_id: string }).player_id), false)
  scores[1] = { player_id: 'bob', holes: holes() }
  assert.equal(allEventScoresComplete(scores, ['alice', 'bob'], score => (score as { player_id: string }).player_id), true)
})
