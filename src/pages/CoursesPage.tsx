import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCourses, getCurrentSeason, getLeaderboard } from '../lib/queries'
import type { Course, LeaderboardEntry } from '../lib/database.types'

const COURSE_HERO: Record<string, string> = {
  kajaani: '/course-hero-kag.jpg',
  paltamo: '/course-hero-paltamo.jpg',
  nuas:    '/course-hero-nuas.jpg',
  tenetti: '/course-hero-tenetti.jpg',
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [allCourses, season] = await Promise.all([getCourses(), getCurrentSeason()])
      const lb = await getLeaderboard(season.id)
      setCourses(allCourses)
      setLeaderboard(lb)
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Ladataan...</div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Kentät</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {courses.map(course => {
          const playedCount = leaderboard.filter(e => e.courses_played.includes(course.id)).length
          return (
            <Link
              key={course.id}
              to={`/courses/${course.slug}`}
              className="card overflow-hidden hover:border-gc-green/40 transition-colors group"
            >
              {/* Hero image banner */}
              <div className="relative h-36 overflow-hidden">
                {COURSE_HERO[course.slug ?? ''] ? (
                  <img
                    src={COURSE_HERO[course.slug ?? '']}
                    alt={course.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full bg-gc-card" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-gc-card via-gc-card/20 to-transparent" />
                <div
                  className="absolute bottom-2 left-3 w-2.5 h-2.5 rounded-full ring-2 ring-white/20"
                  style={{ background: course.color_hex ?? '#2D6A4F' }}
                />
              </div>
              {/* Card content */}
              <div className="px-4 py-3">
                <div className="font-bold text-white group-hover:text-gc-gold transition-colors">
                  {course.name}
                </div>
                <div className="text-sm text-gray-400 mt-0.5">
                  {course.location_city} · Par {course.par_total}
                </div>
                <div className="text-xs text-gray-600 mt-1.5">
                  {playedCount}/{leaderboard.length} pelaajaa pelannut
                </div>
              </div>
            </Link>
          )
        })}
        {courses.length === 0 && (
          <div className="col-span-2 card p-8 text-center text-gray-500">Ei kenttiä</div>
        )}
      </div>
    </div>
  )
}
