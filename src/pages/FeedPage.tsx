import { useEffect, useState } from 'react'
import { getCurrentSeason, getLeaderboard, getRecentRounds } from '../lib/queries'
import type { LeaderboardEntry, RoundWithDetails } from '../lib/database.types'
import RoundCard from '../components/RoundCard'

export default function FeedPage() {
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const season = await getCurrentSeason()
      const [r, lb] = await Promise.all([getRecentRounds(season.id, 100), getLeaderboard(season.id)])
      setRounds(r)
      setLeaderboard(lb)
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Ladataan...</div>
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Kierrosvirta</h1>
      {rounds.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">Ei kierroksia vielä</div>
      ) : (
        <div className="space-y-4">
          {rounds.map(round => (
            <RoundCard
              key={round.id}
              round={round}
              rank={leaderboard.find(e => e.player.id === round.player_id)?.rank}
              totalPlayers={leaderboard.length}
            />
          ))}
        </div>
      )}
    </div>
  )
}
