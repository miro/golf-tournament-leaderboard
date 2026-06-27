import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getCourseBySlug, getCourseRounds, getCurrentSeason, getAllSeasonRounds,
  getCourses, getActivePlayers, getHoleResultsForRounds, getSeasonRoundAverages,
} from '../lib/queries'
import type { Course, RoundWithDetails, HoleResult } from '../lib/database.types'
import RoundCard from '../components/RoundCard'
import HoleOwnerGrid from '../components/shared/HoleOwnerGrid'

// ── Helpers ─────────────────────────────────────────────────────────────────

const CARD_BG = '#1a1a18'


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
        <div className="text-white font-bold text-[18px] font-display">{title}</div>
        <div className="text-gray-600 text-[13px] mt-0.5">{subtitle}</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-center text-gray-600 text-sm py-4">Ei vielä tuloksia</div>
      ) : (
        <div>
          <div className="grid grid-cols-[20px_1fr_auto_auto] max-[480px]:grid-cols-[20px_1fr_auto] gap-x-2 pb-1.5 mb-1.5"
               style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-[12px] uppercase text-gray-600 font-medium" style={{ letterSpacing: '0.08em' }}>#</span>
            <span className="text-[12px] uppercase text-gray-600 font-medium" style={{ letterSpacing: '0.08em' }}>Pelaaja</span>
            <span className="text-[12px] uppercase text-gray-600 font-medium text-right pr-2" style={{ letterSpacing: '0.08em' }}>{colPrimary}</span>
            <span className="text-[12px] uppercase text-gray-600 font-medium text-right max-[480px]:hidden" style={{ letterSpacing: '0.08em' }}>{colDerived}</span>
          </div>
          {rows.map((row, i) => (
            <div
              key={row.rank}
              className="grid grid-cols-[20px_1fr_auto_auto] max-[480px]:grid-cols-[20px_1fr_auto] gap-x-2 items-center py-1.5"
              style={i < rows.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.05)' } : undefined}
            >
              <span className="text-[15px] font-semibold font-display" style={{ color: '#6b7280' }}>{row.rank}</span>
              <span className="text-[17px] truncate max-[480px]:whitespace-normal font-display" style={{ color: row.isFirst ? color : '#ffffff', fontWeight: row.isFirst ? 700 : 600 }}>
                {row.name}
              </span>
              <span className="text-[17px] font-bold text-right pr-2 font-display" style={{ color: row.isFirst ? color : '#ffffff' }}>
                {row.primary}
              </span>
              <span className="text-[16px] font-bold text-right tabular-nums font-display max-[480px]:hidden" style={{ color: row.derived.color }}>
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
      <div className="text-gray-600 text-[13px] uppercase mb-3 font-display font-semibold" style={{ letterSpacing: '0.12em' }}>Kenttäranking</div>
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-4">
        <RankTable title="PISTEBOGEY" subtitle="eniten pisteitä voittaa"
          colPrimary="Pisteet" colDerived="STBL" rows={pbRows} color={color} />
        <RankTable title="SCRATCH" subtitle="vähiten lyöntejä voittaa"
          colPrimary="Lyönnit" colDerived="+/- Par" rows={scrRows} color={color} />
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
  const [seasonId, setSeasonId] = useState<string>('')
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [allSeasonRounds, setAllSeasonRounds] = useState<RoundWithDetails[]>([])
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
      const [courseRounds, allRounds, ac] = await Promise.all([
        getCourseRounds(c.id, season.id),
        getAllSeasonRounds(season.id),
        getCourses(),
      ])
      const [activePlayers, holeResults, avgs] = await Promise.all([
        getActivePlayers(),
        getHoleResultsForRounds(courseRounds.map(r => r.id)),
        getSeasonRoundAverages(season.id),
      ])
      setCourse(c)
      setSeasonId(season.id)
      setRounds(courseRounds)
      setAllSeasonRounds(allRounds)
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
            <h1 className="text-[36px] font-extrabold text-white drop-shadow font-display">{course.name}</h1>
            <span className="text-gray-300 text-base">{course.location_city}</span>
          </div>
        </div>
      )}

      {!heroSrc && (
        <div className="flex items-center gap-3 mb-6">
          <div className="w-4 h-4 rounded-full shrink-0" style={{ background: color }} />
          <h1 className="text-[36px] font-extrabold text-white font-display">{course.name}</h1>
          <span className="text-gray-500 text-base">{course.location_city}</span>
        </div>
      )}

      {course.summary_text && (
        <p className="text-gray-400 text-sm leading-relaxed mb-6">{course.summary_text}</p>
      )}

      {/* Stat boxes — 3 cols */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {/* Box 1: Pelaajat */}
        <div className="card flex flex-col items-center justify-center text-center px-3 py-4" style={{ minHeight: 100 }}>
          <div className="text-[12px] uppercase text-gray-600 mb-2 font-display font-semibold" style={{ letterSpacing: '0.1em' }}>Pelaajat</div>
          {activePlayerCount !== undefined && distinctPlayers >= activePlayerCount ? (
            <div className="text-base font-bold" style={{ color }}>Kaikki pelannut ✅</div>
          ) : (
            <>
              <div className="text-[28px] font-extrabold text-white leading-tight font-display">{distinctPlayers} pelannut</div>
              <div className="text-[16px] font-semibold text-gray-500 mt-1">
                {(activePlayerCount ?? 0) - distinctPlayers} jäljellä
              </div>
            </>
          )}
        </div>
        {/* Box 2: Paras tulos */}
        <div className="card flex flex-col items-center justify-center text-center px-3 py-4" style={{ minHeight: 100 }}>
          <div className="text-[12px] uppercase text-gray-600 mb-2 font-display font-semibold" style={{ letterSpacing: '0.1em' }}>Paras tulos</div>
          {pbRecord ? (
            <>
              <div className="font-semibold leading-tight font-display" style={{ color, fontSize: 16 }}>
                {leaderLastName ?? pbRecord.player?.full_name}
              </div>
              <div className="font-extrabold leading-tight mt-1 font-display" style={{ color, fontSize: 28 }}>
                {pbRecord.total_points}p
              </div>
            </>
          ) : (
            <div className="text-2xl font-bold text-gray-600">–</div>
          )}
        </div>
        {/* Box 3: Kenttäkeskiarvo */}
        <div className="card flex flex-col items-center justify-center text-center px-3 py-4" style={{ minHeight: 100 }}>
          <div className="text-[12px] uppercase text-gray-600 mb-2 font-display font-semibold" style={{ letterSpacing: '0.1em' }}>Kenttäkeskiarvo</div>
          <div className="text-[28px] font-extrabold font-display" style={{ color }}>
            {avgPoints !== null ? avgPoints.toFixed(1) : '–'}
          </div>
        </div>
      </div>

      <CourseRankings rounds={rounds} course={course} />

      {/* Kenttäkeskiarvo context */}
      {avgContextText && (
        <p className="text-gray-600 text-[14px] mb-8 leading-relaxed">{avgContextText}</p>
      )}

      <div className="mb-8">
        <div className="text-gray-600 text-[13px] uppercase mb-3 font-display font-semibold" style={{ letterSpacing: '0.12em' }}>Väylämestari</div>
        {seasonId && (
          <HoleOwnerGrid
            courseId={course.id}
            seasonId={seasonId}
            courseColor={color}
            highlightPlayerIds={[]}
            emptyStateText="Ei vielä reikätuloksia — tulokset näkyvät kun ensimmäinen kierros on syötetty"
          />
        )}
      </div>

      <h2 className="text-[24px] font-bold text-white mb-4 mt-8 font-display">Kierrokset</h2>
      {rounds.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">Ei kierroksia tällä kentällä vielä</div>
      ) : (
        <div className="space-y-8">
          {rounds.map(r => (
            <RoundCard
              key={r.id}
              round={r}
              seasonCourses={allCourses}
              allRounds={allSeasonRounds}
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
