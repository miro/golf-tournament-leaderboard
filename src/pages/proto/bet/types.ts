import type { Player } from '../../../lib/database.types'

export type HoleCategory = 'birdie' | 'par' | 'bogey' | 'double' | 'triple' | 'worse'

export const CATEGORY_ORDER: HoleCategory[] = ['birdie', 'par', 'bogey', 'double', 'triple', 'worse']

export type CellSymbolShape = 'none' | 'circle' | 'square' | 'double-square' | 'triple-square' | 'filled-square'

export const CATEGORY_META: Record<
  HoleCategory,
  {
    emoji: string // used in the completion-screen summary line only, not the brush selector
    label: string
    fullLabel: string
    cellColor: string
    // Brush-selector colors differ from cellColor for par/worse — those cell colors
    // are too close to the empty/dark background to read as button symbols
    brushColor: string
    brushSymbolColor: string
    strokeOffset: number
    symbol: CellSymbolShape
    symbolSizePct: number
    cellBgOpacity: number
    numberColor: string
  }
> = {
  birdie: {
    emoji: '🔴', label: 'Birdie+', fullLabel: 'Birdie tai parempi', cellColor: '#C0392B',
    brushColor: '#C0392B', brushSymbolColor: '#C0392B',
    strokeOffset: -1, symbol: 'circle', symbolSizePct: 80, cellBgOpacity: 0.2, numberColor: 'white',
  },
  par: {
    emoji: '⬜', label: 'Par', fullLabel: 'Par', cellColor: '#3D3530',
    brushColor: '#888888', brushSymbolColor: '#888888',
    strokeOffset: 0, symbol: 'none', symbolSizePct: 0, cellBgOpacity: 0.2, numberColor: 'rgba(255,255,255,0.7)',
  },
  bogey: {
    emoji: '🟦', label: 'Bogey', fullLabel: 'Bogey', cellColor: '#2E5F8A',
    brushColor: '#2E5F8A', brushSymbolColor: '#2E5F8A',
    strokeOffset: 1, symbol: 'square', symbolSizePct: 75, cellBgOpacity: 0.2, numberColor: 'white',
  },
  double: {
    emoji: '🟪', label: 'Tupla', fullLabel: 'Tuplabogey', cellColor: '#4A2D6F',
    brushColor: '#4A2D6F', brushSymbolColor: '#4A2D6F',
    strokeOffset: 2, symbol: 'double-square', symbolSizePct: 85, cellBgOpacity: 0.2, numberColor: 'white',
  },
  triple: {
    emoji: '🟫', label: 'Tripla', fullLabel: 'Triplabogey', cellColor: '#3D2010',
    brushColor: '#3D2010', brushSymbolColor: '#3D2010',
    strokeOffset: 3, symbol: 'triple-square', symbolSizePct: 88, cellBgOpacity: 0.2, numberColor: 'white',
  },
  worse: {
    emoji: '⬛', label: 'Worse', fullLabel: 'Worse', cellColor: '#111111',
    brushColor: '#555555', brushSymbolColor: '#888888',
    strokeOffset: 4, symbol: 'filled-square', symbolSizePct: 75, cellBgOpacity: 0.6, numberColor: 'white',
  },
}

export const POINTS_PER_HOLE: Record<HoleCategory, number> = {
  birdie: 3, par: 2, bogey: 1, double: 0, triple: 0, worse: 0,
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
  return CATEGORY_ORDER.reduce((sum, key) => sum + counts[key] * POINTS_PER_HOLE[key], 0)
}
