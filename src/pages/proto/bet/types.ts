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

// Prototype course pars, retained from the original composition grid.
export const COMPOSITION_HOLE_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]

export const EMPTY_COMPOSITION: CompositionAnswer = { holes: [...Array<HoleCategory>(17).fill('par'), null] }

/**
 * Start a player's line at two Stableford points per hole, based on their
 * handicap strokes and the course's stroke indexes. The final hole stays
 * empty so the bettor must complete the line before submitting it.
 */
export function initialCompositionForHandicap(handicap: number | null | undefined, holeHandicapIndexes: number[] = Array.from({ length: 18 }, (_, index) => index + 1)): CompositionAnswer {
  const playingHandicap = handicap == null || !Number.isFinite(handicap) ? 0 : Math.max(0, Math.round(handicap))
  const holes: (HoleCategory | null)[] = []
  for (let index = 0; index < 18; index++) {
    if (index === 17) {
      holes.push(null)
      continue
    }
    const strokeIndex = holeHandicapIndexes[index] ?? index + 1
    const handicapStrokes = Math.floor(playingHandicap / 18) + (strokeIndex <= playingHandicap % 18 ? 1 : 0)
    holes.push(CATEGORY_ORDER[Math.min(CATEGORY_ORDER.length - 1, handicapStrokes + 1)])
  }
  return { holes }
}

export interface CompositionLineAnswer {
  type: 'composition_line'
  featured_player_id: string
  holes: { hole: number; category: HoleCategory | null; par: number }[]
  summary: Record<HoleCategory, number> & { predicted_points: number; stbl_delta: number; stableford_points?: number; stableford_delta?: number }
}

function handicapStrokesForHole(handicap: number, strokeIndex: number) {
  const playingHandicap = Math.max(0, Math.round(handicap))
  return Math.floor(playingHandicap / 18) + (strokeIndex <= playingHandicap % 18 ? 1 : 0)
}

function stablefordPointsForHole(category: HoleCategory | null, handicap: number | null | undefined, strokeIndex: number) {
  if (!category || handicap == null || !Number.isFinite(handicap)) return null
  const netToPar = CATEGORY_META[category].strokeOffset - handicapStrokesForHole(handicap, strokeIndex)
  return Math.max(0, 2 - netToPar)
}

export function compositionStablefordPoints(value: CompositionAnswer, handicap: number | null | undefined, holeHandicapIndexes: number[]): number | null {
  if (handicap == null || !Number.isFinite(handicap)) return null
  return value.holes.reduce((sum, category, index) => sum + (stablefordPointsForHole(category, handicap, holeHandicapIndexes[index] ?? index + 1) ?? 0), 0)
}

export function lockComposition(value: CompositionAnswer, playerId: string, holePars = COMPOSITION_HOLE_PARS, playerHandicap: number | null | undefined = null, holeHandicapIndexes = Array.from({ length: 18 }, (_, index) => index + 1)): CompositionLineAnswer {
  if (value.holes.length !== 18 || value.holes.some(category => category === null)) {
    throw new Error('All 18 holes must be set before locking')
  }
  const predicted_points = compositionPoints(value)
  const stableford_points = compositionStablefordPoints(value, playerHandicap, holeHandicapIndexes)
  return {
    type: 'composition_line',
    featured_player_id: playerId,
    holes: value.holes.map((category, index) => ({ hole: index + 1, category: category!, par: holePars[index] ?? COMPOSITION_HOLE_PARS[index] })),
    summary: { ...compositionCounts(value), predicted_points, stbl_delta: 36 - predicted_points, ...(stableford_points == null ? {} : { stableford_points, stableford_delta: 36 - stableford_points }) },
  }
}

export interface BetAnswers {
  q1Score: number | null
  q2Composition: CompositionAnswer | CompositionLineAnswer
  q3BestGroup: string | null
  q4BestFront9: string | null
  q5BestBack9: string | null
  q6BestScratch: string | null
  q7BeatLeader: string | null
  q8Birdie: 'yes' | 'no' | null
  q9Podium: (string | null)[]
}

export interface RandomAssignment {
  playerA: Player
  playerB: Player
  targetPlayer: Player
  roster: Player[]
}

export interface SeasonStanding {
  rank: number
  points: number
}

export function compositionTotal(c: CompositionAnswer | CompositionLineAnswer): number {
  return c.holes.filter(h => h !== null).length
}

export function compositionCounts(c: CompositionAnswer | CompositionLineAnswer): Record<HoleCategory, number> {
  const counts: Record<HoleCategory, number> = { birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, worse: 0 }
  for (const h of c.holes) {
    const category = typeof h === 'object' && h !== null ? h.category : h
    if (category) counts[category]++
  }
  return counts
}

export function compositionPoints(c: CompositionAnswer | CompositionLineAnswer): number {
  const counts = compositionCounts(c)
  return CATEGORY_ORDER.reduce((sum, key) => sum + counts[key] * POINTS_PER_HOLE[key], 0)
}
