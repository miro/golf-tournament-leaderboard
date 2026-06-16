import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCourses, getCurrentSeason, getLeaderboard } from '../lib/queries'
import type { Course, LeaderboardEntry } from '../lib/database.types'

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
              className="card p-5 hover:border-gc-green/40 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-3 h-3 rounded-full mt-1.5 shrink-0"
                  style={{ background: course.color_hex ?? '#2D6A4F' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white group-hover:text-gc-gold transition-colors">
                    {course.name}
                  </div>
                  <div className="text-sm text-gray-400 mt-0.5">
                    {course.location_city} · Par {course.par_total}
                  </div>
                  <div className="text-xs text-gray-600 mt-2">
                    {playedCount}/{leaderboard.length} pelaajaa pelannut
                  </div>
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
