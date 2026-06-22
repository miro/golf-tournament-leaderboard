import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getPlayerBySlug, getCurrentSeason, getPlayerRounds, getLeaderboard,
  getAllSeasonRounds, getActivePlayers, getHoleResultsForRounds, getSeasonCourses,
} from '../lib/queries'
import type { Player, LeaderboardEntry, RoundWithDetails, HoleResult, Course } from '../lib/database.types'
import RoundCard from '../components/RoundCard'

const COURSE_SLUG_ORDER = ['kajaani', 'nuas', 'tenetti', 'paltamo'] as const
const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)
const CARD_BG = '#1a1a18'
const GOLD = '#FBBF24'
const RED = '#E8453C'
const BLUE = '#5B9BD5'

type HoleState = 'mestari' | 'jaettu' | 'ei-johtoa' | 'no-data'

interface HoleStatus {
  holeNumber: number
  par: number | null
  state: HoleState
  strokes: number | null
  points: number | null
}

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

function computeHoleStatuses(
  playerId: string,
  allRoundsForCourse: RoundWithDetails[],
  allHoleResultsForCourse: HoleResult[],
): HoleStatus[] {
  const roundById = new Map(allRoundsForCourse.map(r => [r.id, r]))
  const playerRoundIds = new Set(
    allRoundsForCourse.filter(r => r.player_id === playerId).map(r => r.id)
  )

  return HOLES.map(holeNum => {
    const allForHole = allHoleResultsForCourse.filter(
      hr => hr.hole_number === holeNum && hr.strokes_played != null
    )
    const playerForHole = allForHole.filter(hr => playerRoundIds.has(hr.round_id))
    const par = allForHole[0]?.par ?? null

    if (playerForHole.length === 0) {
      return { holeNumber: holeNum, par, state: 'no-data', strokes: null, points: null }
    }

    const bestResult = playerForHole.reduce((best, cur) =>
      (cur.strokes_played ?? 999) < (best.strokes_played ?? 999) ? cur : best
    , playerForHole[0])
    const playerBestStrokes = bestResult.strokes_played!
    const displayPoints = bestResult.points

    const minStrokes = Math.min(...allForHole.map(hr => hr.strokes_played!))

    if (playerBestStrokes > minStrokes) {
      return { holeNumber: holeNum, par, state: 'ei-johtoa', strokes: playerBestStrokes, points: displayPoints }
    }

    // Player is tied — determine tiebreak winner
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

    const winnerRound = roundById.get(candidates[0]?.round_id ?? '')
    const playerWins = winnerRound?.player_id === playerId

    return {
      holeNumber: holeNum,
      par,
      state: playerWins ? 'mestari' : 'jaettu',
      strokes: playerBestStrokes,
      points: displayPoints,
    }
  })
}

const ROW_LABEL_STYLE: React.CSSProperties = { letterSpacing: '0.1em' }

