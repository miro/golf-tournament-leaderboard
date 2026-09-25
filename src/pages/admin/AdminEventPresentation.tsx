import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import LeagueLogo from '../../components/LeagueLogo'
import { useLeague } from '../../contexts/LeagueContext'
import {
  getEventBets,
  getEventParticipants,
  getEventPlayers,
  getEventQuestions,
  getEventScores,
  getLeagueEvent,
  type EventPlayer,
  type EventQuestion,
  type EventRow,
  type EventScore,
  type EventBet,
  type EventParticipant,
} from '../../lib/eventQueries'
import { compositionCategoryForHole, rankScoresForQuestion, resolveQuestion, scoreAnswer, type PodiumAnswer, type Resolution, type ResolverPlayer } from '../../lib/eventResolvers'
import { getInvitationalResults } from '../../lib/queries'
import { playerImagePath } from '../../lib/playerImage'
import type { InvitationalResult, Player } from '../../lib/database.types'
import { CATEGORY_META, CATEGORY_ORDER, type HoleCategory } from '../proto/bet/types'

const HELD_KEYS = new Set(['player_pick_best_scratch', 'player_pick_best_total', 'podium_top3'])
const PRESENTATION_EXIT_WARNING = 'Olet poistumassa gala-esityksestä. Jos palaat tai päivität sivun, esityksen kohta nollautuu. Haluatko varmasti poistua?'

type Beat = {
  id: string
  next: string
  content: ReactNode
}

type LoadedData = {
  event: EventRow
  players: EventPlayer[]
  questions: EventQuestion[]
  participants: EventParticipant[]
  scores: EventScore[]
  bets: EventBet[]
  honours: InvitationalResult[]
}

function playerLabel(id: unknown, players: readonly ResolverPlayer[]): string {
  if (!id) return '—'
  return players.find(player => player.id === String(id))?.full_name ?? String(id)
}

function questionKey(question: EventQuestion): string {
  return question.question_type.key
}

function questionTitle(question: EventQuestion): string {
  const defaults: Record<string, string> = {
    player_pick_best_front: 'Kuka voittaa etuysin?',
    player_pick_best_back: 'Kuka tekee parhaat pisteet takayhdeksiköllä?',
    yes_no_four_birdies: 'Tuleeko kierroksella vähintään neljä birdietä?',
    yes_no_birdie: 'Tuleeko kierroksella birdie?',
    yes_no_zero: 'Tuleeko jollekin reikä ilman bogeypisteitä?',
    yes_no_head_to_head: 'Kumpi voittaa kaksintaistelun?',
    slider_player_points: 'Montako pistettä pelaaja tekee?',
    composition_player_line: 'Millainen on pelaajan pistejakauma?',
    beat_the_leader: 'Kuka päihittää johtajan?',
  }
  const text = question.question_text?.trim()
  return (text ? text.replace(/etuyhdeksän/gi, match => match[0] === 'E' ? 'Etuysin' : 'etuysin') : null) || question.question_type.display_name || defaults[questionKey(question)] || 'Veikkaus'
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function stableford(score: EventScore): number {
  return (score.holes ?? []).reduce((sum, hole) => sum + (hole.points ?? 0), 0)
}

function rawStrokes(score: EventScore): number | null {
  if (score.total_strokes != null) return score.total_strokes
  const strokes = (score.holes ?? []).map(hole => hole.strokes_played).filter((value): value is number => value != null)
  return strokes.length ? strokes.reduce((sum, value) => sum + value, 0) : null
}

type StrokeDistributionCounts = {
  birdie: number
  par: number
  bogey: number
  double: number
  triple: number
  worse: number
}

type StrokeCategoryKey = 'birdie' | 'par' | 'bogey' | 'double' | 'triple-worse'
type StrokeCategoryLeader = { players: Player[]; count: number }
type StrokeCategoryLeaders = Record<StrokeCategoryKey, StrokeCategoryLeader>

const strokeCategoryOrder: Array<{ key: StrokeCategoryKey; label: string }> = [
  { key: 'triple-worse', label: 'Triplabogey+' },
  { key: 'double', label: 'Tuplabogey' },
  { key: 'bogey', label: 'Bogey' },
  { key: 'par', label: 'Par' },
  { key: 'birdie', label: 'Birdie tai parempi' },
]

function openingStrokeData(scores: readonly EventScore[]): { total: number; missingHoles: number; counts: StrokeDistributionCounts } {
  const counts: StrokeDistributionCounts = { birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, worse: 0 }
  let total = 0
  let missingHoles = 0
  for (const score of scores) {
    const holes = new Map((score.holes ?? []).map(hole => [hole.hole, hole]))
    for (let holeNumber = 1; holeNumber <= 18; holeNumber += 1) {
      const hole = holes.get(holeNumber)
      if (hole?.strokes_played == null) {
        missingHoles += 1
        continue
      }
      total += hole.strokes_played
      if (hole.par == null) continue
      const relativeToPar = hole.strokes_played - hole.par
      if (relativeToPar <= -1) counts.birdie += 1
      else if (relativeToPar === 0) counts.par += 1
      else if (relativeToPar === 1) counts.bogey += 1
      else if (relativeToPar === 2) counts.double += 1
      else if (relativeToPar === 3) counts.triple += 1
      else counts.worse += 1
    }
  }
  return { total, missingHoles, counts }
}

function openingStrokeLeaders(scores: readonly EventScore[], eventPlayers: readonly EventPlayer[]): StrokeCategoryLeaders {
  const empty: StrokeCategoryLeaders = {
    birdie: { players: [], count: 0 },
    par: { players: [], count: 0 },
    bogey: { players: [], count: 0 },
    double: { players: [], count: 0 },
    'triple-worse': { players: [], count: 0 },
  }
  const playersById = new Map(eventPlayers.map(item => [item.player_id, item.player]))
  const counts = new Map<string, Record<StrokeCategoryKey, number>>()
  for (const score of scores) {
    const player = playersById.get(score.player_id)
    if (!player) continue
    const playerCounts = counts.get(score.player_id) ?? { birdie: 0, par: 0, bogey: 0, double: 0, 'triple-worse': 0 }
    for (const hole of score.holes ?? []) {
      if (hole.strokes_played == null || hole.par == null) continue
      const relativeToPar = hole.strokes_played - hole.par
      const key: StrokeCategoryKey = relativeToPar <= -1
        ? 'birdie'
        : relativeToPar === 0
          ? 'par'
          : relativeToPar === 1
            ? 'bogey'
            : relativeToPar === 2
              ? 'double'
              : 'triple-worse'
      playerCounts[key] += 1
    }
    counts.set(score.player_id, playerCounts)
  }
  for (const category of strokeCategoryOrder) {
    const count = Math.max(0, ...[...counts.values()].map(playerCounts => playerCounts[category.key]))
    if (count === 0) continue
    empty[category.key] = {
      count,
      players: [...counts.entries()]
        .filter(([, playerCounts]) => playerCounts[category.key] === count)
        .map(([playerId]) => playersById.get(playerId))
        .filter((player): player is Player => Boolean(player))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fi')),
    }
  }
  return empty
}

function AnimatedCount({ target, animate, delay, duration }: { target: number; animate: boolean; delay: number; duration: number }) {
  const [value, setValue] = useState(animate ? 0 : target)

  useEffect(() => {
    if (!animate) {
      setValue(target)
      return
    }
    setValue(0)
    let frame = 0
    const startedAt = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt - delay) / duration))
      setValue(Math.round(target * progress))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [animate, delay, target])

  return <>{value}</>
}

function StrokeDistribution({ counts, leaders, revealedLeaderCount, animateBars, animateLeaders, honours }: { counts: StrokeDistributionCounts; leaders: StrokeCategoryLeaders; revealedLeaderCount: number; animateBars: boolean; animateLeaders: boolean; honours: Map<string, PlayerHonours> }) {
  const cards: Array<{ key: StrokeCategoryKey; label: string; count: number; color: string; detail: string | null }> = [
    { key: 'birdie', label: 'Birdie tai parempi', count: counts.birdie, color: '#C0392B', detail: null },
    { key: 'par', label: 'Par', count: counts.par, color: '#343434', detail: null },
    { key: 'bogey', label: 'Bogey', count: counts.bogey, color: '#2E5F8A', detail: null },
    { key: 'double', label: 'Tuplabogey', count: counts.double, color: '#4A2D6F', detail: null },
    { key: 'triple-worse', label: 'Triplabogey+', count: counts.triple + counts.worse, color: '#3D2010', detail: `Triplabogey ${counts.triple} · huonompi ${counts.worse}` },
  ]
  const maxCount = Math.max(1, ...cards.map(card => card.count))
  const leaderDelays = new Map<StrokeCategoryKey, number>()
  let nextLeaderDelay = 0
  for (const category of strokeCategoryOrder) {
    leaderDelays.set(category.key, nextLeaderDelay)
    const leaderCount = category.key === 'birdie' ? 1 : Math.max(1, leaders[category.key].players.length)
    nextLeaderDelay += leaderCount * 700
  }
  return <div className="grid grid-cols-5 items-start gap-6">
    {cards.map((card, index) => {
      // The visual order is best → worst, but the entry order is worst → best.
      const delay = (cards.length - 1 - index) * 280
      const height = `${(card.count / maxCount) * 100}%`
      const revealIndex = strokeCategoryOrder.findIndex(category => category.key === card.key)
      const revealLeader = revealedLeaderCount > revealIndex
      const leader = leaders[card.key]
      const leaderDelay = leaderDelays.get(card.key) ?? 0
      return <div key={card.key} className="flex min-w-0 flex-col items-center">
        <div className="relative flex h-[19rem] w-full items-end justify-center">
          <div className={`gala-shot-bar w-[72%] rounded-t-xl ${animateBars ? 'gala-shot-bar-animate' : ''}`} style={{ '--gala-shot-height': height, backgroundColor: card.color, animationDelay: `${delay}ms`, height } as React.CSSProperties}>
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 text-7xl font-black leading-none text-white xl:text-8xl"><AnimatedCount target={card.count} animate={animateBars} delay={delay} duration={1500} /></div>
          </div>
        </div>
        <div className="mt-5 text-center text-xl font-bold leading-tight text-white xl:text-2xl">{card.label}</div>
        {card.detail && <div className="mt-2 text-center text-sm text-white/55">{card.detail}</div>}
        {revealLeader && <div className="mt-4 w-full space-y-3">
          {card.key === 'birdie' ? <HiddenLeaderCard animate={animateLeaders} delay={leaderDelay} /> : leader.players.length > 0 ? leader.players.map((player, leaderIndex) => <PresentationPlayerCard key={player.id} player={player} honours={honours.get(player.id) ?? emptyHonours()} compact={false} animate={animateLeaders} delay={leaderDelay + leaderIndex * 700} />) : <div className="text-center text-sm text-white/45">Ei kirjattuja väyliä</div>}
        </div>}
      </div>
    })}
  </div>
}

