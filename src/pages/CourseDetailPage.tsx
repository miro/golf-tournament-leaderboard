import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getCourseBySlug, getCourseRounds, getCurrentSeason, getLeaderboard, getCourses, getActivePlayers, getHoleResultsForRounds } from '../lib/queries'
import type { Course, LeaderboardEntry, RoundWithDetails, HoleResult } from '../lib/database.types'
import RoundCard from '../components/RoundCard'

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
      const [activePlayers, holeResults] = await Promise.all([
        getActivePlayers(),
        getHoleResultsForRounds(courseRounds.map(r => r.id)),
      ])
      setCourse(c)
      setRounds(courseRounds)
      setLeaderboard(lb)
      setAllCourses(ac)
      setActivePlayerCount(activePlayers.length)
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

  const leader = rounds.reduce<RoundWithDetails | null>(
    (best, r) => (!best || r.total_points > best.total_points ? r : best),
    null,
  )

  const heroSrc = COURSE_HERO[course.slug ?? '']

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Hero image */}
      {heroSrc && (
        <div className="relative h-52 sm:h-72 rounded-xl overflow-hidden mb-6 -mx-4 sm:mx-0">
          <img
            src={heroSrc}
            alt={course.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gc-dark via-gc-dark/30 to-transparent" />
          <div className="absolute bottom-0 left-0 p-5 flex items-center gap-3">
            <div
              className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white/20"
              style={{ background: course.color_hex ?? '#2D6A4F' }}
            />
            <h1 className="text-2xl font-bold text-white drop-shadow">{course.name}</h1>
            <span className="text-gray-300 text-sm">{course.location_city}</span>
          </div>
        </div>
      )}

      {/* Fallback header when no hero image */}
      {!heroSrc && (
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-4 h-4 rounded-full shrink-0"
            style={{ background: course.color_hex ?? '#2D6A4F' }}
          />
          <h1 className="text-2xl font-bold text-white">{course.name}</h1>
          <span className="text-gray-500 text-sm">{course.location_city}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-white">{course.par_total}</div>
          <div className="text-xs text-gray-500 mt-1">Par</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-white">{rounds.length}</div>
          <div className="text-xs text-gray-500 mt-1">Kierroksia</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-gc-green">{leader?.total_points ?? '–'}</div>
          <div className="text-xs text-gray-500 mt-1">Paras tulos</div>
        </div>
      </div>

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
