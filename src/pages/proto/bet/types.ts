import type { Player } from '../../../lib/database.types'

export type HoleCategory = 'birdie' | 'par' | 'bogey' | 'double' | 'triple' | 'worse'

export const CATEGORY_ORDER: HoleCategory[] = ['birdie', 'par', 'bogey', 'double', 'triple', 'worse']

export const CATEGORY_META: Record<
  HoleCategory,
  { emoji: string; label: string; cellColor: string; activeBorder: string; activeBg: string }
> = {
  birdie: { emoji: '🔴', label: 'Birdie+', cellColor: '#C0392B', activeBorder: '#C0392B', activeBg: 'rgba(192,57,43,0.25)' },
  par: { emoji: '⬜', label: 'Par', cellColor: '#3D3530', activeBorder: '#888', activeBg: 'rgba(255,255,255,0.08)' },
  bogey: { emoji: '🟦', label: 'Bogey', cellColor: '#2E5F8A', activeBorder: '#2E5F8A', activeBg: 'rgba(46,95,138,0.25)' },
  double: { emoji: '🟪', label: 'Tupla', cellColor: '#4A2D6F', activeBorder: '#4A2D6F', activeBg: 'rgba(74,45,111,0.25)' },
  triple: { emoji: '🟫', label: 'Tripla', cellColor: '#3D2010', activeBorder: '#3D2010', activeBg: 'rgba(61,32,16,0.25)' },
  worse: { emoji: '⬛', label: 'Worse', cellColor: '#111111', activeBorder: '#444', activeBg: 'rgba(17,17,17,0.4)' },
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
