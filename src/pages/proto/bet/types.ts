import type { Player } from '../../../lib/database.types'

export type HoleCategory = 'birdie' | 'par' | 'bogey' | 'double' | 'triple' | 'worse'

export const CATEGORY_ORDER: HoleCategory[] = ['birdie', 'par', 'bogey', 'double', 'triple', 'worse']

export type CellSymbolShape = 'none' | 'circle' | 'square' | 'double-square' | 'triple-square' | 'filled-square'

export const CATEGORY_META: Record<
  HoleCategory,
  {
    emoji: string
    label: string
    cellColor: string
    activeBorder: string
    activeBg: string
    strokeOffset: number
    symbol: CellSymbolShape
    symbolSizePct: number
    cellBgOpacity: number
    numberColor: string
  }
> = {
  birdie: {
    emoji: '🔴', label: 'Birdie+', cellColor: '#C0392B', activeBorder: '#C0392B', activeBg: 'rgba(192,57,43,0.25)',
    strokeOffset: -1, symbol: 'circle', symbolSizePct: 80, cellBgOpacity: 0.2, numberColor: 'white',
  },
  par: {
    emoji: '⬜', label: 'Par', cellColor: '#3D3530', activeBorder: '#888', activeBg: 'rgba(255,255,255,0.08)',
    strokeOffset: 0, symbol: 'none', symbolSizePct: 0, cellBgOpacity: 0.2, numberColor: 'rgba(255,255,255,0.7)',
  },
  bogey: {
    emoji: '🟦', label: 'Bogey', cellColor: '#2E5F8A', activeBorder: '#2E5F8A', activeBg: 'rgba(46,95,138,0.25)',
    strokeOffset: 1, symbol: 'square', symbolSizePct: 75, cellBgOpacity: 0.2, numberColor: 'white',
  },
  double: {
    emoji: '🟪', label: 'Tupla', cellColor: '#4A2D6F', activeBorder: '#4A2D6F', activeBg: 'rgba(74,45,111,0.25)',
    strokeOffset: 2, symbol: 'double-square', symbolSizePct: 85, cellBgOpacity: 0.2, numberColor: 'white',
  },
  triple: {
    emoji: '🟫', label: 'Tripla', cellColor: '#3D2010', activeBorder: '#3D2010', activeBg: 'rgba(61,32,16,0.25)',
    strokeOffset: 3, symbol: 'triple-square', symbolSizePct: 88, cellBgOpacity: 0.2, numberColor: 'white',
  },
  worse: {
    emoji: '⬛', label: 'Worse', cellColor: '#111111', activeBorder: '#444', activeBg: 'rgba(17,17,17,0.4)',
    strokeOffset: 4, symbol: 'filled-square', symbolSizePct: 75, cellBgOpacity: 0.6, numberColor: 'white',
  },
}

export function strokeCountForHole(holePar: number, category: HoleCategory): number {
  return holePar + CATEGORY_META[category].strokeOffset
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
