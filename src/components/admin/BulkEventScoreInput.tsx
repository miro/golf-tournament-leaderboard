import { useMemo, useState } from 'react'
import { getEventScores, type EventPlayer, type EventRow, type EventScore } from '../../lib/eventQueries'
import { scoreEvent } from '../../lib/eventScoring'
import { scopedTable } from '../../lib/leagueClient'
import { getLeagueBrand } from '../../lib/branding'
import { buildGameBookPrompt } from '../../lib/gamebookPrompt'
import { isCompleteEventScore } from '../../lib/eventScoreCompleteness'
import { errorMessage, upsertEventScore } from '../../lib/eventScoreWrite'
import {
  parseBlocks,
  validateBlock,
  type CourseForValidation,
  type Finding,
  type ParseError,
  type ParsedBlock,
} from '../../lib/gamebookParser'

type Props = {
  event: EventRow
  players: EventPlayer[]
  scores: EventScore[]
  courseHoles: CourseForValidation['holes']
  onReload: () => Promise<void>
}

type CardStatus = 'pending' | 'published' | 'failed'

type BulkCard = {
  key: string
  block: ParsedBlock
  findings: Finding[]
  replaced: boolean
  status: CardStatus
  publishError?: string
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('fi-FI')
}

function eventPlayerForBlock(block: ParsedBlock, players: EventPlayer[]): EventPlayer | undefined {
  const identifier = normalize(block.player)
  return players.find(({ player }) => [player.id, player.slug, player.full_name]
    .some(value => normalize(value) === identifier))
}

function cardKey(block: ParsedBlock, players: EventPlayer[]): string {
  return eventPlayerForBlock(block, players)?.player_id ?? `identifier:${normalize(block.player)}`
}

function rowBackground(points: number | null, missing: boolean, flagged: boolean): string {
  if (missing || flagged) return 'bg-red-900/30'
  if (points === 0) return 'bg-red-900/30'
  if (points !== null && points >= 4) return 'bg-gc-green/20'
  if (points === 3) return 'bg-gc-green/10'
  return ''
}

function findingClass(severity: Finding['severity']): string {
  if (severity === 'BLOCKING') return 'border-red-400/30 bg-red-900/20 text-red-200'
  if (severity === 'CONFIRMABLE') return 'border-gc-gold/30 bg-gc-gold/10 text-gc-gold'
  return 'border-sky-400/20 bg-sky-900/10 text-sky-200'
}

function findingForHole(findings: Finding[], hole: number): boolean {
  return findings.some(finding => finding.message.startsWith(`Väylä ${hole}`))
}

function failureReason(card: BulkCard, confirmed: boolean): string | null {
  const blocking = card.findings.filter(finding => finding.severity === 'BLOCKING')
  if (blocking.length) return blocking.map(finding => finding.message).join(' · ')
  const confirmable = card.findings.filter(finding => finding.severity === 'CONFIRMABLE')
  if (confirmable.length && !confirmed) return 'Vahvista ensin: ' + confirmable.map(finding => finding.message).join(' · ')
  return null
}