type PlayerHonours = {
  scratch: number
  scratchYears: number[]
  liekkipoika: number
  liekkipoikaYears: number[]
}

function emptyHonours(): PlayerHonours {
  return { scratch: 0, scratchYears: [], liekkipoika: 0, liekkipoikaYears: [] }
}

function honoursOverlayText(honours: PlayerHonours): string | null {
  const parts = [
    honours.liekkipoikaYears.length > 0 ? `Liekkipoika ${[...honours.liekkipoikaYears].sort((a, b) => a - b).join(' · ')}` : null,
    honours.scratchYears.length > 0 ? `Scratch ${[...honours.scratchYears].sort((a, b) => a - b).join(' · ')}` : null,
  ].filter((part): part is string => Boolean(part))
  return parts.length ? parts.join(' · ') : null
}

function LiekkipoikaMark({ honours, className = '' }: { honours: PlayerHonours; className?: string }) {
  if (honours.liekkipoika <= 0) return null
  return <span className={`inline-block shrink-0 whitespace-nowrap leading-none ${className}`} aria-label="Liekkipoika-voittaja">🔥👦</span>
}

function samePlayer(resultId: string | null, resultName: string | null, player: Player): boolean {
  if (resultId && resultId === player.id) return true
  return Boolean(resultName && resultName.trim().toLocaleLowerCase() === player.full_name.trim().toLocaleLowerCase())
}

function honoursForPlayers(players: readonly EventPlayer[], results: readonly InvitationalResult[]): Map<string, PlayerHonours> {
  const honours = new Map<string, PlayerHonours>(players.map(item => [item.player_id, emptyHonours()] as [string, PlayerHonours]))
  for (const result of results) {
    for (const item of players) {
      const counts = honours.get(item.player_id)
      if (!counts) continue
      if (samePlayer(result.scratch_winner_player_id, result.scratch_winner, item.player)) {
        counts.scratch += 1
        counts.scratchYears.push(result.year)
      }
      if (samePlayer(result.liekkipoika_winner_player_id, result.liekkipoika_winner, item.player)) {
        counts.liekkipoika += 1
        counts.liekkipoikaYears.push(result.year)
      }
    }
  }
  return honours
}

function PresentationPlayerCard({ player, count, maxCount, honours, compact, animate, delay, positionCounts, hcpOverride, showHonoursOverlay = false, honoursOverlayDuration }: {
  player: Player
  count?: number
  maxCount?: number
  honours: PlayerHonours
  compact: boolean
  animate: boolean
  delay: number
  positionCounts?: [number, number, number]
  hcpOverride?: number | null
  showHonoursOverlay?: boolean
  honoursOverlayDuration?: number
}) {
  const fallbackPath = playerImagePath(player.full_name)
  const [image, setImage] = useState(player.avatar_url || fallbackPath)
  const [failed, setFailed] = useState(false)
  const percentage = maxCount && count != null ? (count / maxCount) * 100 : 0
  const overlayText = (animate || showHonoursOverlay) ? honoursOverlayText(honours) : null
  const showBetStats = count != null
  return <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-card)] shadow-xl ${compact ? 'p-2' : 'p-3'} ${animate ? 'gala-roster-card-animate' : ''}`} style={{ animationDelay: `${delay}ms` }}>
    {overlayText && <div className={`${showHonoursOverlay ? 'gala-lineup-honours-overlay' : 'gala-honours-overlay'} absolute inset-0 z-20 flex items-center justify-center bg-black/80 px-4 text-center text-xl font-black leading-tight text-white xl:text-2xl`} style={{ animationDelay: `${delay}ms`, animationDuration: honoursOverlayDuration ? `${honoursOverlayDuration}ms` : undefined }}>{overlayText}</div>}
    <div className={`relative overflow-hidden rounded-lg bg-[var(--bg-dark)] ${compact ? 'h-16' : 'h-36 xl:h-44'}`}>
      {failed ? <div className="flex h-full items-center justify-center bg-[var(--league-primary)] text-3xl font-black text-[var(--bg-dark)]">{player.full_name.substring(0, 2).toUpperCase()}</div> : <img src={image} alt="" onError={() => {
        if (image !== fallbackPath) setImage(fallbackPath)
        else setFailed(true)
      }} className="h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
    </div>
    <div className={`${compact ? 'pt-2' : 'pt-3'} min-w-0`}>
      <div className={`${compact ? 'text-base' : 'text-2xl xl:text-3xl'} flex min-w-0 items-center gap-2 font-display font-bold text-white`}><span className="truncate">{player.full_name}</span><LiekkipoikaMark honours={honours} className={compact ? 'text-base' : 'text-xl xl:text-2xl'} /></div>
      <div className="mt-1 flex flex-wrap gap-1">
        {hcpOverride !== undefined && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">HCP {hcpOverride ?? '—'}</span>}
        {honours.scratch > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">{honours.scratch}× Scratch</span>}
        {honours.liekkipoika > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">{honours.liekkipoika}× Liekkipoika</span>}
      </div>
      {positionCounts && <div className="mt-2 text-[11px] text-white/50">1. {positionCounts[0]} · 2. {positionCounts[1]} · 3. {positionCounts[2]}</div>}
      {showBetStats && <div className="mt-4 rounded-xl bg-white/[.04] px-3 py-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[.18em] text-white/45">veikkausta</span>
          <span className="font-display text-4xl font-black leading-none text-white xl:text-5xl">{count}</span>
        </div>
        <div className="mt-2 h-4 overflow-hidden rounded-full bg-white/10 xl:h-5">
          <div className={`gala-bet-bar h-full rounded-full bg-white/75 ${animate ? 'gala-bet-bar-animate' : ''}`} style={{ '--gala-bet-width': `${percentage}%`, animationDelay: `${delay}ms`, width: `${percentage}%` } as React.CSSProperties} />
        </div>
      </div>}
    </div>
  </div>
}

function answerText(question: EventQuestion, answer: unknown, players: readonly ResolverPlayer[]): string {
  const key = questionKey(question)
  if (key === 'yes_no_birdie' || key === 'yes_no_four_birdies' || key === 'yes_no_zero') return answer === true ? 'Kyllä' : 'Ei'
  if (key === 'slider_player_points') return `${String(answer ?? '—')} pistettä`
  if (key === 'podium_top3') {
    const podium = (answer ?? {}) as Partial<PodiumAnswer>
    return [podium.first, podium.second, podium.third].map((id, index) => `${index + 1}. ${playerLabel(id, players)}`).join(' · ')
  }
  if (key === 'composition_player_line') return 'kortin pistejakauma'
  return playerLabel(answer, players)
}

function participantLabel(id: string, participants: readonly EventParticipant[]): string {
  return participants.find(participant => participant.id === id)?.display_name ?? 'Tuntematon veikkaaja'
}

function answerGroupKey(answer: unknown): string {
  if (answer === null || answer === undefined) return '—'
  if (typeof answer === 'object') return JSON.stringify(answer)
  return String(answer)
}

function distribution(question: EventQuestion, bets: readonly EventBet[], players: readonly ResolverPlayer[], participants: readonly EventParticipant[]): Array<{ answer: string; names: string[] }> {
  const groups = new Map<string, { answer: string; names: string[] }>()
  for (const bet of bets.filter(item => item.question_id === question.id)) {
    const key = answerGroupKey(bet.answer)
    const existing = groups.get(key)
    const name = participantLabel(bet.participant_id, participants)
    if (existing) existing.names.push(name)
    else groups.set(key, { answer: answerText(question, bet.answer, players), names: [name] })
  }
  return [...groups.values()].sort((a, b) => b.names.length - a.names.length || a.answer.localeCompare(b.answer, 'fi'))
}

function PlayerBetDistribution({ question, bets, eventPlayers, honours, animate }: { question: EventQuestion; bets: EventBet[]; eventPlayers: EventPlayer[]; honours: Map<string, PlayerHonours>; animate: boolean }) {
  const counts = new Map<string, number>()
  for (const bet of bets) {
    if (bet.question_id !== question.id || typeof bet.answer !== 'string') continue
    counts.set(bet.answer, (counts.get(bet.answer) ?? 0) + 1)
  }
  const summaries = [...counts.entries()]
    .map(([playerId, count]) => ({ player: eventPlayers.find(item => item.player_id === playerId)?.player, count }))
    .filter((item): item is { player: Player; count: number } => Boolean(item.player))
    .sort((a, b) => b.count - a.count || a.player.full_name.localeCompare(b.player.full_name, 'fi'))
  if (!summaries.length) return <p className="text-3xl text-white/45">Ei vielä veikkauksia</p>
  const crowded = summaries.length > 6
  const maxCount = summaries[0].count
  return <div className={`grid w-full gap-6 ${crowded ? 'grid-cols-12' : 'grid-cols-3'}`}>
    {summaries.map((summary, index) => <div key={summary.player.id} className={crowded ? (index < 3 ? 'col-span-4' : 'col-span-3') : 'col-span-1'}>
      <PresentationPlayerCard player={summary.player} count={summary.count} maxCount={maxCount} honours={honours.get(summary.player.id) ?? emptyHonours()} compact={false} animate={animate} delay={(summaries.length - 1 - index) * 700} />
    </div>)}
  </div>
}

function SplitBetDistribution({ question, bets, players, animate, showCorrect, resolution }: { question: EventQuestion; bets: EventBet[]; players: ResolverPlayer[]; animate: boolean; showCorrect: boolean; resolution?: Resolution }) {
  const key = questionKey(question)
  const labels = key === 'yes_no_head_to_head'
    ? [playerLabel(question.parameters.player_a_id, players), playerLabel(question.parameters.player_b_id, players)]
    : ['KYLLÄ', 'EI']
  const counts = labels.map((_, index) => {
    const expected = key === 'yes_no_head_to_head'
      ? (index === 0 ? String(question.parameters.player_a_id ?? '') : String(question.parameters.player_b_id ?? ''))
      : index === 0
    return bets.filter(bet => bet.question_id === question.id && (key === 'yes_no_head_to_head' ? String(bet.answer) === expected : bet.answer === expected)).length
  })
  const correctIndex = showCorrect && resolution?.status === 'resolved'
    ? key === 'yes_no_head_to_head'
      ? (String(resolution.answer) === String(question.parameters.player_a_id) ? 0 : String(resolution.answer) === String(question.parameters.player_b_id) ? 1 : -1)
      : resolution.answer === true ? 0 : resolution.answer === false ? 1 : -1
    : -1
  const max = Math.max(1, ...counts)
  return <div className="grid w-full max-w-6xl grid-cols-2 gap-8">
    {labels.map((label, index) => {
      const width = `${(counts[index] / max) * 100}%`
      const correct = correctIndex === index
      return <div key={label} className={`rounded-2xl border px-6 py-5 transition-colors ${correct ? 'border-[var(--league-primary)] bg-[color-mix(in_srgb,var(--league-primary)_12%,transparent)]' : 'border-white/10 bg-white/[.03]'}`}>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-3xl font-black text-white xl:text-4xl">{label}</span>
          <span className="text-6xl font-black text-white xl:text-7xl">{counts[index]}</span>
        </div>
        <div className="mt-4 h-6 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full bg-white/70 ${animate ? 'gala-split-bar-animate' : ''} ${correct ? 'bg-[var(--league-primary)]' : ''}`} style={{ '--gala-split-width': width, width } as React.CSSProperties} />
        </div>
        {correct && <div className="mt-3 text-xl font-bold text-[var(--league-primary)]">✓ Oikea vastaus</div>}
      </div>
    })}
  </div>
}

