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

type HoleState = 'mestari' | 'jaettu' | 'ei-johtoa' | 'no-data'

interface HoleStatus {
  holeNumber: number
  par: number | null
  state: HoleState
  strokes: number | null
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
      return { holeNumber: holeNum, par, state: 'no-data', strokes: null }
    }

    const playerBestStrokes = Math.min(...playerForHole.map(hr => hr.strokes_played!))
    const minStrokes = allForHole.length > 0
      ? Math.min(...allForHole.map(hr => hr.strokes_played!))
      : playerBestStrokes

    if (playerBestStrokes > minStrokes) {
      return { holeNumber: holeNum, par, state: 'ei-johtoa', strokes: playerBestStrokes }
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
    }
  })
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

  const lastCourseId = rounds.length > 0 ? rounds[0].course_id : null
  const summaryColor = (lastCourseId ? seasonCourses.find(c => c.id === lastCourseId) : null)?.color_hex ?? '#FBBF24'

  return (
    <section className="mb-8">
      <div
        className="text-gray-600 text-[11px] uppercase font-semibold mb-0.5 font-display"
        style={{ letterSpacing: '0.12em' }}
      >
        Väylämestari
      </div>
      <div className="text-gray-500 text-[12px] mb-4">Reikäkohtaiset parhaat tulokset</div>

      <div className="mb-6">
        {totalMestari > 0 ? (
          <div className="text-[20px] font-bold font-display" style={{ color: summaryColor }}>
            {totalMestari} väylämestaria yhteensä
          </div>
        ) : (
          <div className="text-[20px] font-bold text-gray-600 font-display">
            Ei vielä väylämestariutta
          </div>
        )}
      </div>

      <div className="space-y-6">
        {courseData.map(({ course, hasPlayed, holeStatuses, mestariCount, jaettuCount }) => (
          <div key={course.id}>
            <div
              className="text-[12px] font-bold uppercase mb-2 font-display"
              style={{ color: course.color_hex ?? '#ffffff', letterSpacing: '0.08em' }}
            >
              {course.name}
            </div>

            {!hasPlayed ? (
              <div className="text-gray-600 text-[13px]">Ei pelattu</div>
            ) : (
              <>
                <div style={{ background: CARD_BG, borderRadius: 12, overflow: 'hidden' }}>
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: 64 + 18 * 44, padding: 16, paddingBottom: 12 }}>

                      {/* Row 1: Hole numbers */}
                      <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <div
                          style={{ width: 64, minWidth: 64, height: 32, letterSpacing: '0.08em' }}
                          className="text-[12px] uppercase text-gray-600 font-semibold flex items-center"
                        >
                          Reikä
                        </div>
                        {HOLES.map(h => (
                          <div
                            key={h}
                            style={{ width: 44, minWidth: 44, height: 32 }}
                            className="flex items-center justify-center text-[13px] font-semibold text-gray-600"
                          >
                            {h}
                          </div>
                        ))}
                      </div>

                      {/* Row 2: Par */}
                      <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div
                          style={{ width: 64, minWidth: 64, height: 32, letterSpacing: '0.08em' }}
                          className="text-[12px] uppercase text-gray-600 font-semibold flex items-center"
                        >
                          Par
                        </div>
                        {holeStatuses.map(({ holeNumber, par }) => (
                          <div
                            key={holeNumber}
                            style={{ width: 44, minWidth: 44, height: 32 }}
                            className="flex items-center justify-center text-[14px] font-medium text-gray-500"
                          >
                            {par ?? '–'}
                          </div>
                        ))}
                      </div>

                      {/* Row 3: Tulos (dots) */}
                      <div className="flex">
                        <div
                          style={{ width: 64, minWidth: 64, height: 44, letterSpacing: '0.08em' }}
                          className="text-[12px] uppercase text-gray-600 font-semibold flex items-center"
                        >
                          Tulos
                        </div>
                        {holeStatuses.map(({ holeNumber, state, strokes }) => (
                          <div
                            key={holeNumber}
                            style={{ width: 44, minWidth: 44, height: 44 }}
                            className="flex items-center justify-center"
                          >
                            {state === 'mestari' && (
                              <div
                                title={`Väylämestari — ${strokes} lyöntiä`}
                                style={{
                                  width: 14, height: 14, borderRadius: '50%',
                                  background: course.color_hex ?? '#ffffff',
                                }}
                              />
                            )}
                            {state === 'jaettu' && (
                              <div
                                title={`Jaettu tulos — ${strokes} lyöntiä`}
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

                <div className="text-[12px] text-gray-600 mt-2">
                  {mestariCount === 0 && jaettuCount === 0
                    ? 'Ei väylämestariutta tällä kentällä'
                    : `${mestariCount} väylämestaria · ${jaettuCount} jaettua tulosta`}
                </div>
              </>
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