function InfoTooltip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default', marginLeft: 3 }}
      onMouseEnter={e => {
        const r = e.currentTarget.getBoundingClientRect()
        setPos({ x: r.right + 6, y: r.top })
      }}
      onMouseLeave={() => setPos(null)}
    >
      <span style={{ fontSize: 10, color: '#4b5563', lineHeight: 1 }}>ⓘ</span>
      {pos && (
        <span
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            zIndex: 9999,
            width: 200,
            background: '#2a2520',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: 11,
            color: '#d1d5db',
            whiteSpace: 'normal',
            letterSpacing: 'normal',
            textTransform: 'none',
            fontWeight: 400,
            pointerEvents: 'none',
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}

function RowLabel({ children, tooltip }: { children: React.ReactNode; tooltip?: string }) {
  return (
    <div
      style={{ width: 64, minWidth: 64, ...ROW_LABEL_STYLE }}
      className="text-[11px] uppercase text-gray-600 font-semibold flex items-center"
    >
      {children}
      {tooltip && <InfoTooltip text={tooltip} />}
    </div>
  )
}

function VaylamestariSection({
  player, rounds, allSeasonRounds, allSeasonHoleResults, seasonCourses,
}: {
  player: Player
  rounds: RoundWithDetails[]
  allSeasonRounds: RoundWithDetails[]
  allSeasonHoleResults: HoleResult[]
  seasonCourses: Course[]
}) {
  const courseBySlug = new Map(seasonCourses.map(c => [c.slug, c]))

  type CourseData = {
    course: Course
    hasPlayed: boolean
    holeStatuses: HoleStatus[]
    mestariCount: number
    jaettuCount: number
  }

  const courseData: CourseData[] = COURSE_SLUG_ORDER
    .map(slug => {
      const course = courseBySlug.get(slug)
      if (!course) return null
      const allRoundsForCourse = allSeasonRounds.filter(r => r.course_id === course.id)
      const hasPlayed = rounds.some(r => r.course_id === course.id)
      if (!hasPlayed) {
        return { course, hasPlayed: false, holeStatuses: [], mestariCount: 0, jaettuCount: 0 }
      }
      const courseRoundIds = new Set(allRoundsForCourse.map(r => r.id))
      const allHoleResultsForCourse = allSeasonHoleResults.filter(hr => courseRoundIds.has(hr.round_id))
      const holeStatuses = computeHoleStatuses(player.id, allRoundsForCourse, allHoleResultsForCourse)
      const mestariCount = holeStatuses.filter(h => h.state === 'mestari').length
      const jaettuCount = holeStatuses.filter(h => h.state === 'jaettu').length
      return { course, hasPlayed: true, holeStatuses, mestariCount, jaettuCount }
    })
    .filter((x): x is CourseData => x !== null)

  const totalMestari = courseData.reduce((sum, cd) => sum + cd.mestariCount, 0)
  const totalJaettu = courseData.reduce((sum, cd) => sum + cd.jaettuCount, 0)


  return (
    <section className="mb-8">
      {/* Section label */}
      <div
        className="text-gray-600 text-[12px] uppercase font-semibold mb-0.5 font-display"
        style={{ letterSpacing: '0.12em' }}
      >
        Väylämestari
      </div>
      <div className="text-gray-500 text-[13px] mb-4">Reikäkohtaiset skins-voitot</div>

      {/* Hero summary */}
      <div className="mb-6">
        {totalMestari === 0 && totalJaettu === 0 ? (
          <div className="text-[24px] font-bold text-gray-600 font-display">
            Ei vielä skinejä
          </div>
        ) : (
          <div className="text-[24px] font-bold font-display">
            <span style={{ color: GOLD }}>{totalMestari} skiniä</span>
            {totalJaettu > 0 && (
              <span className="text-gray-500"> · {totalJaettu} jaettua tulosta</span>
            )}
          </div>
        )}
      </div>

      {/* Per-course grids */}
      <div className="space-y-6">
        {courseData.map(({ course, hasPlayed, holeStatuses }) => (
          <div key={course.id}>
            <div
              className="text-[13px] font-bold uppercase mb-2 font-display"
              style={{ color: course.color_hex ?? '#ffffff', letterSpacing: '0.1em' }}
            >
              {course.name}
            </div>

            {!hasPlayed ? (
              <div className="text-[14px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Ei pelattu</div>
            ) : (
              <div style={{ background: CARD_BG, borderRadius: 12, overflow: 'hidden' }}>
                <div className="overflow-x-auto">
                  <div style={{ minWidth: 64 + 18 * 44, padding: 16, paddingBottom: 12 }}>

                    {/* Row 1: Hole numbers */}
                    <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <RowLabel>Reikä</RowLabel>
                      {HOLES.map(h => (
                        <div
                          key={h}
                          style={{ width: 44, minWidth: 44, height: 32, color: 'rgba(255,255,255,0.45)' }}
                          className="flex items-center justify-center text-[12px] font-semibold"
                        >
                          {h}
                        </div>
                      ))}
                    </div>

                    {/* Row 2: Par */}
                    <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <RowLabel>Par</RowLabel>
                      {holeStatuses.map(({ holeNumber, par }) => (
                        <div
                          key={holeNumber}
                          style={{ width: 44, minWidth: 44, height: 32 }}
                          className="flex items-center justify-center text-[14px] font-medium text-white"
                        >
                          {par ?? '–'}
                        </div>
                      ))}
                    </div>

                    {/* Row 3: Lyönnit (scorecard coded) */}
                    <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <RowLabel>Lyönnit</RowLabel>
                      {holeStatuses.map(({ holeNumber, par, strokes }) => (
                        <div
                          key={holeNumber}
                          style={{ width: 44, minWidth: 44, height: 44 }}
                          className="flex items-center justify-center"
                        >
                          {strokes == null || par == null ? (
                            <span className="text-[15px] font-bold" style={{ color: '#374151' }}>—</span>
                          ) : (() => {
                            const s = holeStrokeStyle(strokes, par)
                            return (
                              <div style={{
                                width: 30, height: 30,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: s.outer ? `1.5px solid ${s.outer}` : 'none',
                                borderRadius: s.radius,
                                position: 'relative',
                              }}>
                                {s.inner && (
                                  <div style={{
                                    position: 'absolute', inset: 4,
                                    border: `1.5px solid ${s.inner}`,
                                    borderRadius: s.radius,
                                  }} />
                                )}
                                <span className="text-[15px] font-bold" style={{ color: s.color, position: 'relative' }}>
                                  {strokes}
                                </span>
                              </div>
                            )
                          })()}
                        </div>
                      ))}
                    </div>

                    {/* Row 4: Pisteet (stableford points) */}
                    <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <RowLabel>Pisteet</RowLabel>
                      {holeStatuses.map(({ holeNumber, points }) => (
                        <div
                          key={holeNumber}
                          style={{ width: 44, minWidth: 44, height: 32 }}
                          className="flex items-center justify-center text-[14px] font-semibold text-white"
                        >
                          {points ?? '–'}
                        </div>
                      ))}
                    </div>

                    {/* Row 5: Mestari (dots) */}
                    <div className="flex">
                      <RowLabel tooltip="Skin = reikäkohtainen voitto pienimmällä lyöntimäärällä. Täytetty piste = sinulla on skin yksin, ympyrä = jaettu tulos.">Skins</RowLabel>
                      {holeStatuses.map(({ holeNumber, state, strokes }) => (
                        <div
                          key={holeNumber}
                          style={{ width: 44, minWidth: 44, height: 44 }}
                          className="flex items-center justify-center"
                        >
                          {state === 'mestari' && (
                            <div
                              title={`Skin — ${strokes} lyöntiä`}
                              style={{
                                width: 14, height: 14, borderRadius: '50%',
                                background: course.color_hex ?? '#ffffff',
                              }}
                            />
                          )}
                          {state === 'jaettu' && (
                            <div
                              title={`Jaettu — ${strokes} lyöntiä`}
                              style={{
                                width: 14, height: 14, borderRadius: '50%',
                                background: 'transparent',
                                border: `1.5px solid ${course.color_hex ?? '#ffffff'}`,
                              }}
                            />
                          )}
                          {(state === 'ei-johtoa' || state === 'no-data') && (
                            <div
                              style={{
                                width: 14, height: 14, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.12)',
                              }}
                            />
                          )}
                        </div>
                      ))}
                    </div>

                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function PlayerProfilePage() {
  const { slug } = useParams<{ slug: string }>()
  const [player, setPlayer] = useState<Player | null>(null)
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [allSeasonRounds, setAllSeasonRounds] = useState<RoundWithDetails[]>([])
  const [allSeasonHoleResults, setAllSeasonHoleResults] = useState<HoleResult[]>([])
  const [seasonCourses, setSeasonCourses] = useState<Course[]>([])
  const [entry, setEntry] = useState<LeaderboardEntry | null>(null)
  const [activePlayerCount, setActivePlayerCount] = useState<number | undefined>()
  const [holeResultsByRound, setHoleResultsByRound] = useState<Record<string, HoleResult[]>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      if (!slug) return
      const [p, season] = await Promise.all([getPlayerBySlug(slug), getCurrentSeason()])
      const [playerRounds, lb, allRounds, sc] = await Promise.all([
        getPlayerRounds(p.id, season.id),
        getLeaderboard(season.id),
        getAllSeasonRounds(season.id),
        getSeasonCourses(season.id),
      ])
      const [activePlayers, allHoleResults] = await Promise.all([
        getActivePlayers(),
        getHoleResultsForRounds(allRounds.map(r => r.id)),
      ])
      setPlayer(p)
      setRounds(playerRounds)
      setAllSeasonRounds(allRounds)
      setAllSeasonHoleResults(allHoleResults)
      setSeasonCourses(sc.map(x => x.course as unknown as Course))
      setEntry(lb.find(e => e.player.id === p.id) ?? null)
      setActivePlayerCount(activePlayers.length)
      const playerRoundIds = new Set(playerRounds.map(r => r.id))
      const hrMap: Record<string, HoleResult[]> = {}
      for (const hr of allHoleResults) {
        if (!playerRoundIds.has(hr.round_id)) continue
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
        <h1 className="text-3xl font-bold text-white font-display">{player.full_name}</h1>
        {player.hcp_current != null && (
          <p className="text-gray-400 mt-1">HCP {player.hcp_current}</p>
        )}
      </div>

      {entry && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { value: entry.rank, label: 'Sijoitus', gold: entry.rank === 1 },
            { value: entry.total_points, label: 'Pistettä', gold: false },
            { value: entry.rounds_played, label: 'Kierrosta', gold: false },
          ].map(({ value, label, gold }) => (
            <div key={label} className="card p-4 text-center">
              <div
                className="text-[32px] font-extrabold font-display"
                style={{ color: gold ? GOLD : '#ffffff' }}
              >
                {value}
              </div>
              <div
                className="text-[12px] uppercase font-semibold mt-1"
                style={{ color: '#6b7280', letterSpacing: '0.1em' }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      <VaylamestariSection
        player={player}
        rounds={rounds}
        allSeasonRounds={allSeasonRounds}
        allSeasonHoleResults={allSeasonHoleResults}
        seasonCourses={seasonCourses}
      />

      <h2 className="text-lg font-bold text-white mb-4">Kierroshistoria</h2>
      {rounds.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">Ei kierroksia vielä</div>
      ) : (
        <div className="space-y-8">
          {rounds.map(r => (
            <RoundCard
              key={r.id}
              round={r}
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