function SliderBetDistribution({ question, bets, animate }: { question: EventQuestion; bets: EventBet[]; animate: boolean }) {
  const values = bets.filter(bet => bet.question_id === question.id).map(bet => Number(bet.answer)).filter(Number.isFinite)
  if (!values.length) return <p className="text-3xl text-white/45">Ei vielä veikkauksia</p>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const counts = [...new Set(values)].sort((a, b) => a - b).map(value => ({ value, count: values.filter(item => item === value).length }))
  return <div className="max-w-6xl">
    <div className="relative h-40 px-5">
      <div className="absolute left-5 right-5 top-24 h-1 rounded-full bg-white/20" />
      {counts.map((item, index) => {
        const position = min === max ? 50 : ((item.value - min) / (max - min)) * 100
        return <div key={item.value} className={`absolute top-6 -translate-x-1/2 text-center ${animate ? 'gala-bet-marker-animate' : ''}`} style={{ left: `calc(${Math.min(97, Math.max(3, position))}% + ${position === 0 ? 5 : position === 100 ? -5 : 0}px)`, animationDelay: `${index * 90}ms` }}>
          <div className="text-3xl font-black text-white/75">{item.count}</div>
          <div className="mx-auto mt-2 h-10 w-10 rounded-full border-4 border-white/60 bg-[var(--bg-card)]" />
          <div className="mt-3 text-2xl font-bold text-white/80">{item.value}p</div>
        </div>
      })}
    </div>
    <div className="mt-5 flex justify-between text-2xl text-white/55"><span>Minimi {min}p</span><span>Maksimi {max}p</span></div>
  </div>
}

function PodiumBetDistribution({ question, bets, players, eventPlayers, honours, animate }: { question: EventQuestion; bets: EventBet[]; players: ResolverPlayer[]; eventPlayers: EventPlayer[]; honours: Map<string, PlayerHonours>; animate: boolean }) {
  const summaries = new Map<string, { total: number; positions: [number, number, number] }>()
  const sweeps = new Map<string, { ids: [string, string, string]; count: number }>()
  for (const bet of bets.filter(item => item.question_id === question.id)) {
    const answer = (bet.answer ?? {}) as Partial<PodiumAnswer>
    const ids = [answer.first, answer.second, answer.third].map(value => typeof value === 'string' ? value : null) as [string | null, string | null, string | null]
    ids.forEach((id, position) => {
      if (!id) return
      const current = summaries.get(id) ?? { total: 0, positions: [0, 0, 0] }
      current.total += 1
      current.positions[position] += 1
      summaries.set(id, current)
    })
    if (ids.every((id): id is string => Boolean(id))) {
      const key = ids.join('|')
      const current = sweeps.get(key)
      if (current) current.count += 1
      else sweeps.set(key, { ids: ids as [string, string, string], count: 1 })
    }
  }
  const ordered = [...summaries.entries()]
    .map(([playerId, stats]) => ({ player: eventPlayers.find(item => item.player_id === playerId)?.player, ...stats }))
    .filter((item): item is { player: Player; total: number; positions: [number, number, number] } => Boolean(item.player))
    .sort((a, b) => b.total - a.total || a.player.full_name.localeCompare(b.player.full_name, 'fi'))
  if (!ordered.length) return <p className="text-3xl text-white/45">Ei vielä veikkauksia</p>
  const crowded = ordered.length > 6
  const maxCount = ordered[0].total
  const repeatedSweeps = [...sweeps.values()].filter(sweep => sweep.count > 1).sort((a, b) => b.count - a.count)
  return <div>
    <div className={`grid w-full gap-6 ${crowded ? 'grid-cols-12' : 'grid-cols-3'}`}>
      {ordered.map((summary, index) => <div key={summary.player.id} className={crowded ? (index < 3 ? 'col-span-4' : 'col-span-3') : 'col-span-1'}>
        <PresentationPlayerCard player={summary.player} count={summary.total} maxCount={maxCount} honours={honours.get(summary.player.id) ?? emptyHonours()} compact={false} animate={animate} delay={(ordered.length - 1 - index) * 700} positionCounts={index < 3 ? summary.positions : undefined} />
      </div>)}
    </div>
    <div className="mt-8 border-t border-white/10 pt-5">
      <div className="text-sm font-semibold uppercase tracking-[.18em] text-white/40">Saman kolmikon yritykset</div>
      <div className="mt-3 space-y-2 text-xl text-white/65">{repeatedSweeps.length ? repeatedSweeps.map(sweep => <div key={sweep.ids.join('|')}>{sweep.count} veikkasi saman kolmikon: {sweep.ids.map(id => playerLabel(id, players)).join('–')}</div>) : <div>Ei toistuvia kolmikkoveikkauksia</div>}</div>
    </div>
  </div>
}

function BetDistribution({ question, bets, players, participants, eventPlayers, honours, animate }: { question: EventQuestion; bets: EventBet[]; players: ResolverPlayer[]; participants: EventParticipant[]; eventPlayers: EventPlayer[]; honours: Map<string, PlayerHonours>; animate: boolean }) {
  const key = questionKey(question)
  if (['yes_no_four_birdies', 'yes_no_birdie', 'yes_no_zero', 'yes_no_head_to_head'].includes(key)) return <SplitBetDistribution question={question} bets={bets} players={players} animate={animate} showCorrect={false} />
  if (['player_pick_best_front', 'player_pick_best_back', 'player_pick_best_scratch'].includes(key)) return <PlayerBetDistribution question={question} bets={bets} eventPlayers={eventPlayers} honours={honours} animate={animate} />
  if (key === 'slider_player_points') return <SliderBetDistribution question={question} bets={bets} animate={animate} />
  if (key === 'podium_top3') return <PodiumBetDistribution question={question} bets={bets} players={players} eventPlayers={eventPlayers} honours={honours} animate={animate} />
  const groups = distribution(question, bets, players, participants)
  if (!groups.length) return <p className="text-3xl text-white/45">Ei vielä veikkauksia</p>
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{groups.map(group => <div key={group.answer} className="rounded-2xl border border-white/10 bg-white/[.04] px-5 py-4"><div className="text-3xl font-bold text-white">{group.answer}</div><div className="mt-2 text-xl text-white/60">{group.names.length} · {group.names.join(', ')}</div></div>)}</div>
}

function Ruling({ question, resolution, bets, participants, players }: { question: EventQuestion; resolution: Resolution; bets: EventBet[]; participants: EventParticipant[]; players: ResolverPlayer[] }) {
  if (resolution.status === 'unresolved') {
    return <div className="max-w-5xl">
      <div className="text-7xl font-black tracking-tight text-white">Ei ratkennut</div>
      <div className="mt-6 text-2xl text-white/55">{resolution.reason}</div>
      <div className="mt-8 text-2xl text-white/55">Kukaan ei saanut pisteitä</div>
    </div>
  }
  const correct = bets.filter(bet => bet.question_id === question.id && scoreAnswer(question, bet.answer, resolution) > 0)
  return <div className="max-w-6xl">
    <div className="text-3xl font-semibold uppercase tracking-[.18em] text-white/45">Oikea vastaus</div>
    <div className="mt-3 text-7xl font-black tracking-tight" style={{ color: 'var(--league-primary)' }}>{answerText(question, resolution.answer, players)}</div>
    <div className="mt-10 text-3xl text-white">{correct.length ? `${correct.length} oikein · ${correct.map(bet => participantLabel(bet.participant_id, participants)).join(', ')}` : 'Kukaan ei saanut pisteitä'}</div>
    {resolution.warning && <div className="mt-5 text-xl text-white/45">{resolution.warning}</div>}
  </div>
}

