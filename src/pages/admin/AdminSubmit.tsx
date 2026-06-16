import { useEffect, useState } from 'react'
import { getCurrentSeason, getActivePlayers, getCourses, generateWhatsAppText } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import type { Player, Course } from '../../lib/database.types'

interface HoleRow {
  hole_number: number
  par: number
  stroke_index: number
  strokes_played: number | null
  handicap_strokes: number
  points: number
}

function parseCsv(text: string): HoleRow[] {
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/[,;\t]/).map(s => s.trim())
      return {
        hole_number: parseInt(parts[0]),
        par: parseInt(parts[1]),
        stroke_index: parseInt(parts[2]),
        strokes_played: parts[3] ? parseInt(parts[3]) : null,
        handicap_strokes: parseInt(parts[4] ?? '0'),
        points: parseInt(parts[5]),
      }
    })
    .filter(r => !isNaN(r.hole_number) && !isNaN(r.points))
}

export default function AdminSubmit() {
  const [players, setPlayers] = useState<Player[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [seasonId, setSeasonId] = useState('')

  const [playerId, setPlayerId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [playedDate, setPlayedDate] = useState('')
  const [hcp, setHcp] = useState('')
  const [totalStrokes, setTotalStrokes] = useState('')
  const [totalPoints, setTotalPoints] = useState('')
  const [toPar, setToPar] = useState('')
  const [isBackfill, setIsBackfill] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [csvText, setCsvText] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [season, playerList, courseList] = await Promise.all([
        getCurrentSeason(),
        getActivePlayers(),
        getCourses(),
      ])
      setSeasonId(season.id)
      setPlayers(playerList)
      setCourses(courseList)
    }
    load().catch(console.error)
  }, [])

  const player = players.find(p => p.id === playerId)
  const course = courses.find(c => c.id === courseId)
  const sharePreview =
    player && course && totalPoints
      ? generateWhatsAppText(
          player.full_name,
          course.name,
          parseInt(totalPoints),
          1,
          players.length,
          isBackfill,
          playedDate,
        )
      : null

  function resetForm() {
    setPlayerId('')
    setCourseId('')
    setPlayedDate('')
    setHcp('')
    setTotalStrokes('')
    setTotalPoints('')
    setToPar('')
    setSummaryText('')
    setCsvText('')
    setIsBackfill(false)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!playerId || !courseId || !playedDate || !totalPoints) {
      setError('Täytä kaikki pakolliset kentät')
      return
    }
    setSubmitting(true)
    setError(null)
    setSuccess(false)

    const { data: round, error: roundError } = await db
      .from('rounds')
      .insert({
        season_id: seasonId,
        course_id: courseId,
        player_id: playerId,
        played_date: playedDate,
        hcp_at_time: hcp ? parseFloat(hcp) : null,
        total_strokes: totalStrokes ? parseInt(totalStrokes) : null,
        total_points: parseInt(totalPoints),
        to_par: toPar ? parseInt(toPar) : null,
        is_backfill: isBackfill,
        summary_text: summaryText || null,
        status: 'published',
      })
      .select()
      .single()

    if (roundError) {
      setError(roundError.message)
      setSubmitting(false)
      return
    }

    if (csvText.trim() && round) {
      const holes = parseCsv(csvText)
      if (holes.length > 0) {
        await db.from('hole_results').insert(holes.map((h: object) => ({ ...h, round_id: (round as { id: string }).id })))
      }
    }

    setSuccess(true)
    setSubmitting(false)
    resetForm()
  }

  const inputClass =
    'w-full bg-gc-dark border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-gc-green'

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Syötä kierros</h1>

      {success && (
        <div className="bg-gc-green/20 border border-gc-green/40 text-gc-green rounded-md px-4 py-3 text-sm">
          Kierros tallennettu onnistuneesti!
        </div>
      )}
      {error && (
        <div className="bg-red-900/20 border border-red-500/40 text-red-400 rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label block mb-1">Pelaaja *</label>
            <select value={playerId} onChange={e => setPlayerId(e.target.value)} required className={inputClass}>
              <option value="">Valitse pelaaja</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label block mb-1">Kenttä *</label>
            <select value={courseId} onChange={e => setCourseId(e.target.value)} required className={inputClass}>
              <option value="">Valitse kenttä</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label block mb-1">Päivämäärä *</label>
            <input type="date" value={playedDate} onChange={e => setPlayedDate(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className="label block mb-1">HCP pelaushetkellä</label>
            <input type="number" step="0.1" min="0" max="54" value={hcp} onChange={e => setHcp(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label block mb-1">Pisteet *</label>
            <input type="number" min="0" value={totalPoints} onChange={e => setTotalPoints(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className="label block mb-1">Lyönnit</label>
            <input type="number" min="0" value={totalStrokes} onChange={e => setTotalStrokes(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="label block mb-1">+/- Par</label>
            <input type="number" value={toPar} onChange={e => setToPar(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className="label block mb-1">Kuvaus</label>
          <textarea
            value={summaryText}
            onChange={e => setSummaryText(e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="backfill"
            checked={isBackfill}
            onChange={e => setIsBackfill(e.target.checked)}
            className="w-4 h-4 accent-gc-green"
          />
          <label htmlFor="backfill" className="text-sm text-gray-300">
            Backfill (kierros on pelattu aiemmin)
          </label>
        </div>

        <div>
          <label className="label block mb-1">Reikätuloskortti CSV (valinnainen)</label>
          <p className="text-xs text-gray-500 mb-2">
            Muoto: reikä, par, stroke_index, lyönnit, hcp_lyönnit, pisteet
          </p>
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            rows={5}
            placeholder={'1,4,5,5,1,2\n2,3,7,3,0,2\n...'}
            className={`${inputClass} resize-none font-mono`}
          />
        </div>

        {sharePreview && (
          <div className="card p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
              WhatsApp-esikatselu (sijoitus arvio)
            </div>
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{sharePreview}</pre>
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? 'Tallennetaan...' : 'Tallenna kierros'}
        </button>
      </form>
    </div>
  )
}
