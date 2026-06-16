import { useEffect, useState } from 'react'
import { getCurrentSeason, getActivePlayers, getCourses, generateWhatsAppText } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import type { Player, Course } from '../../lib/database.types'

const GAMEBOOK_PROMPT = `You are processing a GameBook golf scorecard screenshot for the Golf Company Liekkipoika Kesäkisa 2026 tournament admin system.

Extract all data from the screenshot and return TWO things:

PART 1: CSV DATA

Return a CSV block with exactly this format, one row per hole:
hole,par,stroke_index,strokes_played,points

Followed by a summary row:
SUMMARY,player_name,hcp,total_strokes,total_points,to_par,date,course

Rules:
- Date format: YYYY-MM-DD
- to_par: negative if under par (e.g. -3), positive if over
- course: exact course name shown at top of screenshot
- hcp: number only
- If any hole data is missing or illegible, write NULL for that value
- Do not add extra columns or change the order

PART 2: FINNISH MATCH SUMMARY

Write a 2-4 sentence match summary in Finnish, in the style of a sports broadcaster. Highlight best holes, any collapses, front/back nine contrast, and the final result. Use the player's first name only after the first mention. Tone: enthusiastic but factual.

Return PART 1 first, then PART 2. Nothing else — no preamble, no explanation, no markdown formatting around the CSV.`

interface HoleRow {
  hole_number: number
  par: number
  stroke_index: number
  strokes_played: number | null
  handicap_strokes: number
  points: number
}

interface ParsedHole {
  hole: number | null
  par: number | null
  stroke_index: number | null
  strokes_played: number | null
  points: number | null
  hasNull: boolean
}