function AccumulatingYesNoBeat({ question, questionNumber, questionTotal, state, bets, resolution, participants, players, animateDistribution }: { question: EventQuestion; questionNumber: number; questionTotal: number; state: 1 | 2 | 3; bets: EventBet[]; resolution: Resolution; participants: EventParticipant[]; players: ResolverPlayer[]; animateDistribution: boolean }) {
  return <div className="mx-auto flex h-full min-h-[42rem] w-full max-w-6xl flex-col items-center text-center">
    <div className="flex h-[20rem] shrink-0 w-full flex-col items-center justify-center">
      <div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">VEIKKAUS</div>
      <h2 className="mt-7 max-w-6xl text-8xl font-black leading-[.95]">{questionTitle(question)}</h2>
      <div className="mt-8 text-3xl text-white/45">Kysymys {questionNumber} / {questionTotal}</div>
    </div>
    {state >= 2 && <div className="w-full shrink-0 border-t border-white/10 pt-8"><SplitBetDistribution question={question} bets={bets} players={players} animate={animateDistribution} showCorrect={state === 3} resolution={resolution} /></div>}
    {state >= 3 && <div className="mt-8 w-full shrink-0 border-t border-white/10 pt-8"><Ruling question={question} resolution={resolution} bets={bets} participants={participants} players={players} /></div>}
  </div>
}

type CompositionPresentationState = 1 | 2 | 3 | 4
type CompositionActualHole = {
  hole: number
  par: number | null
  strokeIndex: number | null
  strokesPlayed: number | null
  points: number
  category: HoleCategory | null
}

const compositionNineDuration = 1800

function compositionAnswerCategory(answer: unknown, holeIndex: number): HoleCategory | null {
  const holes = (answer as { holes?: unknown[] } | null)?.holes
  const value = holes?.[holeIndex]
  if (typeof value === 'string' && CATEGORY_ORDER.includes(value as HoleCategory)) return value as HoleCategory
  if (value && typeof value === 'object' && 'category' in value) {
    const category = (value as { category?: unknown }).category
    return typeof category === 'string' && CATEGORY_ORDER.includes(category as HoleCategory) ? category as HoleCategory : null
  }
  return null
}

function compositionActualHoles(score: EventScore | null): CompositionActualHole[] {
  const byHole = new Map((score?.holes ?? []).map(hole => [hole.hole, hole]))
  return Array.from({ length: 18 }, (_, index) => {
    const result = byHole.get(index + 1)
    return {
      hole: index + 1,
      par: result?.par ?? null,
      strokeIndex: result?.stroke_index ?? null,
      strokesPlayed: result?.strokes_played ?? null,
      points: result?.points ?? 0,
      category: result ? compositionCategoryForHole(result) : null,
    }
  })
}

function compositionCategoryDistribution(bets: readonly EventBet[], questionId: string, holeIndex: number): Record<HoleCategory, number> {
  const counts = Object.fromEntries(CATEGORY_ORDER.map(category => [category, 0])) as Record<HoleCategory, number>
  for (const bet of bets) {
    if (bet.question_id !== questionId) continue
    const category = compositionAnswerCategory(bet.answer, holeIndex)
    if (category) counts[category] += 1
  }
  return counts
}

function compositionCorrectCount(answer: unknown, actual: readonly CompositionActualHole[]): number {
  return actual.reduce((count, hole, index) => count + (hole.category && compositionAnswerCategory(answer, index) === hole.category ? 1 : 0), 0)
}

function compositionParticipantScores(bets: readonly EventBet[], questionId: string, participants: readonly EventParticipant[], actual: readonly CompositionActualHole[], resolvedHoleNumbers: ReadonlySet<number>) {
  const byParticipant = new Map<string, EventBet>()
  for (const bet of bets) if (bet.question_id === questionId && !byParticipant.has(bet.participant_id)) byParticipant.set(bet.participant_id, bet)
  return [...byParticipant.values()]
    .map(bet => {
      const correct = actual.reduce((count, hole, index) => count + (resolvedHoleNumbers.has(hole.hole) && hole.category && compositionAnswerCategory(bet.answer, index) === hole.category ? 1 : 0), 0)
      const participant = participants.find(item => item.id === bet.participant_id)
      return { bet, name: participant?.display_name ?? 'Tuntematon veikkaaja', correct, submittedAt: participant?.submitted_at ?? '' }
    })
    .sort((a, b) => b.correct - a.correct || a.submittedAt.localeCompare(b.submittedAt))
}

function CompositionCategoryLegend() {
  return <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-3" aria-label="Tuloskortin väriselite">
    {CATEGORY_ORDER.map(category => <div key={category} className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-white/60">
      <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-white/20" style={{ backgroundColor: CATEGORY_META[category].cellColor }} />
      <span>{CATEGORY_META[category].label}</span>
    </div>)}
  </div>
}

function CompositionHoleRow({ question, hole, bets, participants, age, actualRevealed, animate }: { question: EventQuestion; hole: CompositionActualHole; bets: EventBet[]; participants: EventParticipant[]; age: number; actualRevealed: boolean; animate: boolean }) {
  const counts = compositionCategoryDistribution(bets, question.id, hole.hole - 1)
  const totalBets = CATEGORY_ORDER.reduce((sum, category) => sum + counts[category], 0)
  const correctNames = bets
    .filter(bet => bet.question_id === question.id && hole.category && compositionAnswerCategory(bet.answer, hole.hole - 1) === hole.category)
    .map(bet => participants.find(participant => participant.id === bet.participant_id)?.display_name ?? 'Tuntematon veikkaaja')
  const actualCategory = hole.category ? CATEGORY_META[hole.category] : null
  const rawDataMissing = hole.strokesPlayed == null
  const actualLabel = actualCategory
    ? actualCategory.fullLabel
    : 'Tarkka luokka ei tiedossa'
  const actualDetail = actualCategory
    ? `${hole.points} pistettä${rawDataMissing ? ' · raakatulos puuttuu' : hole.strokesPlayed != null ? ` · ${hole.strokesPlayed} lyöntiä` : ''}`
    : `${hole.points} pistettä · raakatulos puuttuu`
  const rowClass = age === 0 ? 'gala-composition-row-current' : age <= 3 ? 'gala-composition-row-recent' : 'gala-composition-row-old'
  return <article className={`relative grid min-h-[7rem] grid-cols-[5.5rem_minmax(0,1fr)_15rem_9rem] items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-card)] px-4 py-3 shadow-xl ${rowClass} ${animate ? 'gala-composition-hole-in' : ''}`}>
    <div className="flex h-full flex-col justify-center border-r border-white/10 pr-4">
      <div className="text-4xl font-black leading-none text-white">{hole.hole}</div>
      <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-white/55">Par {hole.par ?? '—'} · SI {hole.strokeIndex ?? '—'}</div>
    </div>
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-white/40">Veikkaukset</div>
      <div className="flex h-9 w-full overflow-hidden rounded-lg bg-white/10">
        {CATEGORY_ORDER.map(category => {
          const count = counts[category]
          if (!count || !totalBets) return null
          const width = `${(count / totalBets) * 100}%`
          const correct = actualRevealed && hole.category === category
          const showCount = count >= 2 || (totalBets <= 5 && count > 0)
          return <div key={category} className={`gala-composition-prediction-segment relative flex min-w-[2px] items-center justify-center ${correct ? 'gala-composition-prediction-correct' : ''}`} style={{ width, backgroundColor: CATEGORY_META[category].cellColor }} title={`${CATEGORY_META[category].fullLabel}: ${count}`}><span className={showCount ? 'text-lg font-black text-white drop-shadow' : 'sr-only'}>{count}</span></div>
        })}
      </div>
    </div>
    <div className={`min-w-0 transition-opacity duration-300 ${actualRevealed ? 'opacity-100' : 'opacity-0'}`}>
      <div className="text-[11px] font-bold uppercase tracking-[.16em] text-white/40">Tulos</div>
      <div className="mt-1 truncate text-2xl font-black" style={{ color: actualCategory?.cellColor ?? 'var(--text-muted)' }}>{actualLabel}</div>
      <div className="truncate text-sm text-white/55">{actualDetail}</div>
    </div>
    <div className="relative text-right">
      <div className="text-[11px] font-bold uppercase tracking-[.16em] text-white/40">Oikein</div>
      <div className="mt-1 text-3xl font-black text-white">{actualRevealed ? correctNames.length : '—'}</div>
    </div>
    {actualRevealed && correctNames.length > 0 && <div className="gala-composition-correct-flash pointer-events-none absolute inset-x-6 bottom-2 rounded-xl bg-[var(--league-primary)] px-3 py-2 text-center text-sm font-black text-[var(--bg-dark)]">✓ {correctNames.join(' · ')}</div>}
  </article>
}

function CompositionTargetCard({ target, score, honours }: { target: EventPlayer | null; score: EventScore | null; honours: PlayerHonours }) {
  if (!target) return <div className="rounded-2xl border border-white/10 bg-white/[.03] px-6 py-8 text-3xl text-white/55">Kohdepelaajaa ei löytynyt</div>
  return <div className="w-[22rem]">
    <PresentationPlayerCard player={target.player} honours={honours} compact={false} animate={false} delay={0} hcpOverride={score?.hcp ?? target.player.hcp_fallback} />
  </div>
}

