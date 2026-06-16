import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentSeason, getLeaderboard, getSeasonCourses, getRecentRounds } from '../lib/queries'
import type { LeaderboardEntry, RoundWithDetails } from '../lib/database.types'
import RoundCard from '../components/RoundCard'

function useCountdown(deadline: string) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0 })
  useEffect(() => {
    function calc() {
      const diff = Math.max(0, new Date(deadline).getTime() - Date.now())
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
      })
    }
    calc()
    const id = setInterval(calc, 60000)
    return () => clearInterval(id)
  }, [deadline])
  return timeLeft
}

interface CourseInfo { id: string; name: string; color_hex: string | null }

export default function HomePage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [courses, setCourses] = useState<CourseInfo[]>([])
  const [recentRounds, setRecentRounds] = useState<RoundWithDetails[]>([])
  const [deadline, setDeadline] = useState('2026-08-31')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const countdown = useCountdown(deadline)

  useEffect(() => {
    async function load() {
      const season = await getCurrentSeason()
      setDeadline(season.deadline)
      const [lb, sc, rounds] = await Promise.all([
        getLeaderboard(season.id),
        getSeasonCourses(season.id),
        getRecentRounds(season.id, 3),
      ])
      setLeaderboard(lb)
      setCourses(
        sc.map(c => {
          const course = c.course as unknown as { id: string; name: string; color_hex: string | null }
          return { id: c.course_id, name: course?.name ?? c.course_id, color_hex: course?.color_hex ?? null }
        }),
      )
      setRecentRounds(rounds)
    }
    load().catch(() => setError('Tietoja ei voitu ladata')).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Ladataan...</div>
  }
  if (error) {
    return <div className="flex items-center justify-center min-h-[60vh] text-red-400">{error}</div>
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-12">
      {/* Header + countdown */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-extrabold text-gc-green">Liekkipoika Kesäkisa 2026</h1>
        <p className="text-gray-500">Golf Company</p>
        <div className="flex justify-center gap-4 mt-4">
          {[
            { value: countdown.days, label: 'päivää' },
            { value: countdown.hours, label: 'tuntia' },
            { value: countdown.minutes, label: 'minuuttia' },
          ].map(({ value, label }) => (
            <div key={label} className="card px-6 py-4 text-center min-w-[80px]">
              <div className="text-3xl font-bold text-gc-green">{value}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600">Deadline 31.8.2026</p>
      </div>

      {/* Leaderboard */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">Tulostaulukko</h2>
        <div className="card divide-y divide-white/5">
          {leaderboard.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Ei tuloksia vielä</div>
          ) : (
            leaderboard.map((entry, i) => (
              <Link
                key={entry.player.id}
                to={`/player/${entry.player.slug}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <div className="w-8 text-center font-bold text-gray-400">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </div>
                <div className="flex-1 font-medium text-white">{entry.player.full_name}</div>
                <div className="text-sm text-gray-500">{entry.rounds_played} kierr.</div>
                <div className="text-gc-green font-bold text-lg w-14 text-right">
                  {entry.total_points} p
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      {/* Course status grid */}
      {courses.length > 0 && leaderboard.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-white mb-4">Kenttätilanne</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Pelaaja</th>
                  {courses.map(c => (
                    <th key={c.id} className="px-3 py-3 text-center">
                      <span className="text-xs font-medium text-gray-400 whitespace-nowrap">
                        {c.name}
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-gray-400 font-medium text-xs">Yht.</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map(entry => (
                  <tr key={entry.player.id} className="border-t border-white/5">
                    <td className="px-4 py-3 text-white font-medium">{entry.player.full_name}</td>
                    {courses.map(c => (
                      <td key={c.id} className="px-3 py-3 text-center">
                        {entry.courses_played.includes(c.id) ? (
                          <span className="text-gc-green text-base">✓</span>
                        ) : (
                          <span className="text-gray-700">–</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center text-gray-400 text-xs">
                      {entry.courses_played.length}/{courses.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Activity feed preview */}
      {recentRounds.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Viimeisimmät kierrokset</h2>
            <Link to="/feed" className="text-gc-green text-sm hover:underline">
              Kaikki →
            </Link>
          </div>
          <div className="space-y-3">
            {recentRounds.map(round => (
              <RoundCard
                key={round.id}
                round={round}
                rank={leaderboard.find(e => e.player.id === round.player_id)?.rank}
                totalPlayers={leaderboard.length}
                compact
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
