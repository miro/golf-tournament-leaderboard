import { useState, useEffect, useRef } from 'react'
import { getCurrentSeason, getActivePlayers, getLeaderboard, getSeasonCourses, getCourseRounds, getHoleResultsForRounds, getAllSeasonRounds } from '../../lib/queries'
import { computeSkinsKing, generateCaption, generatePostRoundCaption } from '../../lib/caption'
import StarttipakettCard from '../../components/StarttipakettCard'
import SkinsCard from '../../components/SkinsCard'
import PostRoundCard from '../../components/PostRoundCard'
import CaptionBlock from '../../components/CaptionBlock'
import type { Player, Course, LeaderboardEntry, RoundWithDetails, HoleResult } from '../../lib/database.types'

const COURSE_OPTIONS = [
  { label: 'Kajaani', slug: 'kajaani' },
  { label: 'Nuas', slug: 'nuas' },
  { label: 'Tenetti', slug: 'tenetti' },
  { label: 'Paltamo', slug: 'paltamo' },
]

const CARD_WRAP_STYLE = {
  margin: '0 8px',
  width: 'calc(100vw - 16px)',
  maxWidth: 480,
  boxSizing: 'border-box',
} as const

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

const STORAGE_KEY_JK = 'gc_hype_jalkikortti'
const SEASON_START = 'season-start'

interface StoredJkForm {
  round_ids: string[]
  cutoff_round_id: string
  date: string
}

function loadStoredJkForm(): StoredJkForm | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_JK)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    return {
      round_ids: Array.isArray(parsed.round_ids) ? parsed.round_ids.filter((id: unknown) => typeof id === 'string') : [],
      cutoff_round_id: typeof parsed.cutoff_round_id === 'string' ? parsed.cutoff_round_id : '',
      date: typeof parsed.date === 'string' ? parsed.date : '',
    }
  } catch {
    return null
  }
}

function fmtShortDate(s: string): string {
  const [y, m, d] = s.split('-')
  return `${parseInt(d)}.${parseInt(m)}.${y}`
}

function roundLabel(r: RoundWithDetails): string {
  return `${r.player?.full_name ?? '?'} — ${r.course?.name ?? '?'} · ${fmtShortDate(r.played_date)}`
}

