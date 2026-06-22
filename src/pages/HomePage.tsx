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

function VaylamestariRankingSection({
  ranking,
  coursesBySlug,
}: {
  ranking: PlayerVaylamestariStats[]
  coursesBySlug: Map<string, CourseInfo>
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section>
      <h2 className="text-[13px] uppercase text-gray-600 mb-3 font-display font-semibold" style={{ letterSpacing: '0.12em' }}>Skins</h2>
      <div className="card overflow-hidden">
        {ranking.length === 0 ? (
          <div className="p-6 text-center text-gray-600 text-sm">
            Ei vielä väylämestariutta — tulokset päivittyvät kun kierroksia on syötetty
          </div>
        ) : (
          ranking.map((stats, i) => {
            const isOpen = openId === stats.player.id
            return (
              <div
                key={stats.player.id}
                style={{ borderBottom: i < ranking.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
              >
                {/* Main row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors select-none"
                  onClick={() => setOpenId(isOpen ? null : stats.player.id)}
                >
                  {/* Rank */}
                  <span className="text-[15px] font-semibold text-gray-500 w-4 text-right shrink-0 tabular-nums">
                    {i + 1}
                  </span>

                  {/* Name */}
                  <span className="shrink-0 text-white text-[18px] font-semibold font-display">
                    {stats.player.full_name}
                  </span>

                  {/* Course pills */}
                  <div className="flex flex-wrap gap-[6px] flex-1 items-center">
                    {COURSE_SLUG_ORDER.map(slug => {
                      const course = coursesBySlug.get(slug)
                      if (!course) return null
                      const count = stats.mestariPerCourse[course.id] ?? 0
                      if (count === 0) return null
                      const abbr = COURSE_ABBR[slug] ?? slug.substring(0, 3).toUpperCase()
                      const color = course.color_hex ?? '#888'
                      return (
                        <span
                          key={slug}
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color,
                            background: `${color}40`,
                            border: `1px solid ${color}99`,
                            borderRadius: 4,
                            padding: '3px 8px',
                            lineHeight: 1,
                          }}
                        >
                          {abbr} {count}
                        </span>
                      )
                    })}
                  </div>

                  {/* Mestari count */}
                  <span className="text-[17px] font-bold text-white tabular-nums shrink-0 flex items-center gap-1">
                    {stats.totalMestari}
                    <span style={{ color: GOLD, fontSize: 10 }}>⬤</span>
                  </span>

                  {/* Tied count (only if > 0) */}
                  {stats.totalJaettu > 0 && (
                    <span className="text-[14px] font-medium text-gray-500 tabular-nums shrink-0">
                      {stats.totalJaettu} ≈
                    </span>
                  )}

                  {/* Chevron */}
                  <span
                    className="text-[12px] text-gray-600 shrink-0"
                    style={{
                      display: 'inline-block',
                      transform: isOpen ? 'rotate(-90deg)' : 'rotate(90deg)',
                      transition: 'transform 150ms ease',
                      lineHeight: 1,
                    }}
                  >
                    ›
                  </span>
                </div>

                {/* Expandable panel */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateRows: isOpen ? '1fr' : '0fr',
                    transition: 'grid-template-rows 150ms ease',
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <div
                      style={{
                        paddingLeft: 40,
                        paddingRight: 16,
                        paddingTop: 8,
                        paddingBottom: 12,
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {COURSE_SLUG_ORDER.map(slug => {
                        const course = coursesBySlug.get(slug)
                        if (!course) return null
                        const holes = stats.mestariHolesPerCourse[course.id]
                        if (!holes || holes.length === 0) return null
                        const sortedHoles = [...holes].sort((a, b) => a - b)
                        const count = sortedHoles.length
                        return (
                          <div key={slug} className="flex items-center gap-2 py-[3px]">
                            <div
                              className="shrink-0"
                              style={{ width: 8, height: 8, borderRadius: '50%', background: course.color_hex ?? '#555' }}
                            />
                            <span
                              className="shrink-0"
                              style={{ fontSize: 13, fontWeight: 600, color: course.color_hex ?? '#9ca3af', minWidth: 56 }}
                            >
                              {course.name.toUpperCase()}
                            </span>
                            <span className="flex-1 text-gray-500" style={{ fontSize: 13, fontWeight: 400 }}>
                              Reikä {sortedHoles.join(', ')}
                            </span>
                            <span className="shrink-0 text-gray-500 text-right" style={{ fontSize: 13, fontWeight: 600 }}>
                              {count === 1 ? '1 skin' : `${count} skiniä`}
                            </span>
                          </div>
                        )
                      })}
                      {stats.totalJaettu > 0 && (
                        <div className="text-gray-600 mt-1" style={{ fontSize: 12 }}>
                          + {stats.totalJaettu} jaettua tulosta
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function FeedSeparator() {
  return (
    <div className="relative flex items-center justify-center" style={{ margin: '32px 0' }}>
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }} />
      <span className="relative text-sm px-2" style={{ background: PAGE_BG }}>⛳</span>
    </div>
  )
}
const COURSE_SLUG_ORDER = ['kajaani', 'nuas', 'tenetti', 'paltamo'] as const
const COURSE_ABBR: Record<string, string> = { kajaani: 'KAJ', nuas: 'NUA', tenetti: 'TEN', paltamo: 'PAL' }

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

interface PlayerVaylamestariStats {
  player: Player
  totalMestari: number
  totalJaettu: number
  mestariPerCourse: Record<string, number>
  mestariHolesPerCourse: Record<string, number[]>
}

function computeVaylamestariRanking(
  allRounds: RoundWithDetails[],
  allHoleResults: HoleResult[],
  courses: CourseInfo[],
): PlayerVaylamestariStats[] {
  const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)
  const roundById = new Map(allRounds.map(r => [r.id, r]))

  const statsMap = new Map<string, PlayerVaylamestariStats>()

  for (const course of courses) {
    const courseRoundIds = new Set(
      allRounds.filter(r => r.course_id === course.id).map(r => r.id)
    )
    const courseHoleResults = allHoleResults.filter(hr => courseRoundIds.has(hr.round_id))

    for (const holeNum of HOLES) {
      const allForHole = courseHoleResults.filter(
        hr => hr.hole_number === holeNum && hr.strokes_played != null
      )
      if (allForHole.length === 0) continue

      const minStrokes = Math.min(...allForHole.map(hr => hr.strokes_played!))
      const candidates = allForHole.filter(hr => hr.strokes_played === minStrokes)

      candidates.sort((a, b) => {
        const ra = roundById.get(a.round_id)
        const rb = roundById.get(b.round_id)
        const pd = (rb?.total_points ?? 0) - (ra?.total_points ?? 0)
        if (pd !== 0) return pd
        const hd = (rb?.hcp_at_time ?? 0) - (ra?.hcp_at_time ?? 0)
        if (hd !== 0) return hd
        return (ra?.submitted_at ?? '') < (rb?.submitted_at ?? '') ? -1 : 1
      })

      // Deduplicate by player_id (keep best per player after sort)
      const seenPlayers = new Set<string>()
      const deduped = candidates.filter(hr => {
        const pid = roundById.get(hr.round_id)?.player_id
        if (!pid || seenPlayers.has(pid)) return false
        seenPlayers.add(pid)
        return true
      })

      const winnerId = roundById.get(deduped[0]?.round_id ?? '')?.player_id ?? null

      for (const hr of deduped) {
        const round = roundById.get(hr.round_id)
        if (!round) continue
        const player = round.player as Player | undefined
        if (!player?.id) continue

        if (!statsMap.has(player.id)) {
          statsMap.set(player.id, { player, totalMestari: 0, totalJaettu: 0, mestariPerCourse: {}, mestariHolesPerCourse: {} })
        }
        const s = statsMap.get(player.id)!

        if (round.player_id === winnerId) {
          s.mestariPerCourse[course.id] = (s.mestariPerCourse[course.id] ?? 0) + 1
          s.mestariHolesPerCourse[course.id] = [...(s.mestariHolesPerCourse[course.id] ?? []), holeNum]
          s.totalMestari += 1
        } else {
          s.totalJaettu += 1
        }
      }
    }
  }

  return [...statsMap.values()]
    .filter(s => s.totalMestari > 0)
    .sort((a, b) =>
      b.totalMestari !== a.totalMestari
        ? b.totalMestari - a.totalMestari
        : b.totalJaettu - a.totalJaettu
    )
}

export default function HomePage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [courses, setCourses] = useState<CourseInfo[]>([])
  const [seasonCoursesFull, setSeasonCoursesFull] = useState<Course[]>([])
  const [activePlayers, setActivePlayers] = useState<Player[]>([])
  const [allRounds, setAllRounds] = useState<RoundWithDetails[]>([])
  const [holeResultsByRound, setHoleResultsByRound] = useState<Record<string, HoleResult[]>>({})
  const [vaylamestariRanking, setVaylamestariRanking] = useState<PlayerVaylamestariStats[]>([])
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
      const allHoleResults = await getHoleResultsForRounds(rounds.map(r => r.id))
      const coursesData: CourseInfo[] = sc.map(c => {
        const course = c.course as unknown as Course
        return { id: c.course_id, name: course?.name ?? c.course_id, slug: course?.slug ?? '', color_hex: course?.color_hex ?? null }
      })
      setLeaderboard(lb)
      setCourses(coursesData)
      setSeasonCoursesFull(sc.map(c => c.course as unknown as Course))
      setActivePlayers(players)
      setAllRounds(rounds)
      const recentIds = new Set(recentRounds.map(r => r.id))
      const hrMap: Record<string, HoleResult[]> = {}
      for (const hr of allHoleResults) {
        if (!recentIds.has(hr.round_id)) continue
        hrMap[hr.round_id] = hrMap[hr.round_id] ?? []
        hrMap[hr.round_id].push(hr)
      }
      setHoleResultsByRound(hrMap)
      setVaylamestariRanking(computeVaylamestariRanking(rounds, allHoleResults, coursesData))
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
        <h1 className="text-[28px] sm:text-[36px] font-extrabold font-display" style={{ color: GOLD }}>
          Liekkipoika Kesäkisa 2026
        </h1>
        <p className="text-gray-500 text-base">Golf Company</p>
        <div className="pt-2">
          <div className="text-[72px] sm:text-[96px] font-black tabular-nums font-display" style={{ color: daysColor, letterSpacing: '-0.02em' }}>
            {daysLeft}
          </div>
          <div className="text-[22px] font-semibold mt-1 font-display" style={{ color: daysColor }}>
            päivää jäljellä
          </div>
          <div className="text-[13px] text-gray-600 mt-1">Deadline 31.8.2026</div>
        </div>
      </div>

      {/* ── TULOSTAULUKKO ── */}
      <section>
        <h2 className="text-[13px] uppercase text-gray-600 mb-3 font-display font-semibold" style={{ letterSpacing: '0.12em' }}>Tulostaulukko</h2>
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
                  <span className="text-[16px] text-gray-500 w-4 text-right shrink-0 tabular-nums font-semibold">{i + 1}</span>

                  {/* Avatar */}
                  <div
                    className="shrink-0 flex items-center justify-center text-white text-xs font-bold"
                    style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor }}
                  >
                    {initials}
                  </div>

                  {/* Name */}
                  <span className="flex-1 font-bold text-white text-[20px] max-[480px]:text-[16px] truncate max-[480px]:whitespace-normal min-w-0 font-display">
                    {entry.player.full_name}
                  </span>

                  {/* Course dots */}
                  <div className="flex items-center gap-1 shrink-0 max-[480px]:hidden">
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
                    className="text-[28px] font-extrabold w-10 text-right tabular-nums shrink-0 font-display"
                    style={{ color: stblColor }}
                  >
                    {stblDisplay}
                  </span>

                  {/* Raw points */}
                  <span className="text-gray-500 text-[20px] w-10 text-right tabular-nums shrink-0 font-display font-bold">
                    {entry.total_points}p
                  </span>

                  {/* Gap to leader */}
                  <span className="text-gray-600 text-[13px] w-8 text-right tabular-nums shrink-0 font-medium max-[480px]:hidden">
                    {isLeader ? '' : `-${gapPts}p`}
                  </span>
                </Link>
              )
            })
          )}
        </div>
        {notStartedCount > 0 && (
          <p className="text-gray-700 text-[13px] mt-2 px-1">
            {notStartedCount} pelaajaa ei ole vielä aloittanut
          </p>
        )}
      </section>

      {/* ── KENTTÄTILANNE ── */}
      {courses.length > 0 && (
        <section>
          <h2 className="text-[13px] uppercase text-gray-600 mb-3 font-display font-semibold" style={{ letterSpacing: '0.12em' }}>Kenttätilanne</h2>
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
                  <span className="text-white text-[17px] font-semibold w-20 shrink-0">{course.name}</span>
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
                  <span className="text-gray-500 text-[15px] font-semibold shrink-0 w-9 text-right tabular-nums">
                    {playedCount}/{sortedActivePlayers.length}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── VÄYLÄMESTARI RANKING ── */}
      {vaylamestariRanking.length > 0 && (
        <VaylamestariRankingSection ranking={vaylamestariRanking} coursesBySlug={coursesBySlug} />
      )}

      {/* ── VIIMEISIMMÄT KIERROKSET ── */}
      {recentRounds.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] uppercase text-gray-600 font-display font-semibold" style={{ letterSpacing: '0.12em' }}>Viimeisimmät kierrokset</h2>
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
