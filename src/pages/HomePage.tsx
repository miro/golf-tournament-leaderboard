import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getCurrentSeason, getLeaderboard, getSeasonCourses,
  getAllSeasonRounds, getActivePlayers, getHoleResultsForRounds,
} from '../lib/queries'
import type { LeaderboardEntry, RoundWithDetails, HoleResult, Player, Course } from '../lib/database.types'
import RoundCard from '../components/RoundCard'

const GOLD = '#FBBF24'
const PAGE_BG = '#17130F'

function FeedSeparator() {
  return (
    <div className="relative flex items-center justify-center" style={{ margin: '32px 0' }}>
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }} />
      <span className="relative text-sm px-2" style={{ background: PAGE_BG }}>⛳</span>
    </div>
  )
}
const COURSE_SLUG_ORDER = ['kajaani', 'nuas', 'tenetti', 'paltamo'] as const

function useCountdownDays(deadline: string): number {
  const [days, setDays] = useState(0)
  useEffect(() => {
    function calc() {
      setDays(Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 86400000)))
    }
    calc()
    const id = setInterval(calc, 3600000)
    return () => clearInterval(id)
  }, [deadline])
  return days
}

interface CourseInfo { id: string; name: string; slug: string; color_hex: string | null }

export default function HomePage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [courses, setCourses] = useState<CourseInfo[]>([])
  const [seasonCoursesFull, setSeasonCoursesFull] = useState<Course[]>([])
  const [activePlayers, setActivePlayers] = useState<Player[]>([])
  const [allRounds, setAllRounds] = useState<RoundWithDetails[]>([])
  const [holeResultsByRound, setHoleResultsByRound] = useState<Record<string, HoleResult[]>>({})
  const [deadline, setDeadline] = useState('2026-08-31')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const daysLeft = useCountdownDays(deadline)
  const daysColor = daysLeft < 7 ? '#E8453C' : daysLeft < 14 ? '#F59E0B' : GOLD

  useEffect(() => {
    async function load() {
      const season = await getCurrentSeason()
      setDeadline(season.deadline)
      const [lb, sc, rounds, players] = await Promise.all([
        getLeaderboard(season.id),
        getSeasonCourses(season.id),
        getAllSeasonRounds(season.id),
        getActivePlayers(),
      ])
      const recentRounds = rounds.slice(0, 5)
      const holeResults = await getHoleResultsForRounds(recentRounds.map(r => r.id))
      setLeaderboard(lb)
      setCourses(sc.map(c => {
        const course = c.course as unknown as Course
        return { id: c.course_id, name: course?.name ?? c.course_id, slug: course?.slug ?? '', color_hex: course?.color_hex ?? null }
      }))
      setSeasonCoursesFull(sc.map(c => c.course as unknown as Course))
      setActivePlayers(players)
      setAllRounds(rounds)
      const hrMap: Record<string, HoleResult[]> = {}
      for (const hr of holeResults) {
        hrMap[hr.round_id] = hrMap[hr.round_id] ?? []
        hrMap[hr.round_id].push(hr)
      }
      setHoleResultsByRound(hrMap)
    }
    load().catch(() => setError('Tietoja ei voitu ladata')).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Ladataan...</div>
  if (error)   return <div className="flex items-center justify-center min-h-[60vh] text-red-400">{error}</div>

  // Derived
  const courseMap = new Map(courses.map(c => [c.id, c]))
  const coursesBySlug = new Map(courses.map(c => [c.slug, c]))
  const sortedActivePlayers = [...activePlayers].sort((a, b) => a.full_name.localeCompare(b.full_name))
  const notStartedCount = activePlayers.filter(p => !leaderboard.find(e => e.player.id === p.id)).length
  const leaderPts = leaderboard[0]?.total_points ?? 0

  const recentRounds = allRounds.slice(0, 5)

  // Most recently played course per player (from recent rounds, sorted newest first)
  const latestCourseByPlayer: Record<string, string> = {}
  for (const r of recentRounds) {
    if (!latestCourseByPlayer[r.player_id]) latestCourseByPlayer[r.player_id] = r.course_id
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-12">

      {/* ── HERO ── */}
      <div className="text-center space-y-3 pt-2">
        <img src="/gc-logo.png" alt="Golf Company" style={{ height: 120, width: 'auto', filter: 'invert(1)', margin: '0 auto' }} />
        <h1 className="text-3xl font-extrabold" style={{ color: GOLD }}>
          Liekkipoika Kesäkisa 2026
        </h1>
        <p className="text-gray-500 text-sm">Golf Company</p>
        <div className="pt-2">
          <div className="text-5xl font-black tabular-nums" style={{ color: daysColor }}>
            {daysLeft}
          </div>
          <div className="text-base font-medium mt-1" style={{ color: daysColor }}>
            päivää jäljellä
          </div>
          <div className="text-xs text-gray-600 mt-1">Deadline 31.8.2026</div>
        </div>
      </div>

      {/* ── TULOSTAULUKKO ── */}
      <section>
        <h2 className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Tulostaulukko</h2>
        <div className="card overflow-hidden">
          {leaderboard.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Ei tuloksia vielä</div>
          ) : (
            leaderboard.map((entry, i) => {
              const stblNet = entry.rounds_played * 36 - entry.total_points
              const stblDisplay = stblNet < 0 ? `${stblNet}` : stblNet === 0 ? 'E' : `+${stblNet}`
              const stblColor = stblNet < 0 ? '#E8453C' : '#ffffff'
              const gapPts = leaderPts - entry.total_points
              const initials = entry.player.full_name.substring(0, 2).toUpperCase()
              const latestCourse = latestCourseByPlayer[entry.player.id]
                ?? entry.courses_played[entry.courses_played.length - 1]
              const avatarColor = courseMap.get(latestCourse)?.color_hex ?? '#4b5563'
              const isLeader = i === 0

              return (
                <Link
                  key={entry.player.id}
                  to={`/player/${entry.player.slug}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                  style={{
                    borderLeft: `3px solid ${isLeader ? GOLD : 'transparent'}`,
                    background: isLeader ? 'rgba(251,191,36,0.04)' : undefined,
                    borderBottom: i < leaderboard.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}
                >
                  {/* Rank */}
                  <span className="text-sm text-gray-500 w-4 text-right shrink-0 tabular-nums">{i + 1}</span>

                  {/* Avatar */}
                  <div
                    className="shrink-0 flex items-center justify-center text-white text-xs font-bold"
                    style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor }}
                  >
                    {initials}
                  </div>

                  {/* Name */}
                  <span className="flex-1 font-medium text-white text-sm truncate min-w-0">
                    {entry.player.full_name}
                  </span>

                  {/* Course dots */}
                  <div className="flex items-center gap-1 shrink-0">
                    {COURSE_SLUG_ORDER.map(slug => {
                      const c = coursesBySlug.get(slug)
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

                  {/* STBL net */}
                  <span
                    className="text-xl font-bold w-10 text-right tabular-nums shrink-0"
                    style={{ color: stblColor }}
                  >
                    {stblDisplay}
                  </span>

                  {/* Raw points */}
                  <span className="text-gray-500 text-sm w-10 text-right tabular-nums shrink-0">
                    {entry.total_points}p
                  </span>

                  {/* Gap to leader */}
                  <span className="text-gray-600 text-xs w-8 text-right tabular-nums shrink-0">
                    {isLeader ? '' : `-${gapPts}p`}
                  </span>
                </Link>
              )
            })
          )}
        </div>
        {notStartedCount > 0 && (
          <p className="text-gray-700 text-xs mt-2 px-1">
            {notStartedCount} pelaajaa ei ole vielä aloittanut
          </p>
        )}
      </section>

      {/* ── KENTTÄTILANNE ── */}
      {courses.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Kenttätilanne</h2>
          <div className="card px-4">
            {COURSE_SLUG_ORDER.map((slug, i) => {
              const course = coursesBySlug.get(slug)
              if (!course) return null
              const playedCount = sortedActivePlayers.filter(p =>
                leaderboard.find(e => e.player.id === p.id)?.courses_played.includes(course.id) ?? false
              ).length
              return (
                <Link
                  key={slug}
                  to={`/courses/${slug}`}
                  className="flex items-center gap-3 py-3 hover:bg-white/5 -mx-4 px-4 transition-colors"
                  style={i < COURSE_SLUG_ORDER.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.05)' } : undefined}
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: course.color_hex ?? '#555' }} />
                  <span className="text-white text-sm font-medium w-20 shrink-0">{course.name}</span>
                  <div className="flex flex-wrap gap-1 flex-1">
                    {sortedActivePlayers.map(p => {
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
                    {playedCount}/{sortedActivePlayers.length}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── VIIMEISIMMÄT KIERROKSET ── */}
      {recentRounds.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] uppercase tracking-widest text-gray-600">Viimeisimmät kierrokset</h2>
            <Link to="/feed" className="text-gc-green text-sm hover:underline">Kaikki →</Link>
          </div>
          <div className="max-w-[480px] mx-auto">
            {recentRounds.map((round, i) => (
              <Fragment key={round.id}>
                <RoundCard
                  round={round}
                  seasonCourses={seasonCoursesFull}
                  allRounds={allRounds}
                  holeResults={holeResultsByRound[round.id]}
                  activePlayerCount={activePlayers.length}
                  showCaption={false}
                />
                {i < recentRounds.length - 1 && <FeedSeparator />}
              </Fragment>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