function CompositionFinalScore({ question, bets, participants, actual, animate }: { question: EventQuestion; bets: EventBet[]; participants: EventParticipant[]; actual: CompositionActualHole[]; animate: boolean }) {
  const scores = bets.filter(bet => bet.question_id === question.id).map(bet => {
    const correct = compositionCorrectCount(bet.answer, actual)
    return { bet, correct, points: Math.round(correct / 18 * question.question_type.max_points), name: participants.find(participant => participant.id === bet.participant_id)?.display_name ?? 'Tuntematon veikkaaja', submittedAt: participants.find(participant => participant.id === bet.participant_id)?.submitted_at ?? '' }
  }).sort((a, b) => b.points - a.points || b.correct - a.correct || a.submittedAt.localeCompare(b.submittedAt))
  const scoreIds = scores.map(item => item.bet.id).join(',')
  const [revealedCount, setRevealedCount] = useState(() => animate ? 0 : scores.length)

  useEffect(() => {
    setRevealedCount(animate ? 0 : scores.length)
  }, [animate, scoreIds])

  useEffect(() => {
    if (!animate || !scores.length || revealedCount >= scores.length) return
    const nextIndex = scores.length - revealedCount - 1
    const delay = nextIndex === 0 ? 1500 : revealedCount === 0 ? 700 : 280
    const timer = window.setTimeout(() => setRevealedCount(current => Math.min(scores.length, current + 1)), delay)
    return () => window.clearTimeout(timer)
  }, [animate, revealedCount, scoreIds, scores.length])

  const unknownHoles = actual.filter(hole => hole.category == null).length
  return <div className="w-full max-w-6xl">
    <div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Yksittäisen pelaajan tuloskortti</div>
    <h2 className="mt-5 text-7xl font-black">Lopputulos</h2>
    <div className="mt-8 flex items-baseline gap-5"><span className="text-[8rem] font-black leading-none" style={{ color: 'var(--league-primary)' }}>8p</span><span className="text-3xl text-white/55">maksimi · oikeat väylät / 18 × 8</span></div>
    {unknownHoles > 0 && <div className="mt-6 text-xl text-white/45">{unknownHoles} väylän tarkkaa lyöntiluokkaa ei voitu erotella, koska raakatulos puuttuu</div>}
    <div className="mt-10 max-w-5xl">
      {scores.length ? <div className="relative" style={{ height: `${scores.length * 4.75}rem` }}>
        {scores.map((item, index) => {
          const visible = index >= scores.length - revealedCount
          if (!visible) return null
          const newest = animate && index === scores.length - revealedCount
          return <div key={item.bet.id} className={`absolute inset-x-0 flex h-[4.75rem] items-center gap-6 border-b border-white/10 ${newest ? 'gala-composition-final-row-in' : ''}`} style={{ top: `${index * 4.75}rem` }}>
            <span className="w-12 shrink-0 text-3xl font-black text-white/40">#{index + 1}</span>
            <span className="flex-1 text-4xl font-bold">{item.name}</span>
            <span className="text-3xl text-white/55">{item.correct}/18</span>
            <span className="w-24 text-right text-4xl font-black" style={{ color: 'var(--league-primary)' }}>{item.points}p</span>
          </div>
        })}
      </div> : <div className="text-3xl text-white/55">Ei veikkauksia</div>}
    </div>
  </div>
}

function CompositionTopThreePanel({ items, denominator }: { items: ReturnType<typeof compositionParticipantScores>; denominator: 9 | 18 }) {
  const rowOffset = (index: number) => index < 3 ? index * 4.1 : 12.3 + (index - 3) * 2.35
  return <aside className="flex h-full min-h-[25rem] flex-col rounded-2xl border border-white/10 bg-white/[.03] p-5">
    <div className="shrink-0 text-sm font-bold uppercase tracking-[.18em] text-white/45">Kärkiveikkaajat</div>
    <div className="mt-1 shrink-0 text-xs font-semibold uppercase tracking-[.14em] text-white/35">Osumat / {denominator}</div>
    <div className="relative mt-5 min-h-0 flex-1 overflow-hidden">
      {items.length ? items.map((item, index) => <div key={item.bet.id} className={`gala-composition-ranking-row absolute inset-x-0 flex items-baseline gap-3 ${index < 3 ? 'text-lg' : 'text-sm opacity-60'}`} style={{ transform: `translateY(${rowOffset(index)}rem)` }}>
        <span className={`${index < 3 ? 'text-2xl' : 'text-base'} w-7 shrink-0 font-black ${index === 0 ? 'text-white' : 'text-white/40'}`}>{index + 1}.</span>
        <span className={`min-w-0 flex-1 truncate font-bold ${index < 3 ? 'text-white' : 'text-white/75'}`}>{item.name}</span>
        <span className={`${index < 3 ? 'text-2xl' : 'text-lg'} font-black`} style={{ color: 'var(--league-primary)' }}>{item.correct}</span>
      </div>) : <div className="text-lg text-white/45">Ensimmäinen väylä paljastuu pian</div>}
    </div>
  </aside>
}

function CompositionPresentationBeat({ state, question, event, target, score, bets, participants, honours, animate }: { state: CompositionPresentationState; question: EventQuestion; event: EventRow; target: EventPlayer | null; score: EventScore | null; bets: EventBet[]; participants: EventParticipant[]; honours: PlayerHonours; animate: boolean }) {
  const actual = useMemo(() => compositionActualHoles(score), [score])
  const isNine = state === 2 || state === 3
  const [revealedCount, setRevealedCount] = useState(() => animate && isNine ? 0 : 9)
  const [actualRevealedCount, setActualRevealedCount] = useState(() => animate && isNine ? 0 : 9)
  const [paused, setPaused] = useState(() => !animate || !isNine)
  const rowViewport = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setRevealedCount(animate && isNine ? 0 : 9)
    setActualRevealedCount(animate && isNine ? 0 : 9)
    setPaused(!animate || !isNine)
  }, [animate, isNine, state])

  useEffect(() => {
    if (!animate || !isNine || paused || revealedCount >= 9) return
    const revealingActual = actualRevealedCount < revealedCount
    const timer = window.setTimeout(() => {
      if (revealingActual) setActualRevealedCount(current => Math.min(revealedCount, current + 1))
      else setRevealedCount(current => Math.min(9, current + 1))
    }, revealingActual ? 650 : compositionNineDuration)
    return () => window.clearTimeout(timer)
  }, [actualRevealedCount, animate, isNine, paused, revealedCount])

  useEffect(() => {
    if (!isNine || !rowViewport.current) return
    const viewport = rowViewport.current
    const frame = window.requestAnimationFrame(() => viewport.scrollTo({ top: viewport.scrollHeight, behavior: animate ? 'smooth' : 'auto' }))
    return () => window.cancelAnimationFrame(frame)
  }, [animate, isNine, revealedCount])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const key = event.key.toLowerCase()
      if (key !== 'p' && key !== 'r') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!isNine) return
      if (key === 'p') setPaused(current => !current)
      if (key === 'r') {
        setRevealedCount(0)
        setActualRevealedCount(0)
        setPaused(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isNine])

  if (state === 1) return <div className="flex w-full max-w-6xl items-center justify-center gap-16">
    <CompositionTargetCard target={target} score={score} honours={honours} />
    <div className="max-w-4xl"><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">YKSITTÄISEN PELAAJAN TULOSKORTTI</div><h2 className="mt-6 text-8xl font-black leading-[.95]">Miten kierros rakentuu?</h2><div className="mt-8 text-3xl text-white/55">{event.course?.name ?? 'Kenttä'}{event.course?.par_total ? ` · Par ${event.course.par_total}` : ''}</div><div className="mt-3 text-2xl text-white/40">Väylä kerrallaan · 8 pistettä</div></div>
  </div>

  if (state === 4) return <CompositionFinalScore question={question} bets={bets} participants={participants} actual={actual} animate={animate} />

  const start = state === 3 ? 9 : 0
  const resolvedHoleNumbers = new Set(Array.from({ length: state === 3 ? 9 + actualRevealedCount : actualRevealedCount }, (_, index) => index + 1))
  const holes = actual.slice(start, start + revealedCount)
  const ranking = compositionParticipantScores(bets, question.id, participants, actual, resolvedHoleNumbers)
  const targetName = target?.player.full_name ?? 'Kohdepelaaja'
  const runningPoints = actual.filter(hole => resolvedHoleNumbers.has(hole.hole)).reduce((sum, hole) => sum + hole.points, 0)
  const missingCourseMetadata = actual.some(hole => hole.par == null || hole.strokeIndex == null)
  return <div className="flex h-full min-h-0 w-full max-w-[1500px] flex-col">
    <div className="shrink-0 rounded-2xl border border-white/10 bg-[var(--bg-card)]/80 px-6 py-4">
      <div className="flex items-end justify-between gap-8"><div><div className="text-2xl font-semibold uppercase tracking-[.2em] text-white/45">YKSITTÄISEN PELAAJAN TULOSKORTTI</div><h2 className="mt-2 text-5xl font-black">{targetName} · {state === 2 ? 'etuyhdeksikkö' : 'takayhdeksikkö'}</h2></div><div className="flex items-baseline gap-4 text-right"><span className="text-sm font-bold uppercase tracking-[.18em] text-white/45">Pisteet tähän asti</span><span className="font-display text-5xl font-black" style={{ color: 'var(--league-primary)' }}>{runningPoints}p</span></div></div>
      <div className="mt-2 flex justify-between text-sm text-white/45"><span>{paused ? 'P tauko' : `Väylä ${Math.min(9, revealedCount)} / 9`}</span><span>P = tauko · R = aloita ysi alusta</span></div>
      <CompositionCategoryLegend />
    </div>
    {missingCourseMetadata && <div className="mt-3 shrink-0 text-sm text-amber-300/80">Kurssin par- tai SI-tieto puuttuu osasta väyliä — varmista scorecardin väylätiedot ennen esitystä.</div>}
    <div className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_17rem] gap-6">
      <div ref={rowViewport} className="no-scrollbar min-h-0 overflow-y-auto pr-2"><div className="space-y-3">{holes.map((hole, index) => <CompositionHoleRow key={hole.hole} question={question} hole={hole} bets={bets} participants={participants} age={revealedCount - index - 1} actualRevealed={index < actualRevealedCount} animate={animate} />)}</div></div>
      <CompositionTopThreePanel items={ranking} denominator={state === 2 ? 9 : 18} />
    </div>
  </div>
}

