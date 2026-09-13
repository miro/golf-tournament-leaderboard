import type { League } from './database.types'

let activeLeague: League | null = null
export function setActiveLeagueBrand(league: League) { activeLeague = league }
export function getLeagueBrand(): League {
  if (!activeLeague) throw new Error('League has not loaded')
  return activeLeague
}
export function leagueDomain(): string { return typeof window === 'undefined' ? 'localhost' : window.location.hostname }
export function leagueShortName(name = getLeagueBrand().name): string {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 3).toUpperCase()
}
