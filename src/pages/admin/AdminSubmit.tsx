import { useEffect, useState } from 'react'
import { getCurrentSeason, getActivePlayers, getCourses } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import type { Player, Course } from '../../lib/database.types'

function buildPrompt(playerName: string): string {
  return `You are processing a GameBook golf scorecard screenshot for the Golf Company Liekkipoika Kesäkisa 2026 tournament admin system.

Return ONLY the following block, nothing else — no preamble, no markdown code fences, no explanation:

---GC-RESULT---
hcp: [player HCP as number]
total_points: [total stableford points as integer]
total_strokes: [total raw strokes as integer]
to_par: [strokes relative to par, e.g. -3 or +5]
summary: [Exactly 3 sentences in Finnish. Casual but sharp tone — like a knowledgeable friend reporting to a WhatsApp group. Player name is ${playerName}, use first name only after first mention.

Sentence 1: The overall result — total points and the general character of the round in one sentence.
Sentence 2: The most interesting specific moment — best hole, a collapse, front/back nine contrast, or a streak. Must reference a specific hole number or sequence.
Sentence 3: A punchy concluding verdict on the round. Factual — no opinion on tournament standings or what the result means for the competition.

Summary rules:
- Exactly 3 sentences, no more no less
- Never mention tournament position, standings, or rivals
- Never use filler without a specific fact attached — forbidden phrases: "vahva kokonaisuus", "tasainen kierros", "hieno suoritus"
- Emojis: only 📈 or ✍️ permitted, maximum one total, only if it genuinely adds something — default is no emoji
- No exclamation marks]

CSV:
hole,par,stroke_index,strokes_played,hcp_strokes,points
1,[par],[stroke_index],[strokes],[hcp_strokes],[points]
2,[par],[stroke_index],[strokes],[hcp_strokes],[points]
[...all 18 holes...]
18,[par],[stroke_index],[strokes],[hcp_strokes],[points]
---END---

Rules:
- Player name: always use exactly "${playerName}" as the player name in the summary. Ignore any name shown on the screenshot — the name in this prompt is the authoritative source.
- IMPORTANT: The screenshot must be from the "Pistebogey NET" tab in GameBook, not "Lyöntipeli NET". If the data you are reading appears to be stroke play (no points column, or points values that look like raw strokes), add this line to the output block before ---END---:
  warning: LYÖNTIPELI — tarkista välilehti
- to_par: negative number if under par (e.g. -3), positive if over
- If any hole value is missing or illegible, write NULL for that value
- CSV must have exactly 18 data rows, one per hole
- Do not add any extra fields or change the order`
}

interface ParsedHole {
  hole: number | null
  par: number | null
  stroke_index: number | null
  strokes_played: number | null
  hcp_strokes: number | null
  points: number | null
}

interface LLMParseResult {
  found: boolean
  hcp: string | null
  totalPoints: string | null
  totalStrokes: string | null
  toPar: string | null
  summary: string | null
  warning: string | null
  holes: ParsedHole[]
}