// `sortedRounds` must already be sorted played_date DESC, submitted_at DESC.
function computeDefaultCutoff(selectedIds: string[], sortedRounds: RoundWithDetails[]): string {
  const indices = selectedIds
    .map(id => sortedRounds.findIndex(r => r.id === id))
    .filter(i => i !== -1)
  if (indices.length === 0) return SEASON_START
  const earliestSelectedIndex = Math.max(...indices)
  const next = sortedRounds[earliestSelectedIndex + 1]
  return next ? next.id : SEASON_START
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

  // Kierroksen jälkeen
  const [allSeasonRounds, setAllSeasonRounds] = useState<RoundWithDetails[]>([])
  const [jkRoundIds, setJkRoundIds] = useState<string[]>([])
  const [jkCutoffId, setJkCutoffId] = useState('') // '' = auto-default to the round before the earliest selected round
  const [jkDate, setJkDate] = useState(todayStr)
  const [jkDropdownOpen, setJkDropdownOpen] = useState(false)
  const jkDropdownRef = useRef<HTMLDivElement>(null)
  const [jkPreview, setJkPreview] = useState<{ rounds: RoundWithDetails[]; cutoffTimestamp: string | null; date: string } | null>(null)

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
        const [lb, sc, rounds] = await Promise.all([getLeaderboard(season.id), getSeasonCourses(season.id), getAllSeasonRounds(season.id)])
        const courses = sc.map(item => item.course)
        const sortedRounds = [...rounds].sort((a, b) => {
          if (a.played_date !== b.played_date) return a.played_date < b.played_date ? 1 : -1
          return a.submitted_at < b.submitted_at ? 1 : -1
        })
        setActivePlayers(players)
        setLeaderboard(lb)
        setSeasonCourses(courses)
        setSeasonId(season.id)
        setAllSeasonRounds(sortedRounds)

        const stored = loadStoredForm()
        if (stored) {
          setSelectedPlayerIds(stored.player_ids.filter(id => players.some(p => p.id === id)))
          const course = stored.course_id ? courses.find(c => c.id === stored.course_id) : undefined
          setSelectedCourseSlug(course ? course.slug : '')
          if (stored.date) setDate(stored.date)
        }

        const storedJk = loadStoredJkForm()
        const validStoredJkRoundIds = storedJk?.round_ids.filter(id => sortedRounds.some(r => r.id === id)) ?? []
        if (validStoredJkRoundIds.length > 0) {
          setJkRoundIds(validStoredJkRoundIds)
          const cutoffValid = storedJk?.cutoff_round_id === SEASON_START || sortedRounds.some(r => r.id === storedJk?.cutoff_round_id)
          setJkCutoffId(cutoffValid ? (storedJk?.cutoff_round_id ?? '') : '')
          if (storedJk?.date) setJkDate(storedJk.date)
        } else if (sortedRounds.length > 0) {
          setJkRoundIds([sortedRounds[0].id])
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

  const effectiveCutoffId = jkCutoffId || computeDefaultCutoff(jkRoundIds, allSeasonRounds)

  // Persist jälkikortti form values to localStorage on every change, once initial hydration is done
  useEffect(() => {
    if (!hydratedRef.current) return
    const payload: StoredJkForm = {
      round_ids: jkRoundIds,
      cutoff_round_id: effectiveCutoffId,
      date: jkDate,
    }
    localStorage.setItem(STORAGE_KEY_JK, JSON.stringify(payload))
  }, [jkRoundIds, effectiveCutoffId, jkDate])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
      if (jkDropdownRef.current && !jkDropdownRef.current.contains(e.target as Node)) {
        setJkDropdownOpen(false)
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

  const jkSelectedRounds = jkRoundIds
    .map(id => allSeasonRounds.find(r => r.id === id))
    .filter((r): r is RoundWithDetails => !!r)
  const jkCanGenerate = jkSelectedRounds.length >= 1 && jkSelectedRounds.length <= 8

  const jkPreviewCourses = jkPreview
    ? [...new Map(jkPreview.rounds.map(r => [r.course_id, r.course])).values()]
    : []
  const jkPreviewColor = jkPreviewCourses.length > 1 ? '#E8A820' : (jkPreviewCourses[0]?.color_hex ?? '#2D6A4F')
  const postRoundCaption = jkPreview
    ? generatePostRoundCaption(jkPreview.rounds, jkPreview.cutoffTimestamp, allSeasonRounds, leaderboard)
    : ''

  function toggleJkRound(roundId: string) {
    setJkRoundIds(prev => {
      if (prev.includes(roundId)) return prev.filter(id => id !== roundId)
      if (prev.length >= 8) return prev
      return [...prev, roundId]
    })
  }

  function handleGenerateJalkikortti() {
    if (jkSelectedRounds.length === 0) return
    setJkDropdownOpen(false)
    const cutoffTimestamp = effectiveCutoffId === SEASON_START
      ? null
      : (allSeasonRounds.find(r => r.id === effectiveCutoffId)?.submitted_at ?? null)
    setJkPreview({ rounds: jkSelectedRounds, cutoffTimestamp, date: jkDate })
  }

  function handleResetJalkikortti() {
    setJkPreview(null)
    setJkRoundIds(allSeasonRounds.length > 0 ? [allSeasonRounds[0].id] : [])
    setJkCutoffId('')
    setJkDate(todayStr())
    setJkDropdownOpen(false)
  }

  function handleClearJalkikortti() {
    localStorage.removeItem(STORAGE_KEY_JK)
    handleResetJalkikortti()
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
            {/* -mx-10/md:-mx-12 cancels the ancestor padding (AdminLayout's <main> p-4/md:p-6
                plus this .card's own p-6) so the vw-based card width below is measured from
                the true viewport edge, not from inside two layers of unrelated padding. */}
            <div className="flex flex-col gap-4 -mx-10 md:-mx-12">
              <div style={CARD_WRAP_STYLE}>
                <StarttipakettCard
                  course={preview.course}
                  selectedPlayers={selectedPlayers}
                  date={date}
                  leaderboard={leaderboard}
                  seasonCourses={seasonCourses}
                />
              </div>
              <div style={CARD_WRAP_STYLE}>
                <SkinsCard
                  course={preview.course}
                  seasonId={seasonId}
                  courseRounds={preview.courseRounds}
                />
              </div>
            </div>
            <CaptionBlock caption={caption} color={previewColor} />
          </div>
        )}
      </div>

      <div className="card p-6 mt-8">
        <div className="label mb-1" style={{ color: '#E8A820' }}>KIERROKSEN JÄLKEEN</div>
        <p className="font-sans text-gray-500 text-sm mb-6">Luo jälkikortti kierroksen tuloksista</p>

        {!jkPreview ? (
          <div className="space-y-5">
            {/* Kierrokset */}
            <div>
              <label className="label mb-2 block">KIERROKSET * <span className="normal-case font-normal text-gray-600">(min 1, max 8)</span></label>
              <div className="relative" ref={jkDropdownRef}>
                <button
                  type="button"
                  onClick={() => setJkDropdownOpen(o => !o)}
                  className="font-sans w-full bg-gc-dark border border-white/15 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between transition-colors focus:outline-none focus:border-white/30"
                  style={{ color: jkRoundIds.length === 0 ? '#9A8870' : 'white' }}
                >
                  {jkRoundIds.length === 0
                    ? 'Valitse kierrokset...'
                    : `${jkRoundIds.length} kierros${jkRoundIds.length !== 1 ? 'ta' : ''} valittu`}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, transform: jkDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {jkDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gc-card border border-white/15 rounded-lg overflow-y-auto z-10 shadow-xl" style={{ maxHeight: 280 }}>
                    {allSeasonRounds.map(r => {
                      const isSelected = jkRoundIds.includes(r.id)
                      const isDisabled = !isSelected && jkRoundIds.length >= 8
                      return (
                        <button
                          key={r.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => toggleJkRound(r.id)}
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
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.course?.color_hex ?? '#555', flexShrink: 0 }} />
                          <span className="truncate">{roundLabel(r)}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* Pills */}
              {jkSelectedRounds.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {jkSelectedRounds.map(r => (
                    <span
                      key={r.id}
                      className="font-sans flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-white border border-white/20 bg-white/5"
                    >
                      {roundLabel(r)}
                      <button
                        type="button"
                        onClick={() => toggleJkRound(r.id)}
                        className="text-gray-400 hover:text-white transition-colors leading-none"
                        aria-label={`Poista ${roundLabel(r)}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Vertailukohta */}
            <div>
              <label className="label mb-2 block">VERTAILUKOHTA *</label>
              <p className="font-sans text-gray-600 text-xs mb-2">Vertaa tilanteeseen ennen:</p>
              <select
                value={effectiveCutoffId}
                onChange={e => setJkCutoffId(e.target.value)}
                className="font-sans w-full bg-gc-dark border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              >
                {allSeasonRounds.map(r => (
                  <option key={r.id} value={r.id}>{roundLabel(r)}</option>
                ))}
                <option value={SEASON_START}>Kauden alku (0 kierrosta)</option>
              </select>
            </div>

            {/* Päivämäärä */}
            <div>
              <label className="label mb-2 block">PÄIVÄMÄÄRÄ</label>
              <input
                type="date"
                value={jkDate}
                onChange={e => setJkDate(e.target.value)}
                className="font-sans w-full bg-gc-dark border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleGenerateJalkikortti}
                disabled={!jkCanGenerate}
                className="btn-primary font-sans disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Luo jälkikortti
              </button>
              <button
                type="button"
                onClick={handleClearJalkikortti}
                className="font-sans text-sm text-gray-500 hover:text-gray-300 border border-white/10 hover:border-white/20 px-3 py-2 rounded-lg transition-colors"
              >
                ✕ Tyhjennä
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button onClick={handleResetJalkikortti} className="btn-ghost font-sans text-sm mb-6">
              ← Luo uusi
            </button>
            <div className="flex flex-col gap-4 -mx-10 md:-mx-12">
              <div style={CARD_WRAP_STYLE}>
                <PostRoundCard
                  selectedRounds={jkPreview.rounds}
                  cutoffTimestamp={jkPreview.cutoffTimestamp}
                  allSeasonRounds={allSeasonRounds}
                  leaderboard={leaderboard}
                  seasonCourses={seasonCourses}
                  date={jkPreview.date}
                />
              </div>
              {jkPreviewCourses.map(c => (
                <div key={c.id} style={CARD_WRAP_STYLE}>
                  <SkinsCard
                    course={c}
                    seasonId={seasonId}
                    courseRounds={allSeasonRounds.filter(r => r.course_id === c.id).sort((a, b) => b.total_points - a.total_points)}
                  />
                </div>
              ))}
            </div>
            <CaptionBlock caption={postRoundCaption} color={jkPreviewColor} />
          </div>
        )}
      </div>
    </div>
  )
}
