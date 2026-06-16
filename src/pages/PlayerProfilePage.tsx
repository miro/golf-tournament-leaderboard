import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPlayerBySlug, getCurrentSeason, getPlayerRounds, getLeaderboard, getActivePlayers, getHoleResultsForRounds } from '../lib/queries'
import type { Player, LeaderboardEntry, RoundWithDetails, HoleResult } from '../lib/database.types'
import RoundCard from '../components/RoundCard'

export default function PlayerProfilePage() {
  const { slug } = useParams<{ slug: string }>()
  const [player, setPlayer] = useState<Player | null>(null)
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [entry, setEntry] = useState<LeaderboardEntry | null>(null)
  const [activePlayerCount, setActivePlayerCount] = useState<number | undefined>()
  const [holeResultsByRound, setHoleResultsByRound] = useState<Record<string, HoleResult[]>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      if (!slug) return
      const [p, season] = await Promise.all([getPlayerBySlug(slug), getCurrentSeason()])
      const [playerRounds, lb] = await Promise.all([
        getPlayerRounds(p.id, season.id),
        getLeaderboard(season.id),
      ])
      const [activePlayers, holeResults] = await Promise.all([
        getActivePlayers(),
        getHoleResultsForRounds(playerRounds.map(r => r.id)),
      ])
      setPlayer(p)
      setRounds(playerRounds)
      setLeaderboard(lb)
      setEntry(lb.find(e => e.player.id === p.id) ?? null)
      setActivePlayerCount(activePlayers.length)
      const hrMap: Record<string, HoleResult[]> = {}
      for (const hr of holeResults) {
        hrMap[hr.round_id] = hrMap[hr.round_id] ?? []
        hrMap[hr.round_id].push(hr)
      }
      setHoleResultsByRound(hrMap)
    }
    load()
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Ladataan...</div>
  }
  if (notFound || !player) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Pelaajaa ei löydy</div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">{player.full_name}</h1>
        {player.hcp_current != null && (
          <p className="text-gray-400 mt-1">HCP {player.hcp_current}</p>
        )}
      </div>

      {entry && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-gc-green">{entry.rank}</div>
            <div className="text-xs text-gray-500 mt-1">Sijoitus</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-white">{entry.total_points}</div>
            <div className="text-xs text-gray-500 mt-1">Pistettä</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-white">{entry.rounds_played}</div>
            <div className="text-xs text-gray-500 mt-1">Kierrosta</div>
          </div>
        </div>
      )}

      <h2 className="text-lg font-bold text-white mb-4">Kierroshistoria</h2>
      {rounds.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">Ei kierroksia vielä</div>
      ) : (
        <div className="space-y-8">
          {rounds.map(r => (
            <RoundCard
              key={r.id}
              round={r}
              rank={entry?.rank}
              leaderboard={leaderboard}
              holeResults={holeResultsByRound[r.id]}
              activePlayerCount={activePlayerCount}
              showCaption={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}