function parseLLMResponse(text: string): LLMParseResult {
  const START = '---GC-RESULT---'
  const END = '---END---'
  const startIdx = text.indexOf(START)
  const endIdx = text.indexOf(END)

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return { found: false, hcp: null, totalPoints: null, totalStrokes: null, toPar: null, summary: null, warning: null, holes: [] }
  }

  const block = text.slice(startIdx + START.length, endIdx)
  const lines = block.split('\n')

  let hcp: string | null = null
  let totalPoints: string | null = null
  let totalStrokes: string | null = null
  let toPar: string | null = null
  let summary: string | null = null
  let warning: string | null = null
  const holes: ParsedHole[] = []
  type Mode = 'header' | 'summary' | 'csv'
  let mode: Mode = 'header'
  const summaryLines: string[] = []
  let csvHeaderSkipped = false

  const p = (s: string): number | null => {
    const t = s.trim()
    if (!t || t.toUpperCase() === 'NULL') return null
    const n = parseInt(t)
    return isNaN(n) ? null : n
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (mode === 'csv') {
      if (!csvHeaderSkipped && trimmed.startsWith('hole,')) { csvHeaderSkipped = true; continue }
      if (!trimmed) continue
      const parts = trimmed.split(',')
      if (parts.length < 6) continue
      const hole: ParsedHole = {
        hole: p(parts[0]), par: p(parts[1]), stroke_index: p(parts[2]),
        strokes_played: p(parts[3]), hcp_strokes: p(parts[4]), points: p(parts[5]),
      }
      if (hole.hole !== null) holes.push(hole)
      continue
    }

    if (mode === 'summary') {
      if (trimmed === 'CSV:') { summary = summaryLines.join('\n').trim(); mode = 'csv'; continue }
      summaryLines.push(line)
      continue
    }

    // header mode
    if (!trimmed) continue
    if (trimmed === 'CSV:') { mode = 'csv'; continue }
    if (trimmed.startsWith('hcp:')) { hcp = trimmed.slice(4).trim() }
    else if (trimmed.startsWith('total_points:')) { totalPoints = trimmed.slice(13).trim() }
    else if (trimmed.startsWith('total_strokes:')) { totalStrokes = trimmed.slice(14).trim() }
    else if (trimmed.startsWith('to_par:')) { toPar = trimmed.slice(7).trim().replace(/^\+/, '') }
    else if (trimmed.startsWith('warning:')) { warning = trimmed.slice(8).trim() }
    else if (trimmed.startsWith('summary:')) {
      mode = 'summary'
      const first = trimmed.slice(8).trim()
      if (first) summaryLines.push(first)
    }
  }

  if (mode === 'summary') summary = summaryLines.join('\n').trim()

  return { found: true, hcp, totalPoints, totalStrokes, toPar, summary, warning, holes }
}

function rowBg(points: number | null): string {
  if (points === 0) return 'bg-red-900/30'
  if (points !== null && points >= 4) return 'bg-gc-green/20'
  if (points === 3) return 'bg-gc-green/10'
  return ''
}

