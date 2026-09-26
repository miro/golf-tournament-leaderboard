import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getLeagueBrand } from '../../lib/branding'
import { scopedTable } from '../../lib/leagueClient'
import {
  getCourseHoleGuide,
  getEventParticipants,
  getEventPlayers,
  getEventQuestions,
  getEventScores,
  getLeagueEvent,
  type EventParticipant,
  type EventPlayer,
  type EventQuestion,
  type EventRow,
  type EventScore,
} from '../../lib/eventQueries'
import { isCompleteEventScore } from '../../lib/eventScoreCompleteness'
import { scoreEvent } from '../../lib/eventScoring'
import BulkEventScoreInput from '../../components/admin/BulkEventScoreInput'
import EventResolutionStatus from '../../components/admin/EventResolutionStatus'

const labels: Record<string, string> = {
  draft: 'Luonnos',
  betting_open: 'Veikkaukset auki',
  betting_closed: 'Veikkaukset suljettu',
  scoring: 'Tulosten syöttö',
  results_ready: 'Tulokset valmiit',
  presented: 'Esitetty',
}

const nextStatus: Record<string, { label: string; status: string }> = {
  draft: { label: 'Avaa veikkausmarkkina', status: 'betting_open' },
  betting_open: { label: 'Sulje veikkausmarkkina', status: 'betting_closed' },
  betting_closed: { label: 'Siirry tulosten syöttöön', status: 'scoring' },
  results_ready: { label: 'Merkitse esitetyksi', status: 'presented' },
}

type ManualHoleDraft = { points: string; strokes: string }
type ManualField = keyof ManualHoleDraft

function emptyManualHoles(): Record<number, ManualHoleDraft> {
  return Object.fromEntries(Array.from({ length: 18 }, (_, index) => [index + 1, { points: '', strokes: '' }]))
}

function manualHolesFromScore(score: EventScore | undefined): Record<number, ManualHoleDraft> {
  const draft = emptyManualHoles()
  for (const hole of score?.holes ?? []) {
    draft[hole.hole] = {
      points: hole.points?.toString() ?? '',
      strokes: hole.strokes_played?.toString() ?? '',
    }
  }
  return draft
}

function allPlayersComplete(scores: EventScore[], players: EventPlayer[]): boolean {
  return players.length > 0 && players.every(player => isCompleteEventScore(scores.find(score => score.player_id === player.player_id)))
}

