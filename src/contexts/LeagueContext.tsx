import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { setActiveLeagueId } from '../lib/leagueClient'
import { useLeagueSlug } from '../hooks/useLeagueSlug'
import type { League as DatabaseLeague } from '../lib/database.types'
import { setActiveLeagueBrand } from '../lib/branding'

export interface LeagueFeatures {
  invitational: boolean
  betting: boolean
  hype_tools: boolean
  skins: boolean
}

export interface League extends Omit<DatabaseLeague, 'features'> {
  features: LeagueFeatures
}

export const LeagueContext = createContext<League | null>(null)

export function LeagueProvider({ children }: { children: ReactNode }) {
  const slug = useLeagueSlug()
  const [league, setLeague] = useState<League | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLeague(null)
    setError(false)
    Promise.resolve(supabase.from('leagues').select('*').eq('slug', slug).eq('active', true).limit(1).maybeSingle())
      .then(({ data, error: queryError }) => {
        if (cancelled) return
        if (queryError) setError(true)
        else if (!data) setLeague(null)
        else {
          const loaded = data as League
          setActiveLeagueId(loaded.id)
          setActiveLeagueBrand(loaded)
          setLeague(loaded)
        }
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug])

  useEffect(() => {
    if (!league) return
    document.documentElement.style.setProperty('--league-primary', league.primary_color)
    document.documentElement.style.setProperty('--league-secondary', league.secondary_color)
    document.documentElement.style.setProperty('--league-logo', `url(${league.logo_url ?? '/gc-logo.png'})`)
    const rgb = (hex: string) => {
      const value = hex.replace('#', '')
      return value.length === 6 ? `${parseInt(value.slice(0, 2), 16)} ${parseInt(value.slice(2, 4), 16)} ${parseInt(value.slice(4, 6), 16)}` : '232 168 32'
    }
    document.documentElement.style.setProperty('--league-primary-rgb', rgb(league.primary_color))
    document.documentElement.style.setProperty('--league-secondary-rgb', rgb(league.secondary_color))
  }, [league])

  if (loading) return <div className="min-h-screen bg-gc-dark" />
  if (error) return <div className="min-h-screen bg-gc-dark flex items-center justify-center text-gc-muted">League unavailable</div>
  if (!league) return <div className="min-h-screen bg-gc-dark flex items-center justify-center text-white">League not found</div>
  return <LeagueContext.Provider value={league}>{children}</LeagueContext.Provider>
}

export function useLeague(): League {
  const league = useContext(LeagueContext)
  if (!league) throw new Error('useLeague must be used within LeagueProvider')
  return league
}