function RevealPlace({ rank, place, honours }: { rank: EventScore[]; place: number; honours: Map<string, PlayerHonours> }) {
  const score = rank[place - 1]
  if (!score) return <div className="text-6xl font-black text-white/55">Ei tarpeeksi kirjattuja kortteja</div>
  return <div className="flex items-end gap-8">
    <div className="text-[11rem] font-black leading-none" style={{ color: 'var(--league-primary)' }}>#{place}</div>
    <div className="pb-3">
      <div className="flex items-center gap-3 text-7xl font-black">{score.player?.full_name ?? score.player_id}<LiekkipoikaMark honours={honours.get(score.player_id) ?? emptyHonours()} className="text-5xl" /></div>
      <div className="mt-3 text-3xl text-white/60">{stableford(score)} pistettä{rawStrokes(score) != null ? ` · ${rawStrokes(score)} lyöntiä` : ''}</div>
    </div>
  </div>
}

function unresolvedReveal(reason: string | undefined) {
  return <div><div className="text-7xl font-black text-white">Ei ratkennut</div>{reason && <div className="mt-5 text-2xl text-white/55">{reason}</div>}</div>
}

function EventPlayerRoster({ players, honours, animate, showLiekkipoikaFlash }: { players: EventPlayer[]; honours: Map<string, PlayerHonours>; animate: boolean; showLiekkipoikaFlash: boolean }) {
  const ordered = useMemo(() => [...players].sort((a, b) => {
    const aHonours = honours.get(a.player_id) ?? emptyHonours()
    const bHonours = honours.get(b.player_id) ?? emptyHonours()
    const aHasWin = aHonours.scratch > 0 || aHonours.liekkipoika > 0
    const bHasWin = bHonours.scratch > 0 || bHonours.liekkipoika > 0
    return Number(bHasWin) - Number(aHasWin) || (bHonours.liekkipoika + bHonours.scratch) - (aHonours.liekkipoika + aHonours.scratch) || a.display_order - b.display_order
  }), [players, honours])
  const orderedIds = ordered.map(player => player.player_id).join(',')
  const [landedCount, setLandedCount] = useState(animate ? 0 : ordered.length)
  const [flightStyle, setFlightStyle] = useState<React.CSSProperties | null>(null)
  const slotRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const shortFlightDuration = 1150
  const liekkipoikaFlightDuration = 2050
  const lineupDelay = (index: number) => {
    let delay = 0
    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previousHonours = honours.get(ordered[previousIndex].player_id) ?? emptyHonours()
      delay += previousHonours.liekkipoika > 0 ? liekkipoikaFlightDuration : shortFlightDuration
    }
    return delay
  }

  useEffect(() => {
    setLandedCount(animate ? 0 : ordered.length)
    setFlightStyle(null)
  }, [animate, ordered.length, orderedIds])

  const activeIndex = animate && landedCount < ordered.length ? landedCount : null
  useLayoutEffect(() => {
    if (activeIndex == null) {
      setFlightStyle(null)
      return
    }
    const slot = slotRefs.current[activeIndex]
    if (!slot) return
    const target = slot.getBoundingClientRect()
    const flightWidth = Math.min(window.innerWidth * 0.68, 760)
    const targetScale = Math.min(1, target.width / flightWidth)
    const playerHonours = honours.get(ordered[activeIndex].player_id) ?? emptyHonours()
    const duration = playerHonours.liekkipoika > 0 ? liekkipoikaFlightDuration : shortFlightDuration
    setFlightStyle({
      '--lineup-target-x': `${target.left + target.width / 2 - window.innerWidth / 2}px`,
      '--lineup-target-y': `${target.top + target.height / 2 - window.innerHeight / 2}px`,
      '--lineup-target-scale': `${targetScale}`,
      '--lineup-flight-width': `${flightWidth}px`,
      '--lineup-flight-duration': `${duration}ms`,
    } as React.CSSProperties)
  }, [activeIndex, honours, ordered, shortFlightDuration, liekkipoikaFlightDuration])

  const rows = Array.from({ length: Math.ceil(ordered.length / 4) }, (_, rowIndex) => ordered.slice(rowIndex * 4, rowIndex * 4 + 4))
  const liekkipoikaFlashCards = ordered
    .map((eventPlayer, index) => ({ eventPlayer, index, honours: honours.get(eventPlayer.player_id) ?? emptyHonours() }))
    .filter(item => item.honours.liekkipoika > 0)
  function finishFlight(event: React.AnimationEvent<HTMLDivElement>) {
    if (event.animationName !== 'gala-lineup-flight-short' && event.animationName !== 'gala-lineup-flight-long') return
    if (activeIndex == null) return
    setLandedCount(current => Math.max(current, activeIndex + 1))
  }
  return <div className="relative mx-auto w-full max-w-[1480px]">
    {showLiekkipoikaFlash && liekkipoikaFlashCards.map(({ eventPlayer, index }) => <div key={`liekkipoika-flash-${eventPlayer.player_id}`} className="gala-liekkipoika-room-flash pointer-events-none fixed inset-0 z-40" style={{ animationDelay: `${lineupDelay(index) + 650}ms` }} aria-hidden="true"><div className="gala-liekkipoika-firefield">🔥　🔥　🔥　🔥　🔥<br />　🔥　🔥　🔥　🔥　🔥<br />🔥　🔥　🔥　🔥　🔥</div><div className="gala-liekkipoika-hype-label">🔥 LIEKKIPOIKA 🔥</div></div>)}
    <div className="text-3xl font-semibold uppercase tracking-[.18em] text-white/45">{players.length} PELAAJAA</div>
    <h2 className="mt-5 text-7xl font-black">Päivän lineup</h2>
    <div className="mt-10 space-y-5">
      {rows.map((row, rowIndex) => <div key={rowIndex} className="flex justify-center gap-5">
        {row.map((eventPlayer, index) => {
          const globalIndex = rowIndex * 4 + index
          const playerHonours = honours.get(eventPlayer.player_id) ?? emptyHonours()
          const isLanded = globalIndex < landedCount
          return <div key={eventPlayer.player_id} ref={element => { slotRefs.current[globalIndex] = element }} className="gala-lineup-slot min-w-0" style={{ width: 'calc((100% - 60px) / 4)' }}>
            {isLanded && <PresentationPlayerCard player={eventPlayer.player} honours={playerHonours} compact={false} animate={false} delay={0} />}
          </div>
        })}
      </div>)}
    </div>
    {activeIndex != null && flightStyle && <div className="pointer-events-none fixed inset-0 z-50" aria-hidden="true">
      <div
        key={activeIndex}
        className={`gala-lineup-flight ${((honours.get(ordered[activeIndex].player_id) ?? emptyHonours()).liekkipoika > 0) ? 'gala-lineup-flight-long' : 'gala-lineup-flight-short'}`}
        style={flightStyle}
        onAnimationEnd={finishFlight}
      >
        <PresentationPlayerCard
          player={ordered[activeIndex].player}
          honours={honours.get(ordered[activeIndex].player_id) ?? emptyHonours()}
          compact={false}
          animate={false}
          delay={0}
          showHonoursOverlay
          honoursOverlayDuration={((honours.get(ordered[activeIndex].player_id) ?? emptyHonours()).liekkipoika > 0) ? liekkipoikaFlightDuration : shortFlightDuration}
        />
      </div>
    </div>}
  </div>
}

function HiddenLeaderCard({ animate, delay }: { animate: boolean; delay: number }) {
  return <article className={`overflow-hidden rounded-2xl border border-white/15 bg-[var(--bg-card)] shadow-xl ${animate ? 'gala-roster-card-animate' : ''}`} style={{ animationDelay: `${delay}ms` }}>
    <div className="relative flex h-36 items-center justify-center overflow-hidden bg-[#24153f] xl:h-44">
      <div className="absolute inset-0 flex flex-col justify-between p-4 text-sm font-black uppercase tracking-[.2em] text-white/55"><span>JOKERI</span><span className="self-end rotate-180">JOKERI</span></div>
      <div className="absolute text-[8rem] font-black leading-none text-[var(--league-primary)]/90 xl:text-[10rem]">?</div>
      <LeagueLogo className="relative h-20 w-20 object-contain opacity-20 xl:h-24 xl:w-24" />
    </div>
    <div className="px-4 py-3 xl:px-5 xl:py-4">
      <div className="font-display text-2xl font-black text-white xl:text-3xl">Tulos tulee kohta</div>
      <div className="mt-2 text-sm font-semibold uppercase tracking-wider text-white/55">Voittaja paljastuu myöhemmin</div>
    </div>
  </article>
}

