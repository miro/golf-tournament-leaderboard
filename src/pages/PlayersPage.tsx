import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentSeason, getLeaderboard } from '../lib/queries'
import type { LeaderboardEntry } from '../lib/database.types'

export default function PlayersPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const season = await getCurrentSeason()
      setLeaderboard(await getLeaderboard(season.id))
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Ladataan...</div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Pelaajat</h1>
      <div className="card divide-y divide-white/5">
        {leaderboard.length === 0 && (
          <div className="p-8 text-center text-gray-500">Ei pelaajia vielä</div>
        )}
        {leaderboard.map(entry => (
          <Link
            key={entry.player.id}
            to={`/player/${entry.player.slug}`}
            className="flex items-center gap-4 px-4 py-4 hover:bg-white/5 transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-gc-dark border border-white/10 flex items-center justify-center text-sm font-bold text-gc-green shrink-0">
              {entry.rank}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white group-hover:text-gc-green transition-colors">
                {entry.player.full_name}
              </div>
              <div className="text-sm text-gray-500">
                {entry.player.hcp_current != null ? `HCP ${entry.player.hcp_current} · ` : ''}
                {entry.rounds_played} kierr.
              </div>
            </div>
            <div className="text-gc-green font-bold text-xl">{entry.total_points} p</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
