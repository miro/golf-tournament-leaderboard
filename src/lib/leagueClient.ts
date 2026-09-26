import { supabase } from './supabase'

let activeLeagueId: string | null = null
export function setActiveLeagueId(id: string) { activeLeagueId = id }
export function getActiveLeagueId(): string {
  if (!activeLeagueId) throw new Error('League has not loaded')
  return activeLeagueId
}

const EMBED_SCOPED = new Set(['season_courses', 'hole_results', 'league_event_players', 'betting_questions', 'betting_participants', 'event_scores', 'event_hole_results', 'bets'])

export function leagueQuery(table: string, leagueId: string) {
  const base = (supabase.from(table) as any)
  const applyScope = (query: any) => {
    if (table === 'season_courses') return query.eq('seasons.league_id', leagueId)
    if (table === 'hole_results') return query.eq('rounds.league_id', leagueId)
    if (table === 'league_event_players' || table === 'betting_questions' || table === 'betting_participants' || table === 'event_scores') return query.eq('event.league_id', leagueId)
    if (table === 'event_hole_results') return query.eq('score.event.league_id', leagueId)
    if (table === 'bets') return query.eq('participant.event.league_id', leagueId)
    if (table === 'betting_question_types' || table === 'courses') return query
    return query.eq('league_id', leagueId)
  }
  return {
    select(columns = '*', options?: any) {
      return applyScope(base.select(columns, options))
    },
    insert(values: any) {
      if (table === 'season_courses' || table === 'hole_results' || table === 'round_cards' || table === 'league_event_players' || table === 'betting_questions' || table === 'betting_participants' || table === 'bets' || table === 'event_scores' || table === 'event_hole_results' || table === 'betting_question_types' || table === 'courses') {
        return base.insert(values)
      }
      const addLeague = (value: any) => ({ ...value, league_id: value?.league_id ?? leagueId })
      return base.insert(Array.isArray(values) ? values.map(addLeague) : addLeague(values))
    },
    upsert(values: any, options?: any) {
      if (table === 'season_courses' || table === 'hole_results' || table === 'round_cards' || table === 'league_event_players' || table === 'betting_questions' || table === 'betting_participants' || table === 'bets' || table === 'event_scores' || table === 'event_hole_results' || table === 'betting_question_types' || table === 'courses') return base.upsert(values, options)
      const addLeague = (value: any) => ({ ...value, league_id: value?.league_id ?? leagueId })
      return applyScope(base.upsert(Array.isArray(values) ? values.map(addLeague) : addLeague(values), options))
    },
    // Child tables are scoped through an embedded resource, which PostgREST rejects on writes
    // without a matching select embed. Callers filter these by id, and RLS enforces the league.
    update(values: any) { return EMBED_SCOPED.has(table) ? base.update(values) : applyScope(base.update(values)) },
    delete() { return EMBED_SCOPED.has(table) ? base.delete() : applyScope(base.delete()) },
  }
}

export function scopedTable(table: string) {
  return leagueQuery(table, getActiveLeagueId())
}
