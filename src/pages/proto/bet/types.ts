import type { Player } from '../../../lib/database.types'

export interface CompositionAnswer {
  birdie: number
  par: number
  bogey: number
  double: number
  triple: number
  worse: number
}

export const EMPTY_COMPOSITION: CompositionAnswer = {
  birdie: 0,
  par: 0,
  bogey: 0,
  double: 0,
  triple: 0,
  worse: 0,
}

export interface BetAnswers {
  q1Score: number | null
  q2Composition: CompositionAnswer
  q3BestGroup: string | null
  q4BestFront9: string | null
  q5BestBack9: string | null
  q6BestScratch: string | null
  q7HeadToHead: string | null
  q8Birdie: 'yes' | 'no' | null
  q9Podium: (string | null)[]
}

export interface RandomAssignment {
  playerA: Player
  playerB: Player
  pairA: Player
  pairB: Player
  roster: Player[]
}

export function compositionTotal(c: CompositionAnswer): number {
  return c.birdie + c.par + c.bogey + c.double + c.triple + c.worse
}

export function compositionPoints(c: CompositionAnswer): number {
  return c.birdie * 3 + c.par * 2 + c.bogey * 1
}
