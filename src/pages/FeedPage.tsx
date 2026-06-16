import { useEffect, useState } from 'react'
import { getCurrentSeason, getLeaderboard, getRecentRounds, getCourses, getActivePlayers, getHoleResultsForRounds } from '../lib/queries'
import type { Course, LeaderboardEntry, RoundWithDetails, HoleResult } from '../lib/database.types'
import RoundCard from '../components/RoundCard'

export default function FeedPage() {
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [activePlayerCount, setActivePlayerCount] = useState<number | undefined>()
  const [holeResultsByRound, setHoleResultsByRound] = useState<Record<string, HoleResult[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const season = await getCurrentSeason()
      const [r, lb, c] = await Promise.all([
        getRecentRounds(season.id, 100),
        getLeaderboard(season.id),
        getCourses(),
      ])
      const [activePlayers, holeResults] = await Promise.all([
        getActivePlayers(),
        getHoleResultsForRounds(r.map(x => x.id)),
      ])
      setRounds(r)
      setLeaderboard(lb)
      setCourses(c)
      setActivePlayerCount(activePlayers.length)
      const hrMap: Record<string, HoleResult[]> = {}
      for (const hr of holeResults) {
        hrMap[hr.round_id] = hrMap[hr.round_id] ?? []
        hrMap[hr.round_id].push(hr)
      }
      setHoleResultsByRound(hrMap)
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Ladataan...</div>
  }

  return (
    <div className="max-w-[480px] mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">Kierrosvirta</h1>
      {rounds.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">Ei kierroksia vielä</div>
      ) : (
        <div className="space-y-12">
          {rounds.map(round => (
            <RoundCard
              key={round.id}
              round={round}
              rank={leaderboard.find(e => e.player.id === round.player_id)?.rank}
              leaderboard={leaderboard}
              seasonCourses={courses}
              allRounds={rounds}
              holeResults={holeResultsByRound[round.id]}
              activePlayerCount={activePlayerCount}
            />
          ))}
        </div>
      )}
    </div>
  )
}
