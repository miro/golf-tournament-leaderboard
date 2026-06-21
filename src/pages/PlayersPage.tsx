import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentSeason, getLeaderboard, getActivePlayers, getSeasonCourses } from '../lib/queries'
import type { LeaderboardEntry, Player, Course } from '../lib/database.types'

const GOLD = '#FBBF24'
const CARD_BG = '#221D17'
const DOT_SLUGS = ['kajaani', 'nuas', 'tenetti', 'paltamo'] as const

interface CourseInfo { id: string; slug: string; name: string; color_hex: string | null }

function stblFmt(rounds_played: number, total_points: number): { text: string; color: string } {
  const net = rounds_played * 36 - total_points
  if (net < 0) return { text: `${net}`, color: '#E8453C' }
  if (net === 0) return { text: 'E', color: '#ffffff' }
  return { text: `+${net}`, color: '#ffffff' }
}

function Dots({ playedIds, courses, muted }: { playedIds: string[]; courses: CourseInfo[]; muted?: boolean }) {
  return (
    <div className="flex items-center gap-1 shrink-0 max-[480px]:hidden">
      {DOT_SLUGS.map(slug => {
        const c = courses.find(x => x.slug === slug)
        const played = !muted && c ? playedIds.includes(c.id) : false
        return (
          <div
            key={slug}
            style={{
              width: 10, height: 10, borderRadius: '50%',
              background: played ? (c?.color_hex ?? '#555') : 'transparent',
              border: played ? 'none' : `1px solid rgba(255,255,255,${muted ? 0.1 : 0.2})`,
            }}
          />
        )
      })}
    </div>
  )
}

function RankCircle({ rank, muted }: { rank?: number; muted?: boolean }) {
  if (muted) {
    return (
      <div
        className="flex items-center justify-center text-sm font-bold shrink-0"
        style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)' }}
      >
        —
      </div>
    )
  }
  return (
    <div
      className="flex items-center justify-center text-sm font-bold shrink-0"
      style={{ width: 32, height: 32, borderRadius: '50%', background: GOLD, color: '#17130F' }}
    >
      {rank}
    </div>
  )
}

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

  const inactivePlayers = allActivePlayers.filter(p => !leaderboard.find(e => e.player.id === p.id))
  const totalRounds = leaderboard.reduce((sum, e) => sum + e.rounds_played, 0)
  const remaining = allActivePlayers.length * 4 - totalRounds

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2 font-display">Pelaajat</h1>
      <p className="text-gray-600 text-sm mb-6">
        {leaderboard.length} pelaajaa aloittanut · {totalRounds} kierrosta pelattu · {remaining} kenttäsuoritusta jäljellä
      </p>

      <div className="card overflow-hidden">

        {/* ── Active players ── */}
        {leaderboard.length === 0 && inactivePlayers.length === 0 && (
          <div className="p-8 text-center text-gray-500">Ei pelaajia vielä</div>
        )}

        {leaderboard.map((entry, i) => {
          const stbl = stblFmt(entry.rounds_played, entry.total_points)
          const distinctCourses = new Set(entry.courses_played).size
          const isLeader = i === 0
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
              <RankCircle rank={entry.rank} />

              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-[15px] truncate font-display">{entry.player.full_name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">STBL</span>
                  <span className="text-[13px] font-bold tabular-nums font-display" style={{ color: stbl.color }}>
                    {stbl.text}
                  </span>
                </div>
              </div>

              <Dots playedIds={entry.courses_played} courses={courses} />

              <div className="text-right shrink-0 ml-1">
                <div className="text-xl font-bold tabular-nums font-display" style={{ color: GOLD }}>
                  {entry.total_points}p
                </div>
                <div className="text-[11px] text-gray-600 mt-0.5 tabular-nums">
                  {distinctCourses}/4 kenttää
                </div>
              </div>
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

        {/* ── Inactive players ── */}
        {inactivePlayers.map((player, i) => (
          <Link
            key={player.id}
            to={`/player/${player.slug}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
            style={i < inactivePlayers.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : undefined}
          >
            <RankCircle muted />

            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[15px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {player.full_name}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.15)' }}>STBL</span>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.2)' }}>–</span>
              </div>
            </div>

            <Dots playedIds={[]} courses={courses} muted />

            <div className="text-right shrink-0 ml-1">
              <div className="text-xl font-bold tabular-nums" style={{ color: 'rgba(255,255,255,0.2)' }}>0p</div>
              <div className="text-[11px] mt-0.5 tabular-nums" style={{ color: 'rgba(255,255,255,0.2)' }}>0/4 kenttää</div>
            </div>
          </Link>
        ))}

      </div>

      {/* ── Kenttätilanne ── */}
      {courses.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[10px] uppercase text-gray-600 mb-3 font-display font-medium" style={{ letterSpacing: '0.08em' }}>Kenttätilanne</h2>
          <div className="card px-4">
            {DOT_SLUGS.map((slug, i) => {
              const course = courses.find(c => c.slug === slug)
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
