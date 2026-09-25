import { resolveQuestion } from '../../lib/eventResolvers'
import type { EventPlayer, EventQuestion, EventScore } from '../../lib/eventQueries'

type Props = { players: EventPlayer[]; questions: EventQuestion[]; scores: EventScore[] }

const fieldKeys = new Set(['player_pick_best_total', 'player_pick_best_front', 'player_pick_best_back', 'player_pick_best_scratch', 'podium_top3'])

export default function EventResolutionStatus({ players, questions, scores }: Props) {
  const names = new Map(players.map(item => [item.player_id, item.player.full_name]))
  const entered = new Set(scores.filter(score => names.has(score.player_id)).map(score => score.player_id)).size
  const playerName = (id: unknown) => names.get(String(id)) ?? String(id)
  const scoreFor = (id: unknown) => scores.find(score => score.player_id === String(id))

  function answerText(question: EventQuestion, answer: any): string {
    const key = question.question_type.key
    if (answer == null) {
      if (key === 'player_pick_best_scratch') return 'Ei täydellistä lyöntikorttia'
      if (fieldKeys.has(key)) return 'Ei kirjattuja kortteja'
      if (key === 'beat_the_leader') return 'Kukaan ei ohittanut johtajaa'
      return 'Ei ratkaisevaa tulosta'
    }
    if (key === 'slider_player_points') return `${answer} pistettä`
    if (key === 'composition_player_line') return `${playerName(answer.featured_player_id)} — kortti valmis`
    if (key === 'yes_no_birdie' || key === 'yes_no_zero' || key === 'yes_no_four_birdies') return answer ? 'Kyllä' : 'Ei'
    if (key === 'yes_no_head_to_head') return playerName(answer)
    if (key === 'beat_the_leader') return `${playerName(answer)} ohitti johtajan`
    if (key === 'podium_top3') return `1. ${answer.first ? playerName(answer.first) : '—'} · 2. ${answer.second ? playerName(answer.second) : '—'} · 3. ${answer.third ? playerName(answer.third) : '—'}`
    if (key === 'player_pick_best_scratch') {
      const score = scoreFor(answer)
      return `${playerName(answer)}${score?.total_strokes != null ? ` — ${score.total_strokes} lyöntiä` : ''}`
    }
    if (key === 'player_pick_best_front' || key === 'player_pick_best_back') {
      const score = scoreFor(answer)
      const front = key.endsWith('front')
      const points = (score?.holes ?? []).filter(hole => front ? hole.hole <= 9 : hole.hole >= 10).reduce((sum, hole) => sum + hole.points, 0)
      return `${playerName(answer)} — ${points} pistettä`
    }
    if (key === 'player_pick_best_total') {
      const score = scoreFor(answer)
      const points = (score?.holes ?? []).reduce((sum, hole) => sum + (hole.points ?? 0), 0)
      return `${playerName(answer)}${score ? ` — ${points} pistettä` : ''}`
    }
    return typeof answer === 'string' ? playerName(answer) : JSON.stringify(answer)
  }

  return <section className="card p-5 space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div><h2 className="text-white font-bold">Ratkaisutilanne</h2><p className="text-sm text-gray-500 mt-1">{players.length} pelaajasta {entered} kirjattu</p></div>
      <span className="text-xs text-gray-500">Informatiivinen — ei estä julkaisua</span>
    </div>
    {questions.length === 0 ? <p className="text-sm text-gray-500">Ei kysymyksiä.</p> : <div className="divide-y divide-white/5">
      {questions.map((question, index) => {
        const resolution = resolveQuestion(question, scores, players.map(({ player }) => ({ id: player.id, full_name: player.full_name })))
        return <div key={question.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
          <span className="text-gray-500 text-sm w-5">{index + 1}</span>
          <div className="min-w-0 flex-1"><div className="text-sm text-white">{question.question_text || question.question_type.display_name}</div><div className={`text-sm mt-1 ${resolution.status === 'resolved' ? 'text-gc-green' : 'text-amber-300'}`}>{resolution.status === 'resolved' ? `Ratkaistu: ${answerText(question, resolution.answer)}` : `Ei ratkaistu: ${resolution.reason}`}</div>{resolution.status === 'resolved' && resolution.warning && <div className="text-xs mt-1 text-amber-300">⚠ {resolution.warning}</div>}</div>
          <span className={`text-[10px] uppercase tracking-wide rounded px-2 py-1 ${resolution.status === 'resolved' ? 'bg-gc-green/10 text-gc-green' : 'bg-amber-400/10 text-amber-300'}`}>{resolution.status === 'resolved' ? 'ratkaistu' : 'ei ratkaistu'}</span>
        </div>
      })}
    </div>}
  </section>
}