export default function AdminEventPresentation() {
  const { id } = useParams<{ id: string }>()
  const league = useLeague()
  const [data, setData] = useState<LoadedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [beatIndex, setBeatIndex] = useState(0)
  const [needsFullscreenStart, setNeedsFullscreenStart] = useState(false)
  const [animatedBeatId, setAnimatedBeatId] = useState<string | null>(null)
  const [openingQuestionRevealed, setOpeningQuestionRevealed] = useState(false)
  const [openingQuestionAnimate, setOpeningQuestionAnimate] = useState(false)
  const [lineupFlashKey, setLineupFlashKey] = useState(0)
  const seenBeatIds = useRef(new Set<string>())
  const openingQuestionSeen = useRef(false)

  useEffect(() => {
    const presentationUrl = window.location.href
    const presentationState = { ...(window.history.state ?? {}), galaPresentationGuard: true }
    let restoring = false
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = PRESENTATION_EXIT_WARNING
    }
    const handlePopState = () => {
      if (restoring) {
        restoring = false
        return
      }
      if (window.confirm(PRESENTATION_EXIT_WARNING)) {
        window.removeEventListener('beforeunload', handleBeforeUnload)
        window.removeEventListener('popstate', handlePopState)
        return
      }
      restoring = true
      window.history.pushState(presentationState, '', presentationUrl)
      window.dispatchEvent(new PopStateEvent('popstate', { state: presentationState }))
    }

    window.history.replaceState(presentationState, '', presentationUrl)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  useEffect(() => {
    if (!id) return
    Promise.all([
      getLeagueEvent(id),
      getEventPlayers(id),
      getEventQuestions(id),
      getEventParticipants(id),
      getEventScores(id),
      getEventBets(id),
      getInvitationalResults().catch(() => [] as InvitationalResult[]),
    ])
      .then(([event, players, questions, participants, scores, bets, honours]) => setData({ event, players, questions, participants, scores, bets, honours }))
      .catch(queryError => setError(queryError instanceof Error ? queryError.message : 'Esityksen tietoja ei voitu ladata'))
      .finally(() => setLoading(false))
  }, [id])

  const resolverPlayers = useMemo<ResolverPlayer[]>(() => data?.players.map(item => ({ id: item.player_id, full_name: item.player.full_name })) ?? [], [data?.players])
  const beats = useMemo<Beat[]>(() => {
    if (!data) return []
    const { event, players, questions, participants, scores, bets, honours: historicalResults } = data
    const list: Beat[] = []
    const playerHonours = honoursForPlayers(players, historicalResults)
    const resolutionFor = (question: EventQuestion) => resolveQuestion(question, scores, resolverPlayers)
    const hasScratch = questions.some(question => questionKey(question) === 'player_pick_best_scratch')
    const hasPodium = questions.some(question => questionKey(question) === 'podium_top3')
    const nextAfterSafe = hasScratch ? 'Scratch-veikkaus' : hasPodium ? 'Liekkipaita-veikkaus' : 'Lopputulokset'

    list.push({
      id: 'opening-title',
      next: 'Pelaajat',
      content: <div className="flex items-center gap-16">
        <LeagueLogo className="h-40 w-40 object-contain" />
        <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Gala-esitys</div><h1 className="mt-4 max-w-6xl text-8xl font-black leading-[.92]">{event.name}</h1><div className="mt-7 text-3xl capitalize text-white/60">{formatDate(event.event_date)}</div></div>
      </div>,
    })

    list.push({
      id: 'opening-players',
      next: 'Kysymys yleisölle',
      content: <EventPlayerRoster players={players} honours={playerHonours} animate={animatedBeatId === 'opening-players'} showLiekkipoikaFlash={animatedBeatId === 'opening-players' || lineupFlashKey > 0} />,
    })

    const openingData = openingStrokeData(scores)
    const openingLeaders = openingStrokeLeaders(scores, players)
    const incompleteDisclaimer = openingData.missingHoles > 0 ? `${openingData.missingHoles} väylää ilman lyöntimäärää` : null
    list.push({
      id: 'opening-question',
      next: openingQuestionRevealed ? 'Lyöntityyppien jakauma' : 'Vastaus: lyöntimäärä',
      content: <div className="mx-auto flex min-h-[31rem] w-full max-w-6xl flex-col items-center text-center">
        <div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Kysymys yleisölle</div>
        <h2 className="mt-8 text-8xl font-black leading-[.95]">Montako lyöntiä {players.length} pelaajaa löi yhteensä?</h2>
        {incompleteDisclaimer && <div className="mt-8 text-xl text-white/40">{incompleteDisclaimer}</div>}
        <div className="mt-8 flex h-[15rem] flex-col items-center justify-start">
          {openingQuestionRevealed && <div className="text-center">
            <div className="text-[10rem] font-black leading-none" style={{ color: 'var(--league-primary)' }}><AnimatedCount target={openingData.total} animate={openingQuestionAnimate} delay={0} duration={1000} /></div>
            <div className={`mt-5 text-4xl text-white/65 ${openingQuestionAnimate ? 'gala-opening-answer-label-animate' : ''}`}>lyöntiä kirjatuista väylistä</div>
          </div>}
        </div>
      </div>,
    })
    const openingDistributionContent = (beatId: string, revealedLeaderCount: number, animateBars: boolean) => <div className="w-full"><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">KIERROKSEN JAKAUMA</div><h2 className="mt-6 text-6xl font-black">Mitä kortteihin kertyi?</h2><div className="mt-28"><StrokeDistribution counts={openingData.counts} leaders={openingLeaders} revealedLeaderCount={revealedLeaderCount} animateBars={animateBars} animateLeaders={animatedBeatId === beatId} honours={playerHonours} /></div></div>
    list.push({
      id: 'opening-distribution',
      next: 'Jakauman voittajat',
      content: openingDistributionContent('opening-distribution', 0, animatedBeatId === 'opening-distribution'),
    })

    list.push({
      id: 'opening-distribution-leaders',
      next: questions.some(question => !HELD_KEYS.has(questionKey(question))) ? 'Ensimmäinen turvallinen veikkaus' : nextAfterSafe,
      content: openingDistributionContent('opening-distribution-leaders', strokeCategoryOrder.length, false),
    })

    const safeQuestions = questions.filter(question => !HELD_KEYS.has(questionKey(question)))
    safeQuestions.forEach((question, index) => {
      const resolution = resolutionFor(question)
      const isYesNo = ['yes_no_four_birdies', 'yes_no_birdie', 'yes_no_zero', 'yes_no_head_to_head'].includes(questionKey(question))
      const next = index + 1 < safeQuestions.length ? `Seuraava kysymys: ${questionTitle(safeQuestions[index + 1])}` : nextAfterSafe
      if (isYesNo) {
        const base = `safe-${question.id}`
        list.push({ id: `${base}-question`, next: `Veikkausjakauma: ${questionTitle(question)}`, content: <AccumulatingYesNoBeat question={question} questionNumber={index + 1} questionTotal={safeQuestions.length} state={1} bets={bets} resolution={resolution} participants={participants} players={resolverPlayers} animateDistribution={false} /> })
        list.push({ id: `${base}-bets`, next: `Ratkaisu: ${questionTitle(question)}`, content: <AccumulatingYesNoBeat question={question} questionNumber={index + 1} questionTotal={safeQuestions.length} state={2} bets={bets} resolution={resolution} participants={participants} players={resolverPlayers} animateDistribution={animatedBeatId === `${base}-bets`} /> })
        list.push({ id: `${base}-ruling`, next, content: <AccumulatingYesNoBeat question={question} questionNumber={index + 1} questionTotal={safeQuestions.length} state={3} bets={bets} resolution={resolution} participants={participants} players={resolverPlayers} animateDistribution={false} /> })
      } else if (questionKey(question) === 'composition_player_line') {
        const base = `safe-${question.id}`
        const targetId = String(question.parameters.player_id ?? question.parameters.target_player_id ?? '')
        const target = players.find(item => item.player_id === targetId) ?? null
        const score = scores.find(item => item.player_id === targetId) ?? null
        const honours = target ? playerHonours.get(target.player_id) ?? emptyHonours() : emptyHonours()
        list.push({ id: `${base}-question`, next: 'Tuloskortin etuyhdeksikkö', content: <CompositionPresentationBeat state={1} question={question} event={event} target={target} score={score} bets={bets} participants={participants} honours={honours} animate={animatedBeatId === `${base}-question`} /> })
        list.push({ id: `${base}-front`, next: 'Tuloskortin takayhdeksikkö', content: <CompositionPresentationBeat state={2} question={question} event={event} target={target} score={score} bets={bets} participants={participants} honours={honours} animate={animatedBeatId === `${base}-front`} /> })
        list.push({ id: `${base}-back`, next: 'Tuloskortin lopputulos', content: <CompositionPresentationBeat state={3} question={question} event={event} target={target} score={score} bets={bets} participants={participants} honours={honours} animate={animatedBeatId === `${base}-back`} /> })
        list.push({ id: `${base}-final`, next, content: <CompositionPresentationBeat state={4} question={question} event={event} target={target} score={score} bets={bets} participants={participants} honours={honours} animate={animatedBeatId === `${base}-final`} /> })
      } else {
        list.push({ id: `safe-${question.id}-question`, next: `Veikkausjakauma: ${questionTitle(question)}`, content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Veikkaus</div><h2 className="mt-7 max-w-6xl text-8xl font-black leading-[.95]">{questionTitle(question)}</h2><div className="mt-8 text-3xl text-white/45">Kysymys {index + 1} / {safeQuestions.length}</div></div> })
        list.push({ id: `safe-${question.id}-bets`, next: `Ratkaisu: ${questionTitle(question)}`, content: <div className="w-full"><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Miten veikattiin</div><h2 className="mt-5 max-w-6xl text-5xl font-black">{questionTitle(question)}</h2><div className="mt-10 w-full"><BetDistribution question={question} bets={bets} players={resolverPlayers} participants={participants} eventPlayers={players} honours={playerHonours} animate={animatedBeatId === `safe-${question.id}-bets`} /></div></div> })
        list.push({ id: `safe-${question.id}-ruling`, next, content: <div><div className="mt-10"><Ruling question={question} resolution={resolution} bets={bets} participants={participants} players={resolverPlayers} /></div></div> })
      }
    })

    const scratchQuestion = questions.find(question => questionKey(question) === 'player_pick_best_scratch')
    if (scratchQuestion) {
      const resolution = resolutionFor(scratchQuestion)
      const ranked = rankScoresForQuestion(scratchQuestion, scores, resolverPlayers)
      list.push({ id: 'scratch-question', next: 'Scratchin veikkausjakauma', content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Scratch</div><h2 className="mt-7 text-8xl font-black">Kuka voittaa scratchin?</h2></div> })
      list.push({ id: 'scratch-bets', next: 'Scratch #3', content: <div className="w-full"><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Miten veikattiin</div><div className="mt-10 w-full"><BetDistribution question={scratchQuestion} bets={bets} players={resolverPlayers} participants={participants} eventPlayers={players} honours={playerHonours} animate={animatedBeatId === 'scratch-bets'} /></div></div> })
      for (const place of [3, 2, 1]) {
        list.push({ id: `scratch-${place}`, next: place > 1 ? `Scratch #${place - 1}` : 'Ketkä osuivat scratch-voittajaan?', content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Scratch · {place}. sija</div><div className="mt-14">{resolution.status === 'unresolved' ? unresolvedReveal(resolution.reason) : <RevealPlace rank={ranked} place={place} honours={playerHonours} />}</div>{place === 1 && resolution.status === 'resolved' && <div className="mt-9 border-t border-white/15 pt-6 text-3xl text-white/65">Veikkauksen oikea vastaus: {answerText(scratchQuestion, resolution.answer, resolverPlayers)}</div>}</div> })
      }
      const winners = resolution.status === 'resolved' ? bets.filter(bet => bet.question_id === scratchQuestion.id && scoreAnswer(scratchQuestion, bet.answer, resolution) > 0) : []
      list.push({ id: 'scratch-correct', next: hasPodium ? 'Liekkipaita-veikkaus' : 'Lopputulokset', content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Scratch-veikkaus</div>{resolution.status === 'unresolved' ? <div className="mt-12">{unresolvedReveal(resolution.reason)}</div> : <><div className="mt-8 text-7xl font-black" style={{ color: 'var(--league-primary)' }}>{winners.length} oikein</div><div className="mt-6 max-w-5xl text-4xl text-white/65">{winners.length ? winners.map(bet => participantLabel(bet.participant_id, participants)).join(' · ') : 'Kukaan ei saanut pistettä'}</div></>}</div> })
    }

    const podiumQuestion = questions.find(question => questionKey(question) === 'podium_top3')
    if (podiumQuestion) {
      const resolution = resolutionFor(podiumQuestion)
      const ranked = rankScoresForQuestion(podiumQuestion, scores, resolverPlayers)
      const totalQuestion = questions.find(question => questionKey(question) === 'player_pick_best_total')
      const totalResolution = totalQuestion ? resolutionFor(totalQuestion) : null
      const totalWinners = totalQuestion && totalResolution ? bets.filter(bet => bet.question_id === totalQuestion.id && scoreAnswer(totalQuestion, bet.answer, totalResolution) > 0) : []
      list.push({ id: 'podium-question', next: 'Liekkipaita-veikkaukset', content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Liekkipaita</div><h2 className="mt-7 text-8xl font-black">Ketkä ovat kolme parasta?</h2></div> })
      list.push({ id: 'podium-bets', next: 'Podiumin #3', content: <div className="w-full"><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Miten veikattiin</div><div className="mt-10 w-full"><BetDistribution question={podiumQuestion} bets={bets} players={resolverPlayers} participants={participants} eventPlayers={players} honours={playerHonours} animate={animatedBeatId === 'podium-bets'} /></div></div> })
      for (const place of [3, 2]) {
        list.push({ id: `podium-${place}`, next: place === 3 ? 'Podiumin #2' : 'Podiumin #1 · Liekkipaita', content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Podium · {place}. sija</div><div className="mt-14">{resolution.status === 'unresolved' ? unresolvedReveal(resolution.reason) : <RevealPlace rank={ranked} place={place} honours={playerHonours} />}</div></div> })
      }
      list.push({ id: 'podium-first', next: 'Podiumin pistejako', content: <div><div className="text-3xl font-semibold uppercase tracking-[.18em] text-white/45">Liekkipaita · 1. sija</div><div className="mt-14">{resolution.status === 'unresolved' ? unresolvedReveal(resolution.reason) : <RevealPlace rank={ranked} place={1} honours={playerHonours} />}</div>{totalQuestion && <div className="mt-9 border-t border-white/15 pt-6 text-3xl text-white/65">{totalResolution?.status === 'resolved' ? <><div>Paras kokonaispistemäärä: {answerText(totalQuestion, totalResolution.answer, resolverPlayers)}</div><div className="mt-3">{totalWinners.length ? `${totalWinners.length} oikein · ${totalWinners.map(bet => participantLabel(bet.participant_id, participants)).join(', ')}` : 'Kukaan ei saanut pisteitä'}</div></> : <div>Paras kokonaispistemäärä: Ei ratkennut</div>}</div>}</div> })
      const podiumScores = bets.filter(bet => bet.question_id === podiumQuestion.id).map(bet => ({ name: participantLabel(bet.participant_id, participants), points: scoreAnswer(podiumQuestion, bet.answer, resolution) })).sort((a, b) => b.points - a.points)
      list.push({ id: 'podium-scoring', next: 'Lopputulokset', content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Podium-veikkauksen pisteet</div>{resolution.status === 'unresolved' ? <div className="mt-12">{unresolvedReveal(resolution.reason)}</div> : <><div className="mt-10 flex flex-wrap gap-x-8 gap-y-4 text-4xl font-bold">{podiumScores.length ? podiumScores.map(item => <span key={item.name}>{item.name} {item.points}p</span>) : <span>Ei veikkauksia</span>}</div><div className="mt-12 text-3xl text-white/55">{podiumScores.some(item => item.points === 8) ? 'Täydellinen podium osui' : 'Kukaan ei saanut täyttä 8 pistettä'}</div></>}</div> })
    }

    const leaderboard = participants.map(participant => ({ name: participant.display_name, points: bets.filter(bet => bet.participant_id === participant.id).reduce((sum, bet) => {
      const question = questions.find(item => item.id === bet.question_id)
      return question ? sum + scoreAnswer(question, bet.answer, resolutionFor(question)) : sum
    }, 0), submittedAt: participant.submitted_at })).sort((a, b) => b.points - a.points || a.submittedAt.localeCompare(b.submittedAt))
    list.push({ id: 'leaderboard', next: 'Lopetus', content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Lopullinen veikkauslista</div><div className="mt-8 grid max-w-5xl grid-cols-1 gap-3">{leaderboard.length ? leaderboard.map((item, index) => <div key={`${item.name}-${index}`} className="flex items-baseline gap-8 border-b border-white/10 py-2"><span className="w-16 text-4xl font-black" style={{ color: index === 0 ? 'var(--league-primary)' : 'rgba(255,255,255,.45)' }}>#{index + 1}</span><span className="flex-1 text-5xl font-bold">{item.name}</span><span className="text-5xl font-black" style={{ color: 'var(--league-primary)' }}>{item.points}p</span></div>) : <div className="text-4xl text-white/55">Ei veikkauksia</div>}</div></div> })
    list.push({ id: 'closing', next: 'Esityksen loppu', content: <div className="flex h-full w-full flex-col items-center justify-center"><LeagueLogo className="object-contain" style={{ width: 'min(68vw, 68vh)', height: 'min(68vw, 68vh)' }} /><div className="mt-8 text-2xl font-semibold uppercase tracking-[.3em] text-white/35">Kiitos</div></div> })
    return list
  }, [data, resolverPlayers, animatedBeatId, lineupFlashKey, openingQuestionRevealed, openingQuestionAnimate])

  const currentBeatId = beats[beatIndex]?.id ?? null
  function navigateToBeat(nextIndex: number) {
    const boundedIndex = Math.min(Math.max(0, nextIndex), Math.max(0, beats.length - 1))
    const nextBeatId = beats[boundedIndex]?.id ?? null
    if (nextBeatId === 'opening-players') setLineupFlashKey(key => key + 1)
    setAnimatedBeatId(nextBeatId && !seenBeatIds.current.has(nextBeatId) ? nextBeatId : null)
    setBeatIndex(boundedIndex)
  }

  useEffect(() => {
    if (!currentBeatId) return
    if (seenBeatIds.current.has(currentBeatId)) {
      setAnimatedBeatId(null)
      return
    }
    seenBeatIds.current.add(currentBeatId)
    setAnimatedBeatId(currentBeatId)
  }, [currentBeatId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault()
        if (currentBeatId === 'opening-question' && !openingQuestionRevealed) {
          setOpeningQuestionRevealed(true)
          setOpeningQuestionAnimate(!openingQuestionSeen.current)
          openingQuestionSeen.current = true
          return
        }
        if (currentBeatId === 'opening-question') setOpeningQuestionAnimate(false)
        navigateToBeat(beatIndex + 1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (currentBeatId === 'opening-question' && openingQuestionRevealed) {
          setOpeningQuestionRevealed(false)
          setOpeningQuestionAnimate(false)
          return
        }
        navigateToBeat(beatIndex - 1)
      } else if (event.key === 'Escape' && document.fullscreenElement) {
        event.preventDefault()
        void document.exitFullscreen()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [beatIndex, beats.length, currentBeatId, openingQuestionRevealed])

  useEffect(() => {
    const enter = async () => {
      try {
        await document.documentElement.requestFullscreen()
      } catch {
        setNeedsFullscreenStart(true)
      }
    }
    void enter()
    const changed = () => setNeedsFullscreenStart(!document.fullscreenElement)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  async function startFullscreen() {
    try {
      await document.documentElement.requestFullscreen()
      setNeedsFullscreenStart(false)
    } catch {
      setNeedsFullscreenStart(false)
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[var(--bg-dark)] text-2xl text-white/55">Ladataan esitystä…</div>
  if (error || !data) return <div className="flex min-h-screen items-center justify-center bg-[var(--bg-dark)] px-8 text-center text-3xl text-white/70">{error ?? 'Esitystä ei löytynyt'}</div>
  if (!beats.length) return <div className="flex min-h-screen items-center justify-center bg-[var(--bg-dark)] text-3xl text-white/70">Ei esitettävää sisältöä</div>

  const beat = beats[Math.min(beatIndex, beats.length - 1)]
  return <main className="fixed inset-0 overflow-hidden bg-[var(--bg-dark)] text-white" style={{ fontFamily: 'var(--font-body)' }}>
    <div className="absolute inset-0 opacity-[.035]" style={{ backgroundImage: 'var(--league-logo)', backgroundSize: '300px 300px' }} />
    <div className="relative flex h-full flex-col px-12 py-10 xl:px-20 xl:py-14">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-5"><LeagueLogo className="h-12 w-12 object-contain" /><span className="text-xl font-semibold uppercase tracking-[.2em] text-white/45">{league.name}</span></div>
        <div className="text-lg text-white/35">{beatIndex + 1} / {beats.length}</div>
      </header>
      <section key={beat.id} className="flex min-h-0 flex-1 items-center py-8">{beat.content}</section>
      <footer className="flex items-end justify-between text-sm text-white/30">
        <span>← takaisin · → / välilyönti eteen</span>
        <span>Seuraavaksi: {beat.next}</span>
      </footer>
    </div>
    {needsFullscreenStart && <button type="button" onClick={startFullscreen} className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-white/20 bg-black/75 px-5 py-3 text-sm text-white/70 shadow-xl backdrop-blur">Aloita koko näytön esitys</button>}
  </main>
}
