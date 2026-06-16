import { useEffect, useState } from 'react'
import { getCurrentSeason, getRecentRounds, getLeaderboard, getCourses } from '../../lib/queries'
import type { RoundWithDetails, LeaderboardEntry, Course } from '../../lib/database.types'
import RoundCard from '../../components/RoundCard'

export default function AdminCards() {
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [selected, setSelected] = useState<RoundWithDetails | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const season = await getCurrentSeason()
      const [allRounds, lb, c] = await Promise.all([
        getRecentRounds(season.id, 50),
        getLeaderboard(season.id),
        getCourses(),
      ])
      setRounds(allRounds)
      setLeaderboard(lb)
      setCourses(c)
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-400">Ladataan...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Kortit</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Round list */}
        <div>
          <h2 className="font-bold text-gray-400 text-sm uppercase tracking-wider mb-3">
            Valitse kierros
          </h2>
          <div className="card divide-y divide-white/5 max-h-[65vh] overflow-y-auto">
            {rounds.length === 0 && (
              <div className="p-4 text-center text-gray-500 text-sm">Ei kierroksia</div>
            )}
            {rounds.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                  selected?.id === r.id
                    ? 'bg-gc-green/10 border-l-2 border-gc-green'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{r.player?.full_name}</div>
                  <div className="text-gray-500 text-xs">
                    {r.course?.name} · {new Date(r.played_date).toLocaleDateString('fi-FI')}
                  </div>
                </div>
                <div className="text-gc-green font-bold shrink-0">{r.total_points}p</div>
              </button>
            ))}
          </div>
        </div>

        {/* Card preview */}
        <div>
          {selected ? (
            <div>
              <h2 className="font-bold text-gray-400 text-sm uppercase tracking-wider mb-3">
                Esikatselu
              </h2>
              <RoundCard
                round={selected}
                rank={leaderboard.find(e => e.player.id === selected.player_id)?.rank}
                leaderboard={leaderboard}
                seasonCourses={courses}
                allRounds={rounds}
              />
            </div>
          ) : (
            <div className="card p-12 text-center text-gray-600">
              Valitse kierros vasemmalta
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
