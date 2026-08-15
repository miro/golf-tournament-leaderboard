import type { InvitationalResult, LeaderboardEntry, Player } from '../../lib/database.types'

/** Card frame colours cycle through the four season courses (Kajaani, Paltamo,
 * Nuas, Tenetti) by roster position; Liekkipoika holders override with amber. */
export const COURSE_COLORS = ['#2D6A4F', '#1B4FC4', '#C4791B', '#8B1BC4']
export const AMBER = '#E8A820'

/** Info-panel treatment per frame colour: a translucent tint of the frame colour
 * laid over a base that is the same hue pushed almost to black. */
const PANEL_BY_COLOR: Record<string, { tint: string; base: string }> = {
  '#2D6A4F': { tint: 'rgba(45,106,79,0.15)', base: '#1B1F1D' },
  '#1B4FC4': { tint: 'rgba(27,79,196,0.15)', base: '#171B1F' },
  '#C4791B': { tint: 'rgba(196,121,27,0.15)', base: '#1F1B17' },
  '#8B1BC4': { tint: 'rgba(139,27,196,0.15)', base: '#1C171F' },
}
const AMBER_PANEL = { tint: 'rgba(232,168,32,0.12)', base: '#221D17' }

export interface ScratchWin {
  year: number
  shots: number | null
}

export interface RosterEntry {
  player: Player
  /** Liekkipoika win years, most recent first. */
  liekkipoikaYears: number[]
  /** Scratch wins, most recent first. */
  scratchWins: ScratchWin[]
  rank: number | null
  totalPoints: number | null
  roundsPlayed: number
  borderColor: string
  borderWidth: number
  glow: boolean
  panelTint: string
  panelBase: string
}

/** invitational_results stores winners both as a player_id (newer rows) and as a
 * free-text name (older rows, some of whom are not players any more). Trust the id
 * when it is set; only fall back to the name when it is null. */
function winnerMatches(winnerId: string | null, winnerName: string | null, player: Player): boolean {
  if (winnerId) return winnerId === player.id
  if (winnerName) return winnerName.trim().toLowerCase() === player.full_name.trim().toLowerCase()
  return false
}

function tierOf(e: { liekkipoikaYears: number[]; scratchWins: ScratchWin[]; rank: number | null }): number {
  if (e.liekkipoikaYears.length > 0) return 1
  if (e.scratchWins.length > 0) return 2
  if (e.rank !== null) return 3
  return 4
}

export function buildRoster(
  players: Player[],
  standings: LeaderboardEntry[],
  results: InvitationalResult[],
): RosterEntry[] {
  const standingByPlayer = new Map(standings.map(e => [e.player.id, e]))

  const base = players.map(player => {
    const entry = standingByPlayer.get(player.id)
    return {
      player,
      liekkipoikaYears: results
        .filter(r => winnerMatches(r.liekkipoika_winner_player_id, r.liekkipoika_winner, player))
        .map(r => r.year)
        .sort((a, b) => b - a),
      scratchWins: results
        .filter(r => winnerMatches(r.scratch_winner_player_id, r.scratch_winner, player))
        .map(r => ({ year: r.year, shots: r.scratch_shots }))
        .sort((a, b) => b.year - a.year),
      rank: entry?.rank ?? null,
      totalPoints: entry?.total_points ?? null,
      roundsPlayed: entry?.rounds_played ?? 0,
    }
  })

  const sorted = base.sort((a, b) => {
    const ta = tierOf(a)
    const tb = tierOf(b)
    if (ta !== tb) return ta - tb
    if (ta === 1 && a.liekkipoikaYears[0] !== b.liekkipoikaYears[0]) return b.liekkipoikaYears[0] - a.liekkipoikaYears[0]
    if (ta === 2 && a.scratchWins[0].year !== b.scratchWins[0].year) return b.scratchWins[0].year - a.scratchWins[0].year
    if (ta === 3 && a.rank !== b.rank) return (a.rank ?? 0) - (b.rank ?? 0)
    return a.player.full_name.localeCompare(b.player.full_name, 'fi')
  })

  return sorted.map((e, i) => {
    const crowned = e.liekkipoikaYears.length > 0
    const courseColor = COURSE_COLORS[i % COURSE_COLORS.length]
    const panel = crowned ? AMBER_PANEL : PANEL_BY_COLOR[courseColor]
    return {
      ...e,
      borderColor: crowned ? AMBER : courseColor,
      borderWidth: crowned ? 4 : 2,
      glow: crowned,
      panelTint: panel.tint,
      panelBase: panel.base,
    }
  })
}