interface CsvParseResult {
  holes: ParsedHole[]
  summaryPoints: number | null
  summaryStrokes: number | null
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

function parseCsvForDisplay(text: string): CsvParseResult {
  const lines = text.trim().split('\n').filter(l => l.trim() !== '')
  const holes: ParsedHole[] = []
  let summaryPoints: number | null = null
  let summaryStrokes: number | null = null

  for (const line of lines) {
    const parts = line.split(/[,;\t]/).map(s => s.trim())
    if (parts[0].toUpperCase() === 'SUMMARY') {
      const p = parseInt(parts[4])
      const s = parseInt(parts[3])
      summaryPoints = isNaN(p) ? null : p
      summaryStrokes = isNaN(s) ? null : s
      continue
    }

    const parseVal = (s: string | undefined): number | null => {
      if (!s || s.toUpperCase() === 'NULL') return null
      const n = parseInt(s)
      return isNaN(n) ? null : n
    }

    // Prompt returns 5 cols (no hcp_strokes); schema has 6. Handle both.
    const isLong = parts.length >= 6
    const hole: ParsedHole = {
      hole: parseVal(parts[0]),
      par: parseVal(parts[1]),
      stroke_index: parseVal(parts[2]),
      strokes_played: parseVal(parts[3]),
      points: parseVal(isLong ? parts[5] : parts[4]),
      hasNull: false,
    }
    hole.hasNull = [hole.par, hole.stroke_index, hole.strokes_played, hole.points].some(v => v === null)
    if (hole.hole !== null) holes.push(hole)
  }

  return { holes, summaryPoints, summaryStrokes }
}

function rowBg(points: number | null): string {
  if (points === 0) return 'bg-red-900/30'
  if (points === 4) return 'bg-gc-green/20'
  if (points === 3) return 'bg-gc-green/10'
  return ''
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
  const [promptCopied, setPromptCopied] = useState(false)

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

  const csvResult = csvText.trim() ? parseCsvForDisplay(csvText) : null
  const csvBlocksSave =
    csvResult !== null &&
    (csvResult.holes.length !== 18 || csvResult.holes.some(h => h.points === null))

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

  const calcPoints = csvResult ? csvResult.holes.reduce((s, h) => s + (h.points ?? 0), 0) : 0
  const calcStrokes = csvResult ? csvResult.holes.reduce((s, h) => s + (h.strokes_played ?? 0), 0) : 0

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

        {/* GAMEBOOK PROMPT SECTION */}
        <div>
          <div className="label mb-2">Gamebook-ohje</div>
          <p className="text-xs text-gray-500 mb-3">
            Ota kuvakaappaus GameBook-tuloskortista niin että pelaajan nimi, HCP, pisteet ja kaikki 18 reikää näkyvät. Liitä kuva ja alla oleva prompt Claude- tai ChatGPT-keskusteluun. Kopioi CSV ja kuvaus takaisin tähän.
          </p>
          <details className="mb-3 group">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 transition-colors list-none flex items-center gap-1.5">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              Näytä esimerkkikuvakaappaus
            </summary>
            <div className="mt-2 rounded-md overflow-hidden border border-white/10">
              <img
                src="/gb-example.png"
                alt="Esimerkki GameBook-tuloskortista"
                className="w-full object-contain max-h-96"
              />
            </div>
          </details>
          <div className="relative rounded-md border border-white/10 overflow-hidden">
            <pre className="bg-gc-dark p-3 pr-28 text-xs text-gray-400 font-mono whitespace-pre-wrap leading-relaxed max-h-24 overflow-hidden">
              {GAMEBOOK_PROMPT}
            </pre>
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-gc-dark to-transparent pointer-events-none" />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(GAMEBOOK_PROMPT)
                setPromptCopied(true)
                setTimeout(() => setPromptCopied(false), 2000)
              }}
              className="absolute top-2 right-2 text-xs px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors whitespace-nowrap"
            >
              {promptCopied ? 'Kopioitu ✓' : 'Kopioi prompt'}
            </button>
          </div>
        </div>

        {/* CSV INPUT + LIVE VERIFICATION */}
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

          {csvResult && csvResult.holes.length > 0 && (
            <div className="mt-3 space-y-2">
              {csvResult.holes.length < 18 && (
                <div className="text-xs text-gc-gold">
                  ⚠ Vain {csvResult.holes.length} reikää löydetty — tarkista CSV
                </div>
              )}

              <div className="overflow-x-auto rounded-md border border-white/10">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/10 bg-black/20">
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Reikä</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Par</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">HI</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Lyönnit</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Pisteet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvResult.holes.map((h, i) => (
                      <tr key={i} className={`border-b border-white/5 ${rowBg(h.points)}`}>
                        <td className="px-3 py-1.5 text-gray-300">{h.hole ?? '?'}</td>
                        <td className={`px-3 py-1.5 ${h.par === null ? 'text-gc-gold' : 'text-gray-300'}`}>
                          {h.par ?? 'NULL'}
                        </td>
                        <td className={`px-3 py-1.5 ${h.stroke_index === null ? 'text-gc-gold' : 'text-gray-300'}`}>
                          {h.stroke_index ?? 'NULL'}
                        </td>
                        <td className={`px-3 py-1.5 ${h.strokes_played === null ? 'text-gc-gold' : 'text-gray-300'}`}>
                          {h.strokes_played ?? 'NULL'}
                        </td>
                        <td className={`px-3 py-1.5 font-bold ${
                          h.points === null ? 'text-gc-gold' :
                          h.points === 0 ? 'text-red-400' :
                          h.points >= 3 ? 'text-gc-green' :
                          'text-gray-300'
                        }`}>
                          {h.points ?? 'NULL'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                <span>{csvResult.holes.length} reikää</span>
                <span className="text-white/20">·</span>
                <span>{calcPoints} pistettä yhteensä</span>
                <span className="text-white/20">·</span>
                <span>{calcStrokes} lyöntiä</span>
                {csvResult.summaryPoints !== null && (
                  calcPoints === csvResult.summaryPoints ? (
                    <span className="text-gc-green">✓ Vastaa SUMMARY-riviä</span>
                  ) : (
                    <span className="text-gc-gold">
                      ⚠ Ero SUMMARY-riviin: {Math.abs(calcPoints - csvResult.summaryPoints)} pistettä
                    </span>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {sharePreview && (
          <div className="card p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
              WhatsApp-esikatselu (sijoitus arvio)
            </div>
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{sharePreview}</pre>
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={submitting || csvBlocksSave}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Tallennetaan...' : 'Tallenna kierros'}
          </button>
          {csvBlocksSave && (
            <p className="text-xs text-gc-gold mt-1.5 text-center">
              Tarkista CSV ennen tallennusta
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