export default function AdminSubmit() {
  const [players, setPlayers] = useState<Player[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [seasonId, setSeasonId] = useState('')

  // Stage 1 — manual
  const [playerId, setPlayerId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [playedDate, setPlayedDate] = useState('')

  // Stage 2 — LLM paste
  const [llmPaste, setLlmPaste] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)

  // Stage 3 — auto-populated but editable
  const [hcp, setHcp] = useState('')
  const [totalPoints, setTotalPoints] = useState('')
  const [totalStrokes, setTotalStrokes] = useState('')
  const [toPar, setToPar] = useState('')
  const [summaryText, setSummaryText] = useState('')

  const [isBackfill, setIsBackfill] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [season, playerList, courseList] = await Promise.all([
        getCurrentSeason(), getActivePlayers(), getCourses(),
      ])
      setSeasonId(season.id)
      setPlayers(playerList)
      setCourses(courseList)
    }
    load().catch(console.error)
  }, [])

  // Derived values (computed each render)
  const selectedPlayer = players.find(p => p.id === playerId) ?? null
  const promptText = selectedPlayer ? buildPrompt(selectedPlayer.full_name) : null

  const parseResult = llmPaste.trim() ? parseLLMResponse(llmPaste) : null
  const parsedHoles = parseResult?.found ? parseResult.holes : []
  const llmSourced = parseResult?.found === true

  // Auto-populate editable fields when a valid LLM block is pasted
  useEffect(() => {
    if (!llmPaste.trim()) return
    const result = parseLLMResponse(llmPaste)
    if (!result.found) return
    if (result.hcp !== null) setHcp(result.hcp)
    if (result.totalPoints !== null) setTotalPoints(result.totalPoints)
    if (result.totalStrokes !== null) setTotalStrokes(result.totalStrokes)
    if (result.toPar !== null) setToPar(result.toPar)
    if (result.summary !== null) setSummaryText(result.summary)
  }, [llmPaste])

  function resetForm() {
    setPlayerId(''); setCourseId(''); setPlayedDate('')
    setLlmPaste(''); setHcp(''); setTotalPoints('')
    setTotalStrokes(''); setToPar(''); setSummaryText('')
    setIsBackfill(false)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!playerId || !courseId || !playedDate || !totalPoints) {
      setError('Täytä kaikki pakolliset kentät'); return
    }
    setSubmitting(true); setError(null); setSuccess(false)

    const { data: round, error: roundError } = await db
      .from('rounds')
      .insert({
        season_id: seasonId, course_id: courseId, player_id: playerId,
        played_date: playedDate,
        hcp_at_time: hcp ? parseFloat(hcp) : null,
        total_strokes: totalStrokes ? parseInt(totalStrokes) : null,
        total_points: parseInt(totalPoints),
        to_par: toPar ? parseInt(toPar) : null,
        is_backfill: isBackfill,
        summary_text: summaryText || null,
        status: 'published',
      })
      .select().single()

    if (roundError) { setError(roundError.message); setSubmitting(false); return }

    if (parsedHoles.length > 0 && round) {
      await db.from('hole_results').insert(
        parsedHoles.map((h: ParsedHole) => ({
          round_id: (round as { id: string }).id,
          hole_number: h.hole, par: h.par, stroke_index: h.stroke_index,
          strokes_played: h.strokes_played, handicap_strokes: h.hcp_strokes, points: h.points,
        }))
      )
    }

    setSuccess(true); setSubmitting(false); resetForm()
  }

  const base = 'w-full bg-gc-dark border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-gc-green'
  const parsedCls = `${base} border-l-2 border-l-gc-gold`
  const fieldCls = (_val: string) => llmSourced ? parsedCls : base
  const fieldPlaceholder = (val: string) => llmSourced && !val ? 'Tarkista manuaalisesti' : ''

  const llmWarning = parseResult?.warning ?? null
  const missingRequired = !playerId || !courseId || !playedDate || !totalPoints
  const csvPasted = parseResult?.found === true
  const csvInvalid = csvPasted && (parsedHoles.length !== 18 || parsedHoles.some(h => h.points === null))
  const saveDisabled = submitting || missingRequired || csvInvalid || !!llmWarning
  const saveHint = llmWarning ? 'Väärä välilehti — korjaa ensin' : missingRequired ? 'Täytä pakolliset kentät' : csvInvalid ? 'Tarkista CSV ennen tallennusta' : null

  const calcPoints = parsedHoles.reduce((s, h) => s + (h.points ?? 0), 0)
  const calcStrokes = parsedHoles.reduce((s, h) => s + (h.strokes_played ?? 0), 0)
  const headerPoints = parseResult?.totalPoints ? parseInt(parseResult.totalPoints) : null
  const pointsMatch = headerPoints !== null && calcPoints === headerPoints

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

        {/* ── STAGE 1: Manual selection ── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label block mb-1">Pelaaja *</label>
            <select value={playerId} onChange={e => setPlayerId(e.target.value)} required className={base}>
              <option value="">Valitse pelaaja</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label block mb-1">Kenttä *</label>
            <select value={courseId} onChange={e => setCourseId(e.target.value)} required className={base}>
              <option value="">Valitse kenttä</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label block mb-1">Päivämäärä *</label>
          <input type="date" value={playedDate} onChange={e => setPlayedDate(e.target.value)} required className={base} />
        </div>

        {/* ── STAGE 2: Gamebook AI section ── */}
        <div className="card p-4 space-y-4">
          <div className="text-xs font-bold text-gc-gold uppercase tracking-widest">Gamebook-analyysi</div>

          {/* Instruction + prompt */}
          <div>
            <p className="text-xs text-gray-500 mb-3">
              Ota kuvakaappaus GameBook-tuloskortista niin että pelaajan nimi, HCP, pisteet ja kaikki 18 reikää näkyvät.
              Liitä kuva ja alla oleva prompt Claude- tai ChatGPT-keskusteluun.
              Kopioi koko vastaus ja liitä se alla olevaan kenttään.
            </p>

            <details className="mb-3 group">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 transition-colors list-none flex items-center gap-1.5">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                Näytä esimerkkikuvakaappaus
              </summary>
              <div className="mt-2 rounded-md overflow-hidden border border-white/10">
                <img src="/gb-example.png" alt="Esimerkki GameBook-tuloskortista" className="w-full object-contain max-h-80" />
              </div>
            </details>

            <div
              className="relative rounded-md border border-white/10 overflow-hidden"
              style={{ opacity: selectedPlayer ? 1 : 0.4, transition: 'opacity 200ms' }}
            >
              {selectedPlayer ? (
                <>
                  <pre className="bg-black/20 p-3 pr-28 text-xs text-gray-400 font-mono whitespace-pre-wrap leading-relaxed max-h-24 overflow-hidden">
                    {promptText}
                  </pre>
                  <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-gc-card to-transparent pointer-events-none" />
                </>
              ) : (
                <div className="bg-black/20 p-3 pr-28 flex items-center justify-center" style={{ minHeight: 96 }}>
                  <span className="text-xs text-gray-500 italic">Valitse pelaaja nähdäksesi prompt</span>
                </div>
              )}
              <button
                type="button"
                disabled={!selectedPlayer}
                title={!selectedPlayer ? 'Valitse pelaaja ensin' : undefined}
                onClick={async () => {
                  if (!promptText) return
                  await navigator.clipboard.writeText(promptText)
                  setPromptCopied(true)
                  setTimeout(() => setPromptCopied(false), 2000)
                }}
                className="absolute top-2 right-2 text-xs px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {promptCopied ? 'Kopioitu ✓' : 'Kopioi prompt'}
              </button>
            </div>
          </div>

          {/* Paste field */}
          <div>
            <label className="label block mb-1">Liitä LLM-vastaus tähän</label>
            <textarea
              value={llmPaste}
              onChange={e => setLlmPaste(e.target.value)}
              rows={7}
              placeholder="Liitä Claude- tai ChatGPT-vastaus tähän..."
              className={`${base} resize-none font-mono text-xs`}
            />
            {llmPaste.trim() && !parseResult?.found && (
              <p className="mt-1.5 text-xs text-gc-gold">
                ⚠ Tunnistusvirhe — varmista että vastaus sisältää ---GC-RESULT--- ja ---END---
              </p>
            )}
            {llmSourced && (
              <p className="mt-1.5 text-xs text-gc-green">
                ✓ Vastaus tunnistettu — kentät täytetty automaattisesti
              </p>
            )}
          </div>
        </div>

        {/* ── Wrong-tab warning banner ── */}
        {llmWarning && (
          <div className="bg-amber-900/30 border border-amber-500/50 rounded-md px-4 py-3 flex gap-3">
            <span className="text-amber-400 text-lg shrink-0">⚠</span>
            <p className="text-sm text-amber-300 leading-relaxed">
              <span className="font-bold">Väärä välilehti</span> — GameBookissa on valittuna Lyöntipeli NET.
              Ota uusi kuvakaappaus <span className="font-bold">Pistebogey NET</span> -välilehdeltä ja aja prompt uudelleen.
            </p>
          </div>
        )}

        {/* ── STAGE 3: Auto-populated editable fields ── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label block mb-1">HCP pelaushetkellä</label>
            <input
              type="number" step="0.1" min="0" max="54"
              value={hcp} onChange={e => setHcp(e.target.value)}
              placeholder={fieldPlaceholder(hcp)}
              className={fieldCls(hcp)}
            />
          </div>
          <div>
            <label className="label block mb-1">Pisteet *</label>
            <input
              type="number" min="0" required
              value={totalPoints} onChange={e => setTotalPoints(e.target.value)}
              placeholder={fieldPlaceholder(totalPoints)}
              className={fieldCls(totalPoints)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label block mb-1">Lyönnit</label>
            <input
              type="number" min="0"
              value={totalStrokes} onChange={e => setTotalStrokes(e.target.value)}
              placeholder={fieldPlaceholder(totalStrokes)}
              className={fieldCls(totalStrokes)}
            />
          </div>
          <div>
            <label className="label block mb-1">+/- Par</label>
            <input
              type="number"
              value={toPar} onChange={e => setToPar(e.target.value)}
              placeholder={fieldPlaceholder(toPar)}
              className={fieldCls(toPar)}
            />
          </div>
        </div>

        <div>
          <label className="label block mb-1">Kuvaus</label>
          <textarea
            value={summaryText} onChange={e => setSummaryText(e.target.value)}
            rows={3}
            placeholder={fieldPlaceholder(summaryText)}
            className={`${fieldCls(summaryText)} resize-none`}
          />
        </div>

        {/* ── STAGE 4: CSV verification table ── */}
        {parsedHoles.length > 0 && (
          <div className="space-y-2">
            {parsedHoles.length < 18 && (
              <p className="text-xs text-gc-gold">
                ⚠ Vain {parsedHoles.length} reikää löydetty — tarkista CSV
              </p>
            )}
            <div className="overflow-x-auto rounded-md border border-white/10">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/10 bg-black/20">
                    {['Reikä', 'Par', 'HI', 'Lyönnit', 'HCP lyönnit', 'Pisteet'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedHoles.map((h, i) => (
                    <tr key={i} className={`border-b border-white/5 ${rowBg(h.points)}`}>
                      <td className="px-3 py-1.5 text-gray-300">{h.hole ?? '?'}</td>
                      {([h.par, h.stroke_index, h.strokes_played, h.hcp_strokes] as (number | null)[]).map((val, j) => (
                        <td key={j} className={`px-3 py-1.5 ${val === null ? 'text-gc-gold' : 'text-gray-300'}`}>
                          {val ?? 'NULL'}
                        </td>
                      ))}
                      <td className={`px-3 py-1.5 font-bold ${
                        h.points === null ? 'text-gc-gold' :
                        h.points === 0 ? 'text-red-400' :
                        h.points >= 3 ? 'text-gc-green' : 'text-gray-300'
                      }`}>
                        {h.points ?? 'NULL'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
              <span>{parsedHoles.length} reikää</span>
              <span className="text-white/20">·</span>
              <span>{calcPoints} pistettä yhteensä</span>
              <span className="text-white/20">·</span>
              <span>{calcStrokes} lyöntiä</span>
              {headerPoints !== null && (
                pointsMatch
                  ? <span className="text-gc-green">✓ Pisteet täsmäävät</span>
                  : <span className="text-gc-gold">⚠ Ero: CSV {calcPoints} pistettä, yhteenveto {headerPoints} pistettä — tarkista että kuvakaappaus on otettu Pistebogey NET -välilehdeltä, ei Lyöntipeli NET</span>
              )}
            </div>
          </div>
        )}

        {/* Backfill */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox" id="backfill"
            checked={isBackfill} onChange={e => setIsBackfill(e.target.checked)}
            className="w-4 h-4 accent-gc-green"
          />
          <label htmlFor="backfill" className="text-sm text-gray-300">
            Backfill (kierros on pelattu aiemmin)
          </label>
        </div>

        {/* Save */}
        <div>
          <button
            type="submit"
            disabled={saveDisabled}
            title={saveHint ?? undefined}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Tallennetaan...' : 'Tallenna kierros'}
          </button>
          {saveHint && (
            <p className="text-xs text-gc-gold mt-1.5 text-center">{saveHint}</p>
          )}
        </div>

      </form>
    </div>
  )
}
