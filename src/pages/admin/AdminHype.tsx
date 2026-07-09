import { useState, useEffect, useRef } from 'react'
import { getCurrentSeason, getActivePlayers, getLeaderboard, getSeasonCourses, getCourseRounds, getHoleResultsForRounds } from '../../lib/queries'
import { computeSkinsKing, generateCaption } from '../../lib/caption'
import StarttipakettCard from '../../components/StarttipakettCard'
import SkinsCard from '../../components/SkinsCard'
import CaptionBlock from '../../components/CaptionBlock'
import type { Player, Course, LeaderboardEntry, RoundWithDetails, HoleResult } from '../../lib/database.types'

const COURSE_OPTIONS = [
  { label: 'Kajaani', slug: 'kajaani' },
  { label: 'Nuas', slug: 'nuas' },
  { label: 'Tenetti', slug: 'tenetti' },
  { label: 'Paltamo', slug: 'paltamo' },
]

const STORAGE_KEY = 'gc_hype_starttipaketti'

interface StoredForm {
  course_id: string | null
  player_ids: string[]
  date: string
}

function loadStoredForm(): StoredForm | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    return {
      course_id: typeof parsed.course_id === 'string' ? parsed.course_id : null,
      player_ids: Array.isArray(parsed.player_ids) ? parsed.player_ids.filter((id: unknown) => typeof id === 'string') : [],
      date: typeof parsed.date === 'string' ? parsed.date : '',
    }
  } catch {
    return null
  }
}

