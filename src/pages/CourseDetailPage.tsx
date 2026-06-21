import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getCourseBySlug, getCourseRounds, getCurrentSeason, getLeaderboard,
  getCourses, getActivePlayers, getHoleResultsForRounds, getSeasonRoundAverages,
} from '../lib/queries'
import type { Course, LeaderboardEntry, RoundWithDetails, HoleResult } from '../lib/database.types'
import RoundCard from '../components/RoundCard'

// ── Helpers ─────────────────────────────────────────────────────────────────

const CARD_BG = '#1a1a18'


function abbrevName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return (parts[parts.length - 1] ?? parts[0]).substring(0, 4).toUpperCase()
}

function fmtStbl(net: number): { text: string; color: string } {
  if (net < 0) return { text: `${net}`, color: '#E8453C' }
  if (net === 0) return { text: 'E', color: '#ffffff' }
  return { text: `+${net}`, color: '#ffffff' }
}

function fmtToPar(diff: number): { text: string; color: string } {
  if (diff < 0) return { text: `${diff}`, color: '#E8453C' }
  if (diff === 0) return { text: 'E', color: '#ffffff' }
  return { text: `+${diff}`, color: '#ffffff' }
}

// ── RankTable ────────────────────────────────────────────────────────────────

interface RankRow {
  rank: number
  name: string
  primary: string
  derived: { text: string; color: string }
  isFirst: boolean
}

