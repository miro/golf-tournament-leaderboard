import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getCurrentSeason, getLeaderboard, getPlayerRounds } from '../lib/queries'
import { supabase } from '../lib/supabase'
import type { Player, LeaderboardEntry, RoundWithDetails } from '../lib/database.types'

export default function PersonalDashboard() {
  const { token } = useParams<{ token: string }>()
  const [player, setPlayer] = useState<Player | null>(null)
  const [entry, setEntry] = useState<LeaderboardEntry | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      if (!token) return
      const { data: raw, error } = await supabase
        .from('players')
        .select('*')
        .eq('personal_link_token', token)
        .single()
      if (error || !raw) { setNotFound(true); return }
      const p = raw as unknown as Player
      const season = await getCurrentSeason()
      const [lb, playerRounds] = await Promise.all([
        getLeaderboard(season.id),
        getPlayerRounds(p.id, season.id),
      ])
      setPlayer(p)
      setLeaderboard(lb)
      setEntry(lb.find(e => e.player.id === p.id) ?? null)
      setRounds(playerRounds)
    }
    load().catch(() => setNotFound(true)).finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Ladataan...</div>
  }
  if (notFound || !player) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Linkkiä ei löydy</div>
  }

  const myPoints = entry?.total_points ?? 0
  const coursesPlayed = entry?.courses_played.length ?? 0
  const totalCourses = 4
  const rivals = leaderboard.filter(e => e.player.id !== player.id)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-gray-500 text-sm mb-1">Oma näkymä</p>
        <h1 className="text-3xl font-bold text-white">{player.full_name}</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { value: entry?.rank ?? '–', label: 'Sijoitus', gold: true },
          { value: myPoints, label: 'Pistettä', gold: false },
          { value: entry?.rounds_played ?? 0, label: 'Kierrosta', gold: false },
          { value: totalCourses - coursesPlayed, label: 'Kenttää jäljellä', gold: false },
        ].map(({ value, label, gold }) => (
          <div key={label} className="card p-4 text-center">
            <div className={`text-3xl font-bold ${gold ? 'text-gc-gold' : 'text-white'}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {rivals.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-white mb-3">Mitä tarvitset ohittaaksesi</h2>
          <div className="card divide-y divide-white/5">
            {rivals.map(rival => {
              const gap = rival.total_points - myPoints
              return (
                <div key={rival.player.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                  <div className="w-6 text-center text-gray-500">{rival.rank}</div>
                  <div className="flex-1 text-white">{rival.player.full_name}</div>
                  <div className="font-medium">
                    {gap > 0 ? (
                      <span className="text-red-400">+{gap} p jäljessä</span>
                    ) : gap === 0 ? (
                      <span className="text-gray-400">Tasatilanne</span>
                    ) : (
                      <span className="text-gc-green">{Math.abs(gap)} p edellä</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-bold text-white mb-4">Omat kierrokset</h2>
        {rounds.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">Ei kierroksia vielä</div>
        ) : (
          <div className="space-y-2">
            {rounds.map(r => (
              <div key={r.id} className="card flex items-center gap-4 px-4 py-3">
                <div className="flex-1">
                  <div className="font-medium text-white">{r.course?.name}</div>
                  <div className="text-sm text-gray-400">
                    {new Date(r.played_date).toLocaleDateString('fi-FI')}
                  </div>
                </div>
                <div className="text-gc-gold font-bold text-xl">{r.total_points} p</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
