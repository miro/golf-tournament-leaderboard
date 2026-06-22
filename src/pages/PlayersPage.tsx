import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentSeason, getLeaderboard, getActivePlayers, getSeasonCourses } from '../lib/queries'
import type { LeaderboardEntry, Player, Course } from '../lib/database.types'

const GOLD = '#FBBF24'
const CARD_BG = '#221D17'
const DOT_SLUGS = ['kajaani', 'nuas', 'tenetti', 'paltamo'] as const

interface CourseInfo { id: string; slug: string; name: string; color_hex: string | null }

export default function PlayersPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [allActivePlayers, setAllActivePlayers] = useState<Player[]>([])
  const [courses, setCourses] = useState<CourseInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const season = await getCurrentSeason()
      const [lb, players, sc] = await Promise.all([
        getLeaderboard(season.id),
        getActivePlayers(),
        getSeasonCourses(season.id),
      ])
      setLeaderboard(lb)
      setAllActivePlayers(players)
      setCourses(sc.map(c => {
        const course = c.course as unknown as Course
        return {
          id: c.course_id,
          slug: course?.slug ?? '',
          name: course?.name ?? '',
          color_hex: course?.color_hex ?? null,
        }
      }))
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Ladataan...</div>
  }

  const courseById = new Map(courses.map(c => [c.id, c]))
  const courseBySlug = new Map(courses.map(c => [c.slug, c]))
  const inactivePlayers = allActivePlayers.filter(p => !leaderboard.find(e => e.player.id === p.id))
  const totalRounds = leaderboard.reduce((sum, e) => sum + e.rounds_played, 0)
  const remaining = allActivePlayers.length * 4 - totalRounds
  const leaderPts = leaderboard[0]?.total_points ?? 0

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2 font-display">Pelaajat</h1>
      <p className="text-gray-600 text-sm mb-6">
        {leaderboard.length} pelaajaa aloittanut · {totalRounds} kierrosta pelattu · {remaining} kenttäsuoritusta jäljellä
      </p>

      <div className="card overflow-hidden">

        {leaderboard.length === 0 && inactivePlayers.length === 0 && (
          <div className="p-8 text-center text-gray-500">Ei pelaajia vielä</div>
        )}

        {leaderboard.map((entry, i) => {
          const stblNet = entry.rounds_played * 36 - entry.total_points
          const stblDisplay = stblNet < 0 ? `${stblNet}` : stblNet === 0 ? 'E' : `+${stblNet}`
          const stblColor = stblNet < 0 ? '#E8453C' : '#ffffff'
          const gapPts = leaderPts - entry.total_points
          const isLeader = i === 0
          const initials = entry.player.full_name.substring(0, 2).toUpperCase()
          const avatarCourse = courseById.get(entry.courses_played[entry.courses_played.length - 1] ?? '')
          const avatarColor = avatarCourse?.color_hex ?? '#4b5563'

          return (
            <Link
              key={entry.player.id}
              to={`/player/${entry.player.slug}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
              style={{
                borderLeft: `3px solid ${isLeader ? GOLD : 'transparent'}`,
                background: isLeader ? 'rgba(251,191,36,0.04)' : undefined,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <span className="text-[16px] text-gray-500 w-4 text-right shrink-0 tabular-nums font-semibold">{i + 1}</span>

              <div
                className="shrink-0 flex items-center justify-center text-white text-xs font-bold"
                style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor }}
              >
                {initials}
              </div>

              <span className="flex-1 font-bold text-white text-[20px] max-[480px]:text-[16px] truncate max-[480px]:whitespace-normal min-w-0 font-display">
                {entry.player.full_name}
              </span>

              <div className="flex items-center gap-1 shrink-0 max-[480px]:hidden">
                {DOT_SLUGS.map(slug => {
                  const c = courseBySlug.get(slug)
                  const played = c ? entry.courses_played.includes(c.id) : false
                  return (
                    <div
                      key={slug}
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: played ? (c?.color_hex ?? '#555') : 'transparent',
                        border: played ? 'none' : '1px solid rgba(255,255,255,0.18)',
                      }}
                    />
                  )
                })}
              </div>

              <span
                className="text-[28px] font-extrabold w-10 text-right tabular-nums shrink-0 font-display"
                style={{ color: stblColor }}
              >
                {stblDisplay}
              </span>

              <span className="text-gray-500 text-[20px] w-10 text-right tabular-nums shrink-0 font-display font-bold">
                {entry.total_points}p
              </span>

              <span className="text-gray-600 text-[13px] w-8 text-right tabular-nums shrink-0 font-medium max-[480px]:hidden">
                {isLeader ? '' : `-${gapPts}p`}
              </span>
            </Link>
          )
        })}

        {/* ── Divider ── */}
        {inactivePlayers.length > 0 && (
          <div className="relative flex items-center justify-center" style={{ padding: '12px 0' }}>
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />
            <span
              className="relative text-[10px] uppercase tracking-widest text-gray-600 px-3"
              style={{ background: CARD_BG }}
            >
              Ei vielä aloittanut
            </span>
          </div>
        )}

        {inactivePlayers.map((player, i) => {
          const initials = player.full_name.substring(0, 2).toUpperCase()
          return (
            <Link
              key={player.id}
              to={`/player/${player.slug}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
              style={i < inactivePlayers.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : undefined}
            >
              <span className="text-[16px] w-4 text-right shrink-0 tabular-nums font-semibold" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>

              <div
                className="shrink-0 flex items-center justify-center text-xs font-bold"
                style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)' }}
              >
                {initials}
              </div>

              <span
                className="flex-1 text-[20px] max-[480px]:text-[16px] truncate max-[480px]:whitespace-normal min-w-0 font-display font-bold"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                {player.full_name}
              </span>

              <div className="flex items-center gap-1 shrink-0 max-[480px]:hidden">
                {DOT_SLUGS.map(slug => (
                  <div
                    key={slug}
                    className="w-2 h-2 rounded-full"
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                ))}
              </div>

              <span className="text-[28px] font-extrabold w-10 text-right tabular-nums shrink-0 font-display" style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>

              <span className="text-[20px] w-10 text-right tabular-nums shrink-0 font-display font-bold" style={{ color: 'rgba(255,255,255,0.15)' }}>0p</span>

              <span className="w-8 shrink-0 max-[480px]:hidden" />
            </Link>
          )
        })}

      </div>

      {/* ── Kenttätilanne ── */}
      {courses.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[10px] uppercase text-gray-600 mb-3 font-display font-medium" style={{ letterSpacing: '0.08em' }}>Kenttätilanne</h2>
          <div className="card px-4">
            {DOT_SLUGS.map((slug, i) => {
              const course = courseBySlug.get(slug)
              if (!course) return null
              const playedCount = allActivePlayers.filter(p =>
                leaderboard.find(e => e.player.id === p.id)?.courses_played.includes(course.id) ?? false
              ).length
              return (
                <Link
                  key={slug}
                  to={`/courses/${slug}`}
                  className="flex items-center gap-3 py-3 hover:bg-white/5 -mx-4 px-4 transition-colors"
                  style={i < DOT_SLUGS.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.05)' } : undefined}
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: course.color_hex ?? '#555' }} />
                  <span className="text-white text-sm font-medium w-20 shrink-0">{course.name}</span>
                  <div className="flex flex-wrap gap-1 flex-1">
                    {allActivePlayers.map(p => {
                      const played = leaderboard.find(e => e.player.id === p.id)?.courses_played.includes(course.id) ?? false
                      return (
                        <div
                          key={p.id}
                          style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: played ? (course.color_hex ?? '#555') : 'transparent',
                            border: played ? 'none' : '1px solid rgba(255,255,255,0.2)',
                          }}
                        />
                      )
                    })}
                  </div>
                  <span className="text-gray-500 text-xs shrink-0 w-9 text-right tabular-nums">
                    {playedCount}/{allActivePlayers.length}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

    </div>
  )
}