function todayStr(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function AdminHype() {
  const [activePlayers, setActivePlayers] = useState<Player[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [seasonCourses, setSeasonCourses] = useState<Course[]>([])
  const [seasonId, setSeasonId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Form
  const [selectedCourseSlug, setSelectedCourseSlug] = useState('')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [date, setDate] = useState(todayStr)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Preview
  const [preview, setPreview] = useState<{ course: Course; courseRounds: RoundWithDetails[] } | null>(null)
  const [generating, setGenerating] = useState(false)
  const [courseHoleResults, setCourseHoleResults] = useState<HoleResult[]>([])

  const hydratedRef = useRef(false)

  // Fetch hole results for the generated course's rounds, used to compute the caption's skins king line
  useEffect(() => {
    let cancelled = false
    if (!preview || preview.courseRounds.length === 0) {
      setCourseHoleResults([])
      return
    }
    getHoleResultsForRounds(preview.courseRounds.map(r => r.id)).then(hr => {
      if (!cancelled) setCourseHoleResults(hr)
    })
    return () => { cancelled = true }
  }, [preview])

  useEffect(() => {
    async function load() {
      try {
        const [players, season] = await Promise.all([getActivePlayers(), getCurrentSeason()])
        const [lb, sc] = await Promise.all([getLeaderboard(season.id), getSeasonCourses(season.id)])
        const courses = sc.map(item => item.course)
        setActivePlayers(players)
        setLeaderboard(lb)
        setSeasonCourses(courses)
        setSeasonId(season.id)

        const stored = loadStoredForm()
        if (stored) {
          setSelectedPlayerIds(stored.player_ids.filter(id => players.some(p => p.id === id)))
          const course = stored.course_id ? courses.find(c => c.id === stored.course_id) : undefined
          setSelectedCourseSlug(course ? course.slug : '')
          if (stored.date) setDate(stored.date)
        }
      } catch (e) {
        console.error(e)
        setLoadError('Virhe ladattaessa tietoja')
      } finally {
        setLoading(false)
        hydratedRef.current = true
      }
    }
    load()
  }, [])

  // Persist form values to localStorage on every change, once initial hydration is done
  useEffect(() => {
    if (!hydratedRef.current) return
    const course = seasonCourses.find(c => c.slug === selectedCourseSlug)
    const payload: StoredForm = {
      course_id: course?.id ?? null,
      player_ids: selectedPlayerIds,
      date,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [selectedCourseSlug, selectedPlayerIds, date, seasonCourses])

  // Close dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const selectedPlayers = selectedPlayerIds
    .map(id => activePlayers.find(p => p.id === id))
    .filter((p): p is Player => !!p)
  const selectedCourse = seasonCourses.find(c => c.slug === selectedCourseSlug)
  const canGenerate = selectedCourseSlug !== '' && selectedPlayerIds.length >= 1

  const previewColor = preview?.course.color_hex ?? '#2D6A4F'
  const skinsKing = preview ? computeSkinsKing(preview.courseRounds, courseHoleResults) : null
  const caption = preview ? generateCaption(selectedPlayers, preview.course, leaderboard, preview.courseRounds, skinsKing) : ''

  function togglePlayer(playerId: string) {
    setSelectedPlayerIds(prev => {
      if (prev.includes(playerId)) return prev.filter(id => id !== playerId)
      if (prev.length >= 4) return prev
      return [...prev, playerId]
    })
  }

  async function handleGenerate() {
    if (!selectedCourse || !seasonId) return
    setDropdownOpen(false)
    setGenerating(true)
    try {
      const rounds = await getCourseRounds(selectedCourse.id, seasonId)
      setPreview({ course: selectedCourse, courseRounds: rounds })
    } catch (e) {
      console.error(e)
    } finally {
      setGenerating(false)
    }
  }

  function handleReset() {
    setPreview(null)
    setSelectedCourseSlug('')
    setSelectedPlayerIds([])
    setDate(todayStr())
    setDropdownOpen(false)
  }

  function handleClear() {
    localStorage.removeItem(STORAGE_KEY)
    setPreview(null)
    setSelectedCourseSlug('')
    setSelectedPlayerIds([])
    setDate(todayStr())
    setDropdownOpen(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Ladataan...</div>
  )
  if (loadError) return (
    <div className="text-red-400 p-6">{loadError}</div>
  )

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold font-display text-white mb-1">Hype Tools</h1>
      <p className="text-gc-muted text-sm mb-8 font-sans">Generoi jaettavia kortteja ryhmälle</p>

      <div className="card p-6">
        <div className="label mb-1">STARTTIPAKETTI</div>
        <p className="font-sans text-gray-500 text-sm mb-6">Luo starttipaketti WhatsApp-ilmoituksen alle</p>

        {!preview ? (
          <div className="space-y-5">
            {/* Kenttä */}
            <div>
              <label className="label mb-2 block">KENTTÄ *</label>
              <select
                value={selectedCourseSlug}
                onChange={e => setSelectedCourseSlug(e.target.value)}
                className="font-sans w-full bg-gc-dark border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              >
                <option value="">Valitse kenttä...</option>
                {COURSE_OPTIONS.map(opt => (
                  <option key={opt.slug} value={opt.slug}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Pelaajat */}
            <div>
              <label className="label mb-2 block">PELAAJAT * <span className="normal-case font-normal text-gray-600">(min 1, max 4)</span></label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(o => !o)}
                  className="font-sans w-full bg-gc-dark border border-white/15 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between transition-colors focus:outline-none focus:border-white/30"
                  style={{ color: selectedPlayerIds.length === 0 ? '#9A8870' : 'white' }}
                >
                  {selectedPlayerIds.length === 0
                    ? 'Valitse pelaajat...'
                    : `${selectedPlayerIds.length} pelaaja${selectedPlayerIds.length !== 1 ? 'a' : ''} valittu`}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {dropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gc-card border border-white/15 rounded-lg overflow-hidden z-10 shadow-xl">
                    {activePlayers.map(player => {
                      const isSelected = selectedPlayerIds.includes(player.id)
                      const isDisabled = !isSelected && selectedPlayerIds.length >= 4
                      return (
                        <button
                          key={player.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => togglePlayer(player.id)}
                          className={`font-sans w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors ${
                            isSelected
                              ? 'bg-white/10 text-white'
                              : isDisabled
                              ? 'text-gray-600 cursor-not-allowed'
                              : 'text-gray-300 hover:bg-white/5'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-gc-green border-gc-green' : 'border-white/20'}`}>
                            {isSelected && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#17130F" strokeWidth="3.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                          {player.full_name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* Pills */}
              {selectedPlayers.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {selectedPlayers.map(p => (
                    <span
                      key={p.id}
                      className="font-sans flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-white border border-white/20 bg-white/5"
                    >
                      {p.full_name}
                      <button
                        type="button"
                        onClick={() => togglePlayer(p.id)}
                        className="text-gray-400 hover:text-white transition-colors leading-none"
                        aria-label={`Poista ${p.full_name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Päivämäärä */}
            <div>
              <label className="label mb-2 block">PÄIVÄMÄÄRÄ *</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="font-sans w-full bg-gc-dark border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate || generating}
                className="btn-primary font-sans disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generating ? 'Luodaan...' : 'Luo starttipaketti'}
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="font-sans text-sm text-gray-500 hover:text-gray-300 border border-white/10 hover:border-white/20 px-3 py-2 rounded-lg transition-colors"
              >
                ✕ Tyhjennä
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button onClick={handleReset} className="btn-ghost font-sans text-sm mb-6">
              ← Luo uusi
            </button>
            <div className="flex flex-col gap-6">
              <StarttipakettCard
                course={preview.course}
                selectedPlayers={selectedPlayers}
                date={date}
                leaderboard={leaderboard}
                seasonCourses={seasonCourses}
              />
              <SkinsCard
                course={preview.course}
                seasonId={seasonId}
                courseRounds={preview.courseRounds}
              />
            </div>
            <CaptionBlock caption={caption} color={previewColor} />
          </div>
        )}
      </div>
    </div>
  )
}