function RankTable({
  title, subtitle, colPrimary, colDerived, rows, color,
}: {
  title: string; subtitle: string; colPrimary: string; colDerived: string
  rows: RankRow[]; color: string
}) {
  return (
    <div style={{ background: CARD_BG, borderRadius: 12, padding: 16 }}>
      <div className="mb-3">
        <div className="text-white font-bold text-sm">{title}</div>
        <div className="text-gray-600 text-[11px] mt-0.5">{subtitle}</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-center text-gray-600 text-sm py-4">Ei vielä tuloksia</div>
      ) : (
        <div>
          <div className="grid grid-cols-[20px_1fr_auto_auto] gap-x-2 pb-1.5 mb-1.5"
               style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-[10px] uppercase tracking-widest text-gray-600">#</span>
            <span className="text-[10px] uppercase tracking-widest text-gray-600">Pelaaja</span>
            <span className="text-[10px] uppercase tracking-widest text-gray-600 text-right pr-2">{colPrimary}</span>
            <span className="text-[10px] uppercase tracking-widest text-gray-600 text-right">{colDerived}</span>
          </div>
          {rows.map((row, i) => (
            <div
              key={row.rank}
              className="grid grid-cols-[20px_1fr_auto_auto] gap-x-2 items-center py-1.5"
              style={i < rows.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.05)' } : undefined}
            >
              <span className="text-[13px] font-semibold" style={{ color: '#6b7280' }}>{row.rank}</span>
              <span className="text-[13px] truncate" style={{ color: row.isFirst ? color : '#ffffff', fontWeight: row.isFirst ? 700 : 400 }}>
                {row.name}
              </span>
              <span className="text-[13px] font-semibold text-right pr-2" style={{ color: row.isFirst ? color : '#ffffff' }}>
                {row.primary}
              </span>
              <span className="text-[13px] font-semibold text-right tabular-nums" style={{ color: row.derived.color }}>
                {row.derived.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CourseRankings ───────────────────────────────────────────────────────────

function CourseRankings({ rounds, course }: { rounds: RoundWithDetails[]; course: Course }) {
  const color = course.color_hex ?? '#2D6A4F'

  const pbMap = new Map<string, { name: string; points: number }>()
  for (const r of rounds) {
    const ex = pbMap.get(r.player_id)
    if (!ex || r.total_points > ex.points) {
      pbMap.set(r.player_id, { name: r.player?.full_name ?? '–', points: r.total_points })
    }
  }
  const pbRows: RankRow[] = [...pbMap.values()]
    .sort((a, b) => b.points - a.points)
    .map((e, i) => ({
      rank: i + 1, name: e.name, primary: `${e.points}p`,
      derived: fmtStbl(36 - e.points), isFirst: i === 0,
    }))

  const scrMap = new Map<string, { name: string; strokes: number }>()
  for (const r of rounds) {
    if (r.total_strokes == null) continue
    const ex = scrMap.get(r.player_id)
    if (!ex || r.total_strokes < ex.strokes) {
      scrMap.set(r.player_id, { name: r.player?.full_name ?? '–', strokes: r.total_strokes })
    }
  }
  const scrRows: RankRow[] = [...scrMap.values()]
    .sort((a, b) => a.strokes - b.strokes)
    .map((e, i) => ({
      rank: i + 1, name: e.name, primary: `${e.strokes}`,
      derived: fmtToPar(e.strokes - course.par_total), isFirst: i === 0,
    }))

  return (
    <div className="mb-4">
      <div className="text-gray-600 text-[10px] uppercase tracking-widest mb-3">Kenttäranking</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RankTable title="PISTEBOGEY" subtitle="eniten pisteitä voittaa"
          colPrimary="Pisteet" colDerived="STBL" rows={pbRows} color={color} />
        <RankTable title="SCRATCH" subtitle="vähiten lyöntejä voittaa"
          colPrimary="Lyönnit" colDerived="+/- Par" rows={scrRows} color={color} />
      </div>
    </div>
  )
}

// ── VaylamestariGrid ─────────────────────────────────────────────────────────

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)
const RED = '#E8453C'
const BLUE = '#5B9BD5'

function holeStrokeStyle(strokes: number, par: number): {
  outer: string | null; inner: string | null; radius: number | string; color: string
} {
  const diff = strokes - par
  if (diff <= -2) return { outer: RED,  inner: RED,  radius: '50%', color: '#ffffff' }
  if (diff === -1) return { outer: RED,  inner: null, radius: '50%', color: '#ffffff' }
  if (diff === 0)  return { outer: null, inner: null, radius: 0,     color: '#ffffff' }
  if (diff === 1)  return { outer: BLUE, inner: null, radius: 2,     color: '#ffffff' }
  if (diff === 2)  return { outer: BLUE, inner: BLUE, radius: 2,     color: '#ffffff' }
  return               { outer: null, inner: null, radius: 0,     color: '#6b7280' }
}

function VaylamestariGrid({
  rounds,
  holeResultsByRound,
  course,
}: {
  rounds: RoundWithDetails[]
  holeResultsByRound: Record<string, HoleResult[]>
  course: Course
}) {
  const color = course.color_hex ?? '#2D6A4F'

  const roundById = new Map(rounds.map(r => [r.id, r]))
  const flatHole = Object.entries(holeResultsByRound).flatMap(([rid, hrs]) =>
    hrs.map(hr => ({ hr, round: roundById.get(rid) ?? null }))
  )

  // PB leader player_id for Mestari row highlight
  const pbLeaderPlayerId: string | null = (() => {
    const pbMap = new Map<string, number>()
    for (const r of rounds) {
      const ex = pbMap.get(r.player_id)
      if (!ex || r.total_points > ex) pbMap.set(r.player_id, r.total_points)
    }
    if (pbMap.size === 0) return null
    return [...pbMap.entries()].sort((a, b) => b[1] - a[1])[0][0]
  })()

  const holeChampions = HOLES.map(holeNum => {
    const holeData = flatHole.filter(x => x.hr.hole_number === holeNum && x.hr.strokes_played != null)
    if (holeData.length === 0) {
      return { holeNumber: holeNum, par: null as number | null, bestStrokes: null as number | null, playerName: null as string | null, isLeader: false }
    }
    const par = holeData[0].hr.par
    const minStrokes = Math.min(...holeData.map(x => x.hr.strokes_played!))
    const candidates = [...holeData.filter(x => x.hr.strokes_played === minStrokes)]
    candidates.sort((a, b) => {
      const pd = (b.round?.total_points ?? 0) - (a.round?.total_points ?? 0)
      if (pd !== 0) return pd
      const hd = (b.round?.hcp_at_time ?? 0) - (a.round?.hcp_at_time ?? 0)
      if (hd !== 0) return hd
      return (a.round?.submitted_at ?? '') < (b.round?.submitted_at ?? '') ? -1 : 1
    })
    const winner = candidates[0]
    const winnerPlayerId = winner.round?.player_id ?? null
    return {
      holeNumber: holeNum,
      par,
      bestStrokes: minStrokes,
      playerName: winner.round?.player?.full_name ?? null,
      isLeader: winnerPlayerId !== null && winnerPlayerId === pbLeaderPlayerId,
    }
  })

  const hasAnyData = flatHole.length > 0

  return (
    <div className="mb-8">
      <div className="text-gray-600 text-[10px] uppercase tracking-widest mb-3">Väylämestari</div>
      <div style={{ background: CARD_BG, borderRadius: 12, overflow: 'hidden' }}>
        {!hasAnyData ? (
          <div className="text-center text-gray-600 text-sm py-8 px-4">
            Ei vielä reikätuloksia — tulokset näkyvät kun ensimmäinen kierros on syötetty
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 64 + 18 * 44, padding: 16, paddingBottom: 12 }}>
              {/* Row 1: Hole numbers */}
              <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ width: 64, minWidth: 64, height: 32 }} className="text-[10px] uppercase tracking-widest text-gray-600 flex items-center">
                  Reikä
                </div>
                {HOLES.map(h => (
                  <div key={h} style={{ width: 44, minWidth: 44, height: 32 }} className="flex items-center justify-center text-[10px] uppercase tracking-widest text-gray-600">
                    {h}
                  </div>
                ))}
              </div>

              {/* Row 2: Par */}
              <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 64, minWidth: 64, height: 32 }} className="text-[10px] uppercase tracking-widest text-gray-600 flex items-center">
                  Par
                </div>
                {holeChampions.map(({ holeNumber, par }) => (
                  <div key={holeNumber} style={{ width: 44, minWidth: 44, height: 32 }} className="flex items-center justify-center text-[13px] text-gray-500">
                    {par ?? '–'}
                  </div>
                ))}
              </div>

              {/* Row 3: Lyönnit (min strokes) with scorecard color coding */}
              <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 64, minWidth: 64, height: 44 }} className="text-[10px] uppercase tracking-widest text-gray-600 flex items-center">
                  Lyönnit
                </div>
                {holeChampions.map(({ holeNumber, par, bestStrokes }) => {
                  if (bestStrokes === null || par === null) {
                    return (
                      <div key={holeNumber} style={{ width: 44, minWidth: 44, height: 44 }} className="flex items-center justify-center">
                        <span className="text-[13px]" style={{ color: '#374151' }}>—</span>
                      </div>
                    )
                  }
                  const s = holeStrokeStyle(bestStrokes, par)
                  return (
                    <div key={holeNumber} style={{ width: 44, minWidth: 44, height: 44 }} className="flex items-center justify-center">
                      <div style={{
                        width: 30, height: 30,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: s.outer ? `1.5px solid ${s.outer}` : 'none',
                        borderRadius: s.radius,
                        position: 'relative',
                      }}>
                        {s.inner && (
                          <div style={{
                            position: 'absolute',
                            inset: 4,
                            border: `1.5px solid ${s.inner}`,
                            borderRadius: s.radius,
                          }} />
                        )}
                        <span className="text-[13px] font-semibold" style={{ color: s.color, position: 'relative' }}>
                          {bestStrokes}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Row 4: Mestari */}
              <div className="flex">
                <div style={{ width: 64, minWidth: 64, height: 32 }} className="text-[10px] uppercase tracking-widest text-gray-600 flex items-center">
                  Mestari
                </div>
                {holeChampions.map(({ holeNumber, playerName, isLeader }) => (
                  <div key={holeNumber} style={{ width: 44, minWidth: 44, height: 32 }} className="flex items-center justify-center">
                    <span className="text-[11px] font-bold"
                          style={{ color: playerName ? (isLeader ? color : 'rgba(255,255,255,0.35)') : '#374151' }}>
                      {playerName ? abbrevName(playerName) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

const COURSE_HERO: Record<string, string> = {
  kajaani: '/course-hero-kag.jpg',
  paltamo: '/course-hero-paltamo.jpg',
  nuas:    '/course-hero-nuas.jpg',
  tenetti: '/course-hero-tenetti.jpg',
}

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [course, setCourse] = useState<Course | null>(null)
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [allCourses, setAllCourses] = useState<Course[]>([])
  const [activePlayerCount, setActivePlayerCount] = useState<number | undefined>()
  const [holeResultsByRound, setHoleResultsByRound] = useState<Record<string, HoleResult[]>>({})
  const [courseAverages, setCourseAverages] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      if (!slug) return
      const [c, season] = await Promise.all([getCourseBySlug(slug), getCurrentSeason()])
      const [courseRounds, lb, ac] = await Promise.all([
        getCourseRounds(c.id, season.id),
        getLeaderboard(season.id),
        getCourses(),
      ])
      const [activePlayers, holeResults, avgs] = await Promise.all([
        getActivePlayers(),
        getHoleResultsForRounds(courseRounds.map(r => r.id)),
        getSeasonRoundAverages(season.id),
      ])
      setCourse(c)
      setRounds(courseRounds)
      setLeaderboard(lb)
      setAllCourses(ac)
      setActivePlayerCount(activePlayers.length)
      setCourseAverages(avgs)
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
  if (notFound || !course) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Kenttää ei löydy</div>
  }

  const color = course.color_hex ?? '#2D6A4F'

  // Stat box derived values
  const distinctPlayers = new Set(rounds.map(r => r.player_id)).size
  const avgPoints = rounds.length > 0
    ? rounds.reduce((sum, r) => sum + r.total_points, 0) / rounds.length
    : null
  const pbRecord = rounds.length > 0 ? rounds[0] : null  // sorted DESC by total_points
  const leaderLastName = pbRecord?.player?.full_name.trim().split(/\s+/).pop() ?? null

  // Kenttäkeskiarvo context line
  let avgContextText: string | null = null
  if (avgPoints !== null) {
    const thisAvg = courseAverages[course.id]
    if (thisAvg !== undefined) {
      const allAvgs = Object.values(courseAverages)
      if (allAvgs.length > 1) {
        const minAvg = Math.min(...allAvgs)
        const maxAvg = Math.max(...allAvgs)
        if (thisAvg <= minAvg) {
          avgContextText = `Kierrosten keskiarvo: ${avgPoints.toFixed(1)} pistettä — Vaikein kenttä tähän mennessä 💪`
        } else if (thisAvg >= maxAvg) {
          avgContextText = `Kierrosten keskiarvo: ${avgPoints.toFixed(1)} pistettä — Helpoin kenttä tähän mennessä`
        } else {
          avgContextText = `Kierrosten keskiarvo: ${avgPoints.toFixed(1)} pistettä`
        }
      } else {
        avgContextText = `Kierrosten keskiarvo: ${avgPoints.toFixed(1)} pistettä`
      }
    } else if (rounds.length > 0) {
      avgContextText = `Kierrosten keskiarvo: ${avgPoints.toFixed(1)} pistettä`
    }
  }

  const heroSrc = COURSE_HERO[course.slug ?? '']

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Hero image */}
      {heroSrc && (
        <div className="relative h-52 sm:h-72 rounded-xl overflow-hidden mb-6 -mx-4 sm:mx-0">
          <img src={heroSrc} alt={course.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-gc-dark via-gc-dark/30 to-transparent" />
          <div className="absolute bottom-0 left-0 p-5 flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white/20"
                 style={{ background: color }} />
            <h1 className="text-2xl font-bold text-white drop-shadow">{course.name}</h1>
            <span className="text-gray-300 text-sm">{course.location_city}</span>
          </div>
        </div>
      )}

      {!heroSrc && (
        <div className="flex items-center gap-3 mb-6">
          <div className="w-4 h-4 rounded-full shrink-0" style={{ background: color }} />
          <h1 className="text-2xl font-bold text-white">{course.name}</h1>
          <span className="text-gray-500 text-sm">{course.location_city}</span>
        </div>
      )}

      {course.summary_text && (
        <p className="text-gray-400 text-sm leading-relaxed mb-6">{course.summary_text}</p>
      )}

      {/* Stat boxes — 3 cols */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {/* Box 1: Pelaajat */}
        <div className="card flex flex-col items-center justify-center text-center px-3 py-4" style={{ minHeight: 100 }}>
          <div className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Pelaajat</div>
          {activePlayerCount !== undefined && distinctPlayers >= activePlayerCount ? (
            <div className="text-base font-bold" style={{ color }}>Kaikki pelannut ✅</div>
          ) : (
            <>
              <div className="text-2xl font-bold text-white leading-tight">{distinctPlayers} pelannut</div>
              <div className="text-sm text-gray-500 mt-1">
                {(activePlayerCount ?? 0) - distinctPlayers} jäljellä
              </div>
            </>
          )}
        </div>
        {/* Box 2: Paras tulos */}
        <div className="card flex flex-col items-center justify-center text-center px-3 py-4" style={{ minHeight: 100 }}>
          <div className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Paras tulos</div>
          {pbRecord ? (
            <>
              <div className="font-semibold leading-tight" style={{ color, fontSize: 18 }}>
                {leaderLastName ?? pbRecord.player?.full_name}
              </div>
              <div className="font-bold leading-tight mt-1" style={{ color, fontSize: 32 }}>
                {pbRecord.total_points}p
              </div>
            </>
          ) : (
            <div className="text-2xl font-bold text-gray-600">–</div>
          )}
        </div>
        {/* Box 3: Kenttäkeskiarvo */}
        <div className="card flex flex-col items-center justify-center text-center px-3 py-4" style={{ minHeight: 100 }}>
          <div className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Kenttäkeskiarvo</div>
          <div className="text-2xl font-bold" style={{ color }}>
            {avgPoints !== null ? avgPoints.toFixed(1) : '–'}
          </div>
        </div>
      </div>

      <CourseRankings rounds={rounds} course={course} />

      {/* Kenttäkeskiarvo context */}
      {avgContextText && (
        <p className="text-gray-600 text-[12px] mb-8 leading-relaxed">{avgContextText}</p>
      )}

      <VaylamestariGrid rounds={rounds} holeResultsByRound={holeResultsByRound} course={course} />

      <h2 className="text-lg font-bold text-white mb-4">Kierrokset</h2>
      {rounds.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">Ei kierroksia tällä kentällä vielä</div>
      ) : (
        <div className="space-y-8">
          {rounds.map(r => (
            <RoundCard
              key={r.id}
              round={r}
              rank={leaderboard.find(e => e.player.id === r.player_id)?.rank}
              leaderboard={leaderboard}
              seasonCourses={allCourses}
              allRounds={rounds}
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