export default function BulkEventScoreInput({ event, players, scores, courseHoles, onReload }: Props) {
  const [input, setInput] = useState('')
  const [lastAddedInput, setLastAddedInput] = useState('')
  const [cards, setCards] = useState<BulkCard[]>([])
  const [parseErrors, setParseErrors] = useState<ParseError[]>([])
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [publishSummary, setPublishSummary] = useState<string | null>(null)
  const [promptCopied, setPromptCopied] = useState(false)

  const validationCourse = useMemo<CourseForValidation>(() => ({ holes: courseHoles }), [courseHoles])
  const promptText = useMemo(() => {
    const league = getLeagueBrand()
    return buildGameBookPrompt({
      context: `${league.name} ${league.tournament_name} · tapahtuma ${event.name}`,
      roster: players.map(({ player }) => ({ identifier: player.full_name, displayName: player.full_name })),
    })
  }, [event.name, players])

  function addText(text: string) {
    const parsed = parseBlocks(text)
    setParseErrors(previous => [...previous, ...parsed.parseErrors])
    const parsedKeys = parsed.blocks.map(block => cardKey(block, players))
    setCards(previous => {
      const next = [...previous]
      for (const block of parsed.blocks) {
        const key = cardKey(block, players)
        const index = next.findIndex(card => card.key === key)
        const card: BulkCard = {
          key,
          block,
          findings: validateBlock(block, validationCourse, players.map(({ player }) => ({ id: player.id, full_name: player.full_name, slug: player.slug }))),
          replaced: index !== -1,
          status: 'pending',
        }
        if (index === -1) next.push(card)
        else next[index] = card
      }
      return next
    })
    if (parsedKeys.length) {
      setConfirmations(previous => {
        const next = { ...previous }
        for (const key of parsedKeys) delete next[key]
        return next
      })
    }
  }

  function appendPastedText(text: string) {
    const nextInput = input.trim() ? `${input}\n\n${text}` : text
    setInput(nextInput)
    setLastAddedInput(nextInput)
    addText(text)
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    event.preventDefault()
    appendPastedText(event.clipboardData.getData('text'))
  }

  function addCurrentInput() {
    if (!input.trim() || input === lastAddedInput) return
    setLastAddedInput(input)
    addText(input)
  }

  async function publishAccumulated() {
    if (!cards.length) return
    setBusy(true)
    let working = [...cards]

    for (const card of cards) {
      if (card.status === 'published') continue
      const confirmed = confirmations[card.key] === true
      const reason = failureReason(card, confirmed)
      if (reason) {
        working = working.map(item => item.key === card.key ? { ...item, status: 'failed', publishError: reason } : item)
        continue
      }

      const target = eventPlayerForBlock(card.block, players)
      if (!target) {
        const unknownReason = `Pelaajaa "${card.block.player}" ei löydy rosterista`
        working = working.map(item => item.key === card.key ? { ...item, status: 'failed', publishError: unknownReason } : item)
        continue
      }

      try {
        const existing = scores.find(score => score.player_id === target.player_id)
        const mergedByHole = new Map<number, NonNullable<EventScore['holes']>[number] | ParsedBlock['holes'][number]>()
        for (const hole of existing?.holes ?? []) mergedByHole.set(hole.hole, hole)
        for (const hole of card.block.holes) mergedByHole.set(hole.hole, hole)
        const mergedHoles = [...mergedByHole.values()].sort((left, right) => left.hole - right.hole)
        const mergedPoints = mergedHoles.reduce((sum, hole) => sum + (hole.points ?? 0), 0)
        const completeImport = mergedHoles.length === 18
          && mergedHoles.every(hole => hole.points !== null && hole.strokes_played !== null)
        const visibleStrokes = completeImport
          ? mergedHoles.reduce((sum, hole) => sum + (hole.strokes_played ?? 0), 0)
          : null
        const score = await upsertEventScore({
          ...(existing ? { id: existing.id } : {}),
          event_id: event.id,
          player_id: target.player_id,
          hcp: card.block.hcp,
          total_points: mergedPoints,
          total_strokes: visibleStrokes,
          is_corrected: Boolean(existing),
        }, event.event_date)

        const holes = mergedHoles.map(hole => ({
          event_score_id: score.id,
          hole: hole.hole,
          par: hole.par,
          stroke_index: hole.stroke_index,
          strokes_played: hole.strokes_played,
          hcp_strokes: hole.hcp_strokes,
          points: hole.points,
        }))
        const { error: holesError } = await scopedTable('event_hole_results')
          .upsert(holes, { onConflict: 'event_score_id,hole' })
        if (holesError) throw holesError

        working = working.map(item => item.key === card.key ? { ...item, status: 'published', publishError: undefined } : item)
      } catch (error) {
        const message = errorMessage(error, 'Tallennus epäonnistui')
        working = working.map(item => item.key === card.key ? { ...item, status: 'failed', publishError: message } : item)
      }
    }

    setCards(working)
    const publishedNames = working.filter(card => card.status === 'published').map(card => eventPlayerForBlock(card.block, players)?.player.full_name ?? card.block.player)
    const failedNames = working.filter(card => card.status === 'failed').map(card => eventPlayerForBlock(card.block, players)?.player.full_name ?? card.block.player)
    setPublishSummary(`${publishedNames.length} kirjattu${failedNames.length ? ` · ${failedNames.length} epäonnistui — ${failedNames.join(', ')}` : ''}`)

    if (publishedNames.length) {
      try {
        const latestScores = await getEventScores(event.id)
        const allPlayersComplete = players.length > 0 && players.every(player => {
          const score = latestScores.find(candidate => candidate.player_id === player.player_id)
          return isCompleteEventScore(score)
        })
        const hasFailures = working.some(card => card.status === 'failed')
        if (allPlayersComplete && !hasFailures) {
          await scoreEvent(event.id)
          const { error } = await scopedTable('league_events').update({ status: 'results_ready' }).eq('id', event.id)
          if (error) throw error
        }
        await onReload()
      } catch (error) {
        const message = errorMessage(error, 'Tulosten laskenta epäonnistui')
        setPublishSummary(previous => `${previous ?? ''} · Laskenta epäonnistui: ${message}`)
      }
    }
    setBusy(false)
  }

  return (
    <section className="card p-5 space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-bold">GameBook-kortit</h2>
            <p className="text-xs text-gray-500 mt-1">Lue kaikki tapahtuman korttikuvat kerralla ja liitä yksi GC-RESULT-lohko per kortti. Uusi sama pelaaja korvaa aiemman kortin.</p>
          </div>
          {cards.length > 0 && <span className="text-xs text-gray-500">{cards.length} pelaajaa kerätty</span>}
        </div>
        {publishSummary && <div className="mt-3 rounded-lg border border-gc-green/30 bg-gc-green/10 px-3 py-2 text-sm text-gc-green">{publishSummary}</div>}
      </div>

      <div className="rounded-lg border border-white/10 bg-black/10 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gc-gold">GameBook-lukuprompti</div>
            <p className="mt-1 text-xs text-gray-500">Kopioi tämä prompti, liitä kaikki scorecard-kuvat samaan keskusteluun ja pyydä vastaus yhdellä lohkolla per kortti.</p>
          </div>
          <button type="button" onClick={async () => { await navigator.clipboard.writeText(promptText); setPromptCopied(true); window.setTimeout(() => setPromptCopied(false), 2000) }} className="btn-ghost px-3 py-1.5 text-xs">{promptCopied ? 'Kopioitu ✓' : 'Kopioi prompti'}</button>
        </div>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-black/20 p-3 text-[11px] leading-relaxed text-gray-400">{promptText}</pre>
      </div>

      <div className="space-y-2">
        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          onPaste={handlePaste}
          placeholder="Liitä yksi tai useampi ---GC-RESULT----lohko tähän"
          className="w-full input min-h-36 font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={addCurrentInput} disabled={busy || !input.trim() || input === lastAddedInput} className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40">Lisää tekstistä</button>
          <span className="text-xs text-gray-500">Liittäminen lisää kortit kerättyyn listaan; se ei tyhjennä aiempia kortteja.</span>
        </div>
      </div>

      {parseErrors.length > 0 && (
        <div className="space-y-2">
          {parseErrors.map((error, index) => (
            <div key={`${error.reason}-${index}`} className="rounded-lg border border-red-400/30 bg-red-900/20 px-3 py-2 text-xs text-red-200">
              <strong>BLOCKING · Lohkoa ei lisätty:</strong> {error.reason}
            </div>
          ))}
        </div>
      )}

      {cards.length > 0 && (
        <div className="space-y-5">
          {cards.map(card => {
            const target = eventPlayerForBlock(card.block, players)
            const confirmable = card.findings.some(finding => finding.severity === 'CONFIRMABLE')
            const holesByNumber = new Map(card.block.holes.map(hole => [hole.hole, hole]))
            return (
              <div key={card.key} className="rounded-lg border border-white/10 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/20 px-3 py-3">
                  <span className="font-bold text-white">{target?.player.full_name ?? card.block.player}</span>
                  <span className="text-xs text-gray-500">HCP {card.block.hcp} · {card.block.holes.length}/18 reikää · {card.block.holes.reduce((sum, hole) => sum + (hole.points ?? 0), 0)}p näkyvissä{card.block.holes.length === 18 && card.block.holes.every(hole => hole.strokes_played !== null) ? ` · ${card.block.holes.reduce((sum, hole) => sum + (hole.strokes_played ?? 0), 0)} lyöntiä` : ''}</span>
                  {card.replaced && <span className="rounded bg-gc-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gc-gold">korvattu</span>}
                  {card.status === 'published' && <span className="rounded bg-gc-green/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gc-green">julkaistu</span>}
                  {card.status === 'failed' && <span className="rounded bg-red-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-200">ei julkaistu</span>}
                  {card.publishError && <span className="basis-full text-xs text-red-200">{card.publishError}</span>}
                </div>

                {card.findings.length > 0 && (
                  <div className="space-y-1 px-3 pt-3">
                    {card.findings.map((finding, index) => (
                      <div key={`${finding.message}-${index}`} className={`flex items-start gap-2 rounded border px-2 py-1.5 text-xs ${findingClass(finding.severity)}`}>
                        <span className="shrink-0 font-bold">{finding.severity}</span>
                        <span>{finding.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 space-y-3">
                  <div className="overflow-x-auto rounded-md border border-white/10">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-white/10 bg-black/20">
                          {['Reikä', 'Par', 'HI', 'Lyönnit', 'Net lyönnit', 'Pisteet'].map(header => <th key={header} className="px-3 py-2 text-left text-gray-500 font-medium">{header}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 18 }, (_, index) => index + 1).map(holeNumber => {
                          const hole = holesByNumber.get(holeNumber)
                          const flagged = findingForHole(card.findings, holeNumber)
                          return (
                            <tr key={holeNumber} className={`border-b border-white/5 ${rowBackground(hole?.points ?? null, !hole, flagged)}`}>
                              <td className="px-3 py-1.5 text-gray-300">{holeNumber}</td>
                              {([hole?.par ?? null, hole?.stroke_index ?? null, hole?.strokes_played ?? null, hole?.hcp_strokes ?? null] as (number | null)[]).map((value, index) => <td key={index} className={`px-3 py-1.5 ${value === null ? 'text-gc-gold' : 'text-gray-300'}`}>{value ?? 'NULL'}</td>)}
                              <td className={`px-3 py-1.5 font-bold ${hole?.points === null || !hole ? 'text-gc-gold' : hole.points === 0 ? 'text-red-400' : hole.points >= 3 ? 'text-gc-green' : 'text-gray-300'}`}>{hole?.points ?? 'NULL'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                    <span>{card.block.holes.length} reikää</span><span className="text-white/20">·</span><span>{card.block.holes.reduce((sum, hole) => sum + (hole.points ?? 0), 0)} pistettä CSV:ssa</span><span className="text-white/20">·</span><span>{card.block.holes.reduce((sum, hole) => sum + (hole.strokes_played ?? 0), 0)} lyöntiä CSV:ssa</span>
                  </div>
                  {confirmable && card.status !== 'published' && <label className="flex items-center gap-2 text-xs text-gc-gold"><input type="checkbox" checked={confirmations[card.key] === true} onChange={event => setConfirmations(previous => ({ ...previous, [card.key]: event.target.checked }))} /> Vahvistan tämän kortin tallennuksen löydöksistä huolimatta</label>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <p className="text-xs text-gray-500">BLOCKING-kortit jäävät odottamaan. CONFIRMABLE-kortit vaativat oman vahvistuksensa.</p>
        <button type="button" onClick={publishAccumulated} disabled={busy || cards.length === 0} className="btn-primary px-4 py-2 disabled:opacity-40">
          {busy ? 'Kirjataan…' : 'Kirjaa valitut kortit'}
        </button>
      </div>
    </section>
  )
}
