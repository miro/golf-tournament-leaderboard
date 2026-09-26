export type ScoreHoleLike = {
  hole: number
  points: number | null
  strokes_played: number | null
}

export type ScoreLike = {
  holes?: readonly ScoreHoleLike[] | null
}

export function isCompleteEventScore(score: ScoreLike | undefined | null): boolean {
  const holes = score?.holes ?? []
  if (holes.length !== 18) return false

  const holeNumbers = new Set(holes.map(hole => hole.hole))
  return holeNumbers.size === 18
    && Array.from({ length: 18 }, (_, index) => index + 1).every(hole => holeNumbers.has(hole))
    && holes.every(hole => hole.points !== null && hole.strokes_played !== null)
}

export function allEventScoresComplete(
  scores: readonly ScoreLike[],
  playerIds: readonly string[],
  getPlayerId: (score: ScoreLike) => string | undefined,
): boolean {
  return playerIds.length > 0 && playerIds.every(playerId => {
    const score = scores.find(candidate => getPlayerId(candidate) === playerId)
    return isCompleteEventScore(score)
  })
}
