import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentSeason, getLeaderboard, getRecentRounds } from '../../lib/queries'
import type { LeaderboardEntry, RoundWithDetails } from '../../lib/database.types'

export default function AdminDashboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [recentRounds, setRecentRounds] = useState<RoundWithDetails[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const season = await getCurrentSeason()
      const [lb, rounds] = await Promise.all([
        getLeaderboard(season.id),
        getRecentRounds(season.id, 5),
      ])
      setLeaderboard(lb)
      setRecentRounds(rounds)
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-400">Ladataan...</div>

  const leader = leaderboard[0]
  const totalRounds = leaderboard.reduce((sum, e) => sum + e.rounds_played, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <div className="text-3xl font-bold text-white">{leaderboard.length}</div>
          <div className="text-xs text-gray-500 mt-1">Pelaajaa</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl font-bold text-white">{totalRounds}</div>
          <div className="text-xs text-gray-500 mt-1">Kierrosta</div>
        </div>
        <div className="card p-4 text-center col-span-2">
          <div className="text-xl font-bold text-gc-green truncate">
            {leader ? `${leader.player.full_name} (${leader.total_points}p)` : '–'}
          </div>
          <div className="text-xs text-gray-500 mt-1">Johtaja</div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-white">Viimeisimmät kierrokset</h2>
          <Link to="/admin/rounds" className="text-sm text-gc-green hover:underline">Kaikki</Link>
        </div>
        <div className="card divide-y divide-white/5">
          {recentRounds.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">Ei kierroksia</div>
          ) : (
            recentRounds.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="flex-1">
                  <span className="text-white font-medium">{r.player?.full_name}</span>
                  <span className="text-gray-500"> · {r.course?.name}</span>
                </div>
                <div className="text-gc-green font-bold">{r.total_points}p</div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    r.status === 'published'
                      ? 'bg-gc-green/20 text-gc-green'
                      : r.status === 'corrected'
                      ? 'bg-gc-gold/20 text-gc-green'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {r.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <h2 className="font-bold text-white mb-3">Tulostaulukko</h2>
        <div className="card divide-y divide-white/5">
          {leaderboard.map(entry => (
            <div key={entry.player.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="w-6 text-gray-400 font-bold shrink-0">{entry.rank}</div>
              <div className="flex-1 text-white">{entry.player.full_name}</div>
              <div className="text-gray-500">{entry.rounds_played} kierr.</div>
              <div className="text-gc-green font-bold">{entry.total_points}p</div>
            </div>
          ))}
          {leaderboard.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">Ei tuloksia</div>
          )}
        </div>
      </div>
    </div>
  )
}