export default function AdminEventDetail() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [players, setPlayers] = useState<EventPlayer[]>([])
  const [questions, setQuestions] = useState<EventQuestion[]>([])
  const [participants, setParticipants] = useState<EventParticipant[]>([])
  const [scores, setScores] = useState<EventScore[]>([])
  const [courseHoles, setCourseHoles] = useState<Array<{ hole: number; par: number }>>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [manualHoles, setManualHoles] = useState<Record<number, ManualHoleDraft>>(emptyManualHoles)

  const reload = useCallback(async () => {
    if (!id) return
    const [eventRow, eventPlayers, eventQuestions, eventParticipants, eventScores] = await Promise.all([
      getLeagueEvent(id),
      getEventPlayers(id),
      getEventQuestions(id),
      getEventParticipants(id),
      getEventScores(id),
    ])
    const holes = eventRow.course_id ? await getCourseHoleGuide(eventRow.course_id) : []
    setEvent(eventRow)
    setPlayers(eventPlayers)
    setQuestions(eventQuestions)
    setParticipants(eventParticipants)
    setScores(eventScores)
    setCourseHoles(holes)
    setLoading(false)
  }, [id])

  useEffect(() => {
    reload().catch(() => setLoading(false))
  }, [reload])

  useEffect(() => {
    if (event?.status !== 'betting_open') return
    const timer = window.setInterval(() => { reload().catch(() => undefined) }, 30_000)
    return () => window.clearInterval(timer)
  }, [event?.status, reload])

  const submitted = useMemo(() => new Map(scores.map(score => [score.player_id, score])), [scores])

  if (loading || !event) return <div className="text-gray-400">Ladataan...</div>

  const currentEvent = event
  const url = `${window.location.origin}/bet/${event.betting_url_token}`

  async function transition(status: string) {
    setBusy(true)
    await scopedTable('league_events').update({ status }).eq('id', currentEvent.id)
    await reload()
    setBusy(false)
  }

  function selectPlayer(playerId: string) {
    setSelectedPlayer(playerId)
    setManualHoles(manualHolesFromScore(submitted.get(playerId)))
    setMessage(null)
  }

  function updateManualHole(hole: number, field: ManualField, value: string) {
    setManualHoles(previous => ({
      ...previous,
      [hole]: { ...previous[hole], [field]: value },
    }))
  }

  async function saveScore() {
    if (!selectedPlayer) return

    const existing = submitted.get(selectedPlayer)
    const existingByHole = new Map((existing?.holes ?? []).map(hole => [hole.hole, hole]))
    const rows: Array<{
      hole: number
      par: number | null
      stroke_index: number | null
      strokes_played: number | null
      hcp_strokes: number | null
      points: number
    }> = []

    for (let hole = 1; hole <= 18; hole++) {
      const draft = manualHoles[hole] ?? { points: '', strokes: '' }
      const pointsText = draft.points.trim()
      const strokesText = draft.strokes.trim()
      const existingHole = existingByHole.get(hole)

      if (!pointsText && !strokesText) {
        if (existingHole) {
          rows.push({
            hole,
            par: existingHole.par,
            stroke_index: existingHole.stroke_index,
            strokes_played: existingHole.strokes_played,
            hcp_strokes: existingHole.hcp_strokes,
            points: existingHole.points,
          })
        }
        continue
      }

      if (!pointsText || !strokesText) {
        setMessage(`Väylä ${hole}: syötä sekä pisteet että lyönnit`)
        return
      }

      const points = Number(pointsText)
      const strokes = Number(strokesText)
      if (!Number.isInteger(points) || points < 0 || !Number.isInteger(strokes) || strokes <= 0) {
        setMessage(`Väylä ${hole}: pisteiden pitää olla vähintään 0 ja lyöntien positiivinen kokonaisluku`)
        return
      }

      const courseHole = courseHoles.find(item => item.hole === hole)
      rows.push({
        hole,
        par: existingHole?.par ?? courseHole?.par ?? null,
        stroke_index: existingHole?.stroke_index ?? null,
        strokes_played: strokes,
        hcp_strokes: existingHole?.hcp_strokes ?? null,
        points,
      })
    }

    if (!rows.length) {
      setMessage('Syötä vähintään yhden väylän pisteet ja lyönnit')
      return
    }

    const complete = rows.length === 18 && rows.every(row => row.points !== null && row.strokes_played !== null)
    const totalPoints = rows.reduce((sum, row) => sum + row.points, 0)
    const totalStrokes = complete ? rows.reduce((sum, row) => sum + (row.strokes_played ?? 0), 0) : null

    setBusy(true)
    try {
      const { data, error } = await scopedTable('event_scores')
        .upsert({
          ...(existing ? { id: existing.id } : {}),
          event_id: currentEvent.id,
          player_id: selectedPlayer,
          hcp: existing?.hcp ?? null,
          total_points: totalPoints,
          total_strokes: totalStrokes,
          is_corrected: Boolean(existing),
        }, { onConflict: 'event_id,player_id' })
        .select()
        .single()
      if (error || !data) throw error ?? new Error('Tuloskortin tallennus epäonnistui')

      const scoreId = (data as { id: string }).id
      const { error: holesError } = await scopedTable('event_hole_results').upsert(
        rows.map(row => ({ event_score_id: scoreId, ...row })),
        { onConflict: 'event_score_id,hole' },
      )
      if (holesError) throw holesError

      const latestScores = await getEventScores(currentEvent.id)
      if (allPlayersComplete(latestScores, players)) {
        await scoreEvent(currentEvent.id)
        const { error: statusError } = await scopedTable('league_events').update({ status: 'results_ready' }).eq('id', currentEvent.id)
        if (statusError) throw statusError
        setMessage('Kaikki tuloskortit ovat valmiit — tulokset laskettu')
      } else {
        if (currentEvent.status === 'results_ready') {
          const { error: statusError } = await scopedTable('league_events').update({ status: 'scoring' }).eq('id', currentEvent.id)
          if (statusError) throw statusError
        }
        setMessage(complete ? 'Tulos tallennettu — muita tuloskortteja puuttuu' : 'Osittainen tulos tallennettu — täydennä puuttuvat väylät')
      }
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tallennus epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  return <div className="max-w-5xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Link to="/admin/events" className="text-xs text-gray-500 hover:text-white">← Tapahtumat</Link><h1 className="text-3xl font-bold text-white mt-2">{event.name}</h1><p className="text-sm text-gray-500 mt-1">{new Date(`${event.event_date}T00:00:00`).toLocaleDateString('fi-FI')}{event.course?.name && ` · ${event.course.name}`}</p></div><div className="flex items-center gap-2"><Link to={`/admin/events/${event.id}/present`} className="btn-primary px-3 py-1.5 text-sm">Avaa gala-esitys</Link><span className="bg-white/10 text-gray-300 text-sm px-3 py-1.5 rounded-full">{labels[event.status]}</span></div></div>
    {message && <div className="rounded-lg bg-gc-green/10 border border-gc-green/30 text-gc-green p-3 text-sm">{message}</div>}
    <section className="card p-5 space-y-4"><div><h2 className="text-white font-bold">Veikkauksen tila</h2><p className="text-sm text-gray-500 mt-1">{event.status === 'draft' ? 'Veikkausmarkkina on suljettu. Avaa se, kun tapahtuma on valmis osallistujille.' : event.status === 'betting_open' ? 'Veikkausmarkkina on avoinna osallistujille.' : `Veikkaukset on suljettu · ${labels[event.status].toLowerCase()}.`}</p></div><div className="grid grid-cols-2 gap-3 border-y border-white/5 py-4 sm:grid-cols-4"><div><div className="label mb-1">Päivä</div><div className="text-sm text-white">{new Date(`${event.event_date}T00:00:00`).toLocaleDateString('fi-FI')}</div></div><div><div className="label mb-1">Kenttä</div><div className="text-sm text-white">{event.course?.name ?? 'Ei valittu'}</div></div><div><div className="label mb-1">Pelaajat</div><div className="text-sm text-white">{players.length}</div></div><div><div className="label mb-1">Kysymykset</div><div className="text-sm text-white">{questions.length}</div></div><div className="col-span-2 sm:col-span-4"><div className="label mb-1">Osallistujakoodi</div>{event.participant_code ? <div className="flex flex-wrap items-center gap-2"><code className="rounded bg-black/20 px-2 py-1 font-mono text-sm text-white">{event.participant_code}</code><button type="button" onClick={() => navigator.clipboard?.writeText(event.participant_code ?? '')} className="btn-ghost px-2 py-1 text-xs">Kopioi koodi</button></div> : <div className="text-sm text-gray-500">Ei asetettu</div>}</div></div>{nextStatus[event.status] && <button disabled={busy} onClick={() => transition(nextStatus[event.status].status)} className="btn-primary px-4 py-2 disabled:opacity-40">{nextStatus[event.status].label}</button>}{event.status === 'results_ready' && <Link to={`/bet/${event.betting_url_token}`} className="btn-ghost inline-block ml-2 px-4 py-2">Avaa tulokset</Link>}<div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 pt-2"><code className="bg-black/20 rounded px-2 py-1">{url}</code><button onClick={() => navigator.clipboard?.writeText(url)} className="btn-ghost px-2 py-1">Kopioi linkki</button>{event.status !== 'draft' && <span>{participants.length} pelaajaa veikannut</span>}</div></section>
    <EventResolutionStatus players={players} questions={questions} scores={scores} />
    {event.status === 'scoring' || event.status === 'results_ready' ? <><BulkEventScoreInput event={currentEvent} players={players} scores={scores} courseHoles={courseHoles} onReload={reload} /><section className="card p-5 space-y-5"><div><h2 className="text-white font-bold">Täydennä tuloskorttia</h2><p className="text-xs text-gray-500 mt-1">Valitse pelaaja ja syötä puuttuvien väylien pisteet sekä raakatulos. Vanhat väylät säilyvät, joten kuvan osittainen tulos voidaan täydentää myöhemmin.</p></div><div className="grid sm:grid-cols-2 gap-2">{players.map(({ player }) => { const score = submitted.get(player.id); const selected = selectedPlayer === player.id; const complete = isCompleteEventScore(score); return <button type="button" key={player.id} onClick={() => selectPlayer(player.id)} className={`text-left rounded-lg border px-3 py-2 transition-colors ${selected ? 'border-gc-green bg-gc-green/20 ring-1 ring-gc-green/40' : score ? 'border-gc-green/60 bg-gc-green/10 shadow-[0_0_0_1px_rgba(34,197,94,0.12)]' : 'border-white/10 bg-white/[0.02]'}`}><span className="flex items-center gap-2 text-white"><span className={complete ? 'text-gc-green' : score ? 'text-gc-gold' : 'text-gray-300'}>{complete ? '✓' : score ? '◐' : '○'}</span><span>{player.full_name}</span></span><span className={`block ml-6 text-xs ${complete ? 'font-medium text-gc-green' : score ? 'text-gc-gold' : 'text-gray-500'}`}>{score ? `${score.holes?.length ?? 0}/18 reikää · ${score.total_points}p${score.total_strokes != null ? ` · ${score.total_strokes} lyöntiä` : ' · keskeneräinen'}` : 'ei vielä'}</span></button> })}</div>{selectedPlayer && <div className="border-t border-white/5 pt-4 space-y-4"><div className="overflow-x-auto rounded-lg border border-white/10"><table className="w-full text-sm"><thead><tr className="border-b border-white/10 bg-black/20"><th className="px-3 py-2 text-left text-gray-500">Väylä</th><th className="px-3 py-2 text-left text-gray-500">Pisteet</th><th className="px-3 py-2 text-left text-gray-500">Lyönnit</th></tr></thead><tbody>{Array.from({ length: 18 }, (_, index) => index + 1).map(hole => <tr key={hole} className="border-b border-white/5 last:border-0"><td className="px-3 py-1.5 text-white">{hole}</td><td className="px-3 py-1.5"><input aria-label={`Väylä ${hole} pisteet`} type="number" min="0" value={manualHoles[hole]?.points ?? ''} onChange={e => updateManualHole(hole, 'points', e.target.value)} className="input w-28 py-1" /></td><td className="px-3 py-1.5"><input aria-label={`Väylä ${hole} lyönnit`} type="number" min="1" value={manualHoles[hole]?.strokes ?? ''} onChange={e => updateManualHole(hole, 'strokes', e.target.value)} className="input w-28 py-1" /></td></tr>)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-gray-500">Täytä puuttuvat väylät pareittain. Keskeneräinen kortti tallentuu, mutta ei ratkaise tapahtumaa.</p><button type="button" disabled={busy} onClick={saveScore} className="btn-primary px-4 py-2 disabled:opacity-40">{busy ? 'Tallennetaan…' : submitted.has(selectedPlayer) ? 'Tallenna täydennys' : 'Tallenna tulos'}</button></div></div>}</section></> : null}
    <section className="card p-5"><h2 className="text-white font-bold mb-3">Osallistujat</h2>{event.status === 'draft' ? <p className="text-sm text-gray-500">Osallistujat näkyvät, kun veikkaukset avataan.</p> : participants.length === 0 ? <p className="text-sm text-gray-500">Ei vielä veikkaajia</p> : <div className="divide-y divide-white/5">{participants.map(participant => <div key={participant.id} className="flex gap-3 py-2 text-sm"><span className="text-white flex-1">{participant.display_name}</span><span className="text-gray-500">{participant.emoji_pin ?? '—'}</span><span className="text-gray-500">{participant.total_points_awarded}p</span></div>)}</div>}</section>
    <section className="card p-5"><h2 className="text-white font-bold mb-3">Kysymykset</h2><div className="space-y-2">{questions.map((question, index) => <div key={question.id} className="flex gap-3 text-sm border-b border-white/5 py-2 last:border-0"><span className="text-gray-500">{index + 1}</span><span className="text-white flex-1">{question.question_type.display_name}</span>{event.status === 'results_ready' && <code className="text-xs text-gc-green">{JSON.stringify(question.correct_answer)}</code>}</div>)}</div></section>
    <p className="text-xs text-gray-600">Liigan brändi: {getLeagueBrand().name}</p>
  </div>
}
