import type { Player } from '../../../lib/database.types'

export type HoleCategory = 'birdie' | 'par' | 'bogey' | 'double' | 'triple' | 'worse'

export const CATEGORY_ORDER: HoleCategory[] = ['birdie', 'par', 'bogey', 'double', 'triple', 'worse']

export const CATEGORY_META: Record<HoleCategory, { emoji: string; label: string; color: string }> = {
  birdie: { emoji: '🐦', label: 'Birdie+', color: '#2D6A4F' },
  par: { emoji: '⭕', label: 'Par', color: '#3A5A8A' },
  bogey: { emoji: '📊', label: 'Bogey', color: '#8A7A3A' },
  double: { emoji: '🟦', label: 'Tupla', color: '#7A3A2A' },
  triple: { emoji: '🟥', label: 'Tripla', color: '#8A2A2A' },
  worse: { emoji: '💀', label: 'Worse', color: '#3A2A3A' },
}

export interface CompositionAnswer {
  holes: (HoleCategory | null)[] // 18 entries
}

export const EMPTY_COMPOSITION: CompositionAnswer = { holes: Array(18).fill(null) }

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
  return c.holes.filter(h => h !== null).length
}

export function compositionCounts(c: CompositionAnswer): Record<HoleCategory, number> {
  const counts: Record<HoleCategory, number> = { birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, worse: 0 }
  for (const h of c.holes) if (h) counts[h]++
  return counts
}

export function compositionPoints(c: CompositionAnswer): number {
  const counts = compositionCounts(c)
  return counts.birdie * 3 + counts.par * 2 + counts.bogey * 1
}
