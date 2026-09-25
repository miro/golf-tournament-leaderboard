import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
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

function openingStrokeData(scores: readonly EventScore[]): { total: number; missingHoles: number; holesWithStrokes: number; counts: StrokeDistributionCounts } {
  const counts: StrokeDistributionCounts = { birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, worse: 0 }
  let total = 0
  let missingHoles = 0
  let holesWithStrokes = 0
  for (const score of scores) {
    const holes = new Map((score.holes ?? []).map(hole => [hole.hole, hole]))
    for (let holeNumber = 1; holeNumber <= 18; holeNumber += 1) {
      const hole = holes.get(holeNumber)
      if (hole?.strokes_played == null) {
        missingHoles += 1
        continue
      }
      total += hole.strokes_played
      holesWithStrokes += 1
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
  return { total, missingHoles, holesWithStrokes, counts }
}

function AnimatedStatNumber({ target, animate, delay, integer = false }: { target: number | null; animate: boolean; delay: number; integer?: boolean }) {
  const [value, setValue] = useState(animate && target != null ? 0 : target)

  useEffect(() => {
    if (!animate || target == null) {
      setValue(target)
      return
    }
    setValue(0)
    let frame = 0
    const startedAt = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt - delay) / 900))
      setValue(target * progress)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [animate, delay, target])

  if (value == null) return <>—</>
  return <>{new Intl.NumberFormat('fi-FI', { maximumFractionDigits: integer ? 0 : 1 }).format(value)}</>
}

function OpeningStrokeStats({ data, playerCount, animate }: { data: ReturnType<typeof openingStrokeData>; playerCount: number; animate: boolean }) {
  const stats = [
    { label: 'Keskiarvo per pelaaja', value: playerCount > 0 ? data.total / playerCount : null, integer: false },
    { label: 'Keskiarvo per väylä', value: data.holesWithStrokes > 0 ? data.total / data.holesWithStrokes : null, integer: false },
    ...(data.missingHoles > 0 ? [{ label: 'Väyliä ilman tulosta', value: data.missingHoles, integer: true }] : []),
  ]
  return <div className={`mt-7 flex flex-wrap justify-center gap-x-12 gap-y-3 text-center ${animate ? 'gala-opening-stats-animate' : ''}`} style={animate ? { animationDelay: '1050ms' } : undefined}>
    {stats.map(stat => <div key={stat.label} className="min-w-[14rem]"><div className="font-display text-5xl font-black leading-none text-white/75 xl:text-6xl"><AnimatedStatNumber target={stat.value} animate={animate} delay={1050} integer={stat.integer} /></div><div className="mt-3 text-sm font-bold uppercase tracking-[.14em] text-white/45 xl:text-base">{stat.label}</div></div>)}
  </div>
}

type CombinedScorecardHole = { hole: number; par: number | null; bestStrokes: number | null }

function combinedScorecardHoles(scores: readonly EventScore[]): CombinedScorecardHole[] {
  return Array.from({ length: 18 }, (_, index) => {
    const holeNumber = index + 1
    const results = scores.flatMap(score => (score.holes ?? []).filter(hole => hole.hole === holeNumber))
    const par = results.find(hole => hole.par != null)?.par ?? null
    const rawScores = results.map(hole => hole.strokes_played).filter((strokes): strokes is number => strokes != null)
    return { hole: holeNumber, par, bestStrokes: rawScores.length ? Math.min(...rawScores) : null }
  })
}

function combinedScoreCategory(hole: CombinedScorecardHole): HoleCategory | null {
  if (hole.bestStrokes == null || hole.par == null) return null
  const difference = hole.bestStrokes - hole.par
  if (difference <= -1) return 'birdie'
  if (difference === 0) return 'par'
  if (difference === 1) return 'bogey'
  if (difference === 2) return 'double'
  if (difference === 3) return 'triple'
  return 'worse'
}

function CombinedScoreSymbol({ category }: { category: HoleCategory | null }) {
  if (!category || category === 'par') return null
  const color = CATEGORY_META[category].cellColor
  const squares = category === 'triple' ? [24, 17, 10] : category === 'double' ? [24, 16] : [22]
  return <svg className="absolute inset-0 m-auto h-[82%] w-[82%]" viewBox="0 0 28 28" aria-hidden="true">
    {category === 'birdie'
      ? <circle cx="14" cy="14" r="12" fill="none" stroke={color} strokeWidth="2.5" />
      : category === 'worse'
        ? <rect x="4" y="4" width="20" height="20" fill="#111111" />
        : squares.map(size => <rect key={size} x={(28 - size) / 2} y={(28 - size) / 2} width={size} height={size} fill="none" stroke={color} strokeWidth="1.7" />)}
  </svg>
}

function CombinedScorecardGrid({ holes, revealedCount, animate }: { holes: CombinedScorecardHole[]; revealedCount: number; animate: boolean }) {
  const nines = [{ label: 'OUT', holes: holes.slice(0, 9) }, { label: 'IN', holes: holes.slice(9, 18) }]
  return <div className="rounded-2xl border border-white/15 bg-[var(--bg-card)]/80 p-4 shadow-xl xl:p-5">
    {nines.map(nine => {
      const nineTotal = nine.holes.filter(hole => hole.hole <= revealedCount && hole.bestStrokes != null).reduce((sum, hole) => sum + hole.bestStrokes!, 0)
      const nineHasResult = nine.holes.some(hole => hole.hole <= revealedCount && hole.bestStrokes != null)
      return <div key={nine.label} className="grid grid-cols-[4.5rem_repeat(9,minmax(0,1fr))_5rem] items-stretch border-b border-white/10 last:border-b-0">
        <div className="flex items-center text-sm font-black uppercase tracking-[.16em] text-white/45">{nine.label}</div>
        {nine.holes.map(hole => {
            const revealed = hole.hole <= revealedCount
            const category = combinedScoreCategory(hole)
            return <div key={hole.hole} className={`relative flex min-h-[7.2rem] flex-col items-center justify-center border-l border-white/10 ${revealed && animate ? 'gala-combined-hole-in' : ''}`}>
            {(!revealed || hole.bestStrokes != null) && <>
              <div className="text-xl font-black text-white/75">{hole.hole}</div>
              <div className="mt-1 text-sm font-bold text-white/45">Par {hole.par ?? '—'}</div>
              <div className={`relative mt-2 flex h-14 w-14 items-center justify-center rounded-full ${revealed ? 'text-4xl font-black text-white' : 'text-3xl text-white/15'}`}>
                {revealed && <CombinedScoreSymbol category={category} />}
                <span className="relative z-10">{revealed ? hole.bestStrokes : '·'}</span>
              </div>
            </>}
          </div>
        })}
        <div className="flex items-center justify-center border-l border-white/10 font-display text-3xl font-black" style={{ color: nineHasResult ? 'var(--league-primary)' : 'rgba(255,255,255,.15)' }}>{nineHasResult ? nineTotal : '—'}</div>
      </div>
    })}
  </div>
}

function CombinedScorecardBeat({ holes, courseName, coursePar, animate }: { holes: CombinedScorecardHole[]; courseName: string; coursePar: number | null; animate: boolean }) {
  const [revealedCount, setRevealedCount] = useState(() => animate ? 0 : 18)
  const holeKey = holes.map(hole => `${hole.par ?? 'x'}:${hole.bestStrokes ?? 'x'}`).join('|')

  useEffect(() => {
    setRevealedCount(animate ? 0 : 18)
  }, [animate, holeKey])

  useEffect(() => {
    if (!animate || revealedCount >= 18) return
    const timer = window.setTimeout(() => setRevealedCount(current => Math.min(18, current + 1)), 300)
    return () => window.clearTimeout(timer)
  }, [animate, revealedCount])

  const countedHoles = holes.filter(hole => hole.hole <= revealedCount && hole.bestStrokes != null)
  const compositeTotal = countedHoles.reduce((sum, hole) => sum + hole.bestStrokes!, 0)
  const final = revealedCount >= 18
  const totalLabel = countedHoles.length ? `${compositeTotal} lyöntiä` : '—'
  const versusPar = final && coursePar != null && countedHoles.length ? compositeTotal - coursePar : null
  const versusLabel = versusPar == null ? null : versusPar === 0 ? 'Par' : versusPar > 0 ? `+${versusPar} yli parin` : `${versusPar} alle parin`
  return <div className="mx-auto flex w-full max-w-[1500px] flex-col">
    <div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">KENTÄN YHDISTELMÄKORTTI</div>
    <div className="mt-4 flex items-end justify-between gap-10">
      <div><h2 className="text-6xl font-black">{courseName}</h2><div className="mt-2 text-2xl text-white/55">Par {coursePar ?? '—'} · jokaisen väylän paras raakatulos</div></div>
      <div className="shrink-0 text-right"><div className="text-xs font-bold uppercase tracking-[.18em] text-white/45">{final ? 'Yhdistelmä yhteensä' : 'Kertyy'}</div><div className="mt-1 font-display text-7xl font-black" style={{ color: 'var(--league-primary)' }}>{totalLabel}</div>{final && versusLabel && <div className="mt-1 text-2xl font-bold text-white/65">{versusLabel}</div>}</div>
    </div>
    <div className="mt-8"><CombinedScorecardGrid holes={holes} revealedCount={revealedCount} animate={animate} /></div>
  </div>
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

function StackedStrokeLeaderName({ player, honours, animate, delay }: { player: Player; honours: PlayerHonours; animate: boolean; delay: number }) {
  return <div className={`flex h-[2.2rem] min-w-0 items-center rounded-xl border border-white/10 bg-[var(--bg-card)] px-3 shadow-lg xl:h-[2.4rem] xl:px-4 ${animate ? 'gala-roster-card-animate' : ''}`} style={{ animationDelay: `${delay}ms` }}>
    <div className="flex min-w-0 items-center gap-2 font-display text-base font-bold text-white xl:text-lg">
      <span className="truncate">{player.full_name}</span>
      <LiekkipoikaMark honours={honours} className="text-base" />
    </div>
  </div>
}

function StackedStrokeLeaders({ players, count, color, honours, animate, delay }: { players: Player[]; count: number; color: string; honours: Map<string, PlayerHonours>; animate: boolean; delay: number }) {
  if (!players.length) return <div className="flex h-full items-center justify-center text-xs text-white/35">Ei kirjattuja väyliä</div>
  const visiblePlayers = players.slice(0, Math.min(players.length, 3))
  return <div className="gala-stroke-leader-stack relative mx-auto h-full w-full overflow-hidden">
    {visiblePlayers.slice().reverse().map((player, stackIndex) => {
      const originalIndex = visiblePlayers.length - stackIndex - 1
      const isTopCard = originalIndex === 0
      return <div key={player.id} className={`absolute inset-x-0 ${isTopCard ? '' : 'top-[9.8rem] xl:top-[11rem]'}`} style={{ marginTop: isTopCard ? undefined : `${(originalIndex - 1) * 1.4}rem`, zIndex: isTopCard ? 10 : 8 - originalIndex }}>
        {isTopCard ? <PresentationPlayerCard player={player} honours={honours.get(player.id) ?? emptyHonours()} compact leaderCard animate={animate} delay={delay} categoryBadge={{ value: count, color }} /> : <StackedStrokeLeaderName player={player} honours={honours.get(player.id) ?? emptyHonours()} animate={animate} delay={delay + originalIndex * 100} />}
      </div>
    })}
    {players.length > 1 && <div className="absolute right-1 top-1 z-20 rounded-full border border-white/25 bg-black/75 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white/85">{players.length} pelaajaa tasoissa</div>}
  </div>
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
    nextLeaderDelay += 700
  }
  return <div className="grid grid-cols-5 items-start gap-4 xl:gap-6">
    {cards.map((card, index) => {
      // The visual order is best → worst, but the entry order is worst → best.
      const delay = (cards.length - 1 - index) * 280
      const height = `${(card.count / maxCount) * 100}%`
      const revealIndex = strokeCategoryOrder.findIndex(category => category.key === card.key)
      const revealLeader = revealedLeaderCount > revealIndex
      const leader = leaders[card.key]
      const leaderDelay = leaderDelays.get(card.key) ?? 0
      return <div key={card.key} className="flex min-w-0 flex-col items-center">
        <div className="relative flex h-[15rem] w-full items-end justify-center xl:h-[17rem]">
          <div className={`gala-shot-bar w-[72%] rounded-t-xl ${animateBars ? 'gala-shot-bar-animate' : ''}`} style={{ '--gala-shot-height': height, backgroundColor: card.color, animationDelay: `${delay}ms`, height } as React.CSSProperties}>
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 text-7xl font-black leading-none text-white xl:-top-24 xl:text-8xl"><AnimatedCount target={card.count} animate={animateBars} delay={delay} duration={1500} /></div>
          </div>
        </div>
        <div className="mt-3 text-center text-xl font-bold leading-tight text-white xl:text-2xl">{card.label}</div>
        {card.detail && <div className="mt-2 text-center text-sm text-white/55">{card.detail}</div>}
        <div className="mt-3 h-[13rem] w-full xl:h-[14rem]">
          {revealLeader && (card.key === 'birdie' ? <HiddenLeaderCard animate={animateLeaders} delay={leaderDelay} /> : <StackedStrokeLeaders players={leader.players} count={leader.count} color={card.color} honours={honours} animate={animateLeaders} delay={leaderDelay} />)}
        </div>
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

function PresentationPlayerCard({ player, count, maxCount, honours, compact, leaderCard = false, featured = false, podium = false, lineup = false, animate, delay, positionCounts, hcpOverride, suppressHonoursOverlay = false, resultMetric, categoryBadge, betConfirmed = false, animateBetConfirmation = false }: {
  player: Player
  count?: number
  maxCount?: number
  honours: PlayerHonours
  compact: boolean
  leaderCard?: boolean
  featured?: boolean
  podium?: boolean
  lineup?: boolean
  animate: boolean
  delay: number
  positionCounts?: [number, number, number]
  hcpOverride?: number | null
  suppressHonoursOverlay?: boolean
  resultMetric?: { primary: string; secondary?: string }
  categoryBadge?: { value: number; color: string }
  betConfirmed?: boolean
  animateBetConfirmation?: boolean
}) {
  const fallbackPath = playerImagePath(player.full_name)
  const [image, setImage] = useState(player.avatar_url || fallbackPath)
  const [failed, setFailed] = useState(false)
  const percentage = maxCount && count != null ? (count / maxCount) * 100 : 0
  const overlayText = !suppressHonoursOverlay && animate ? honoursOverlayText(honours) : null
  const showBetStats = count != null
  return <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-card)] shadow-xl ${compact ? 'p-2' : 'p-3'} ${lineup ? 'h-[16rem] xl:h-[17rem]' : ''} ${animate ? 'gala-roster-card-animate' : ''}`} style={{ animationDelay: `${delay}ms` }}>
    {overlayText && <div className="gala-honours-overlay absolute inset-0 z-20 flex items-center justify-center bg-black/80 px-4 text-center text-xl font-black leading-tight text-white xl:text-2xl" style={{ animationDelay: `${delay}ms` }}>{overlayText}</div>}
    <div className={`relative overflow-hidden rounded-lg bg-[var(--bg-dark)] ${lineup ? 'h-[8.5rem] xl:h-[9.5rem]' : podium ? featured ? 'h-72 xl:h-[22rem]' : 'h-64 xl:h-[20rem]' : featured ? 'h-72 xl:h-[22rem]' : compact ? leaderCard ? 'h-28 xl:h-32' : 'h-16' : 'h-36 xl:h-44'}`}>
      {failed ? <div className="flex h-full items-center justify-center bg-[var(--league-primary)] text-3xl font-black text-[var(--bg-dark)]">{player.full_name.substring(0, 2).toUpperCase()}</div> : <img src={image} alt="" onError={() => {
        if (image !== fallbackPath) setImage(fallbackPath)
        else setFailed(true)
      }} className="h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      {categoryBadge && <div className="absolute right-2 top-2 flex min-h-10 min-w-10 items-center justify-center rounded-xl px-3 py-1 shadow-lg" style={{ backgroundColor: categoryBadge.color }} aria-label={`${categoryBadge.value} kyseistä tulosta`}><span className="font-display text-3xl font-black leading-none text-white xl:text-4xl">{categoryBadge.value}</span></div>}
    </div>
    <div className={`${compact ? 'pt-2' : 'pt-3'} min-w-0`}>
      <div className={`${compact ? 'text-base' : 'text-2xl xl:text-3xl'} flex min-w-0 items-center gap-2 font-display font-bold text-white`}><span className="truncate">{player.full_name}</span><LiekkipoikaMark honours={honours} className={compact ? 'text-base' : 'text-xl xl:text-2xl'} /></div>
      <div className={`mt-1 flex flex-wrap gap-1 ${lineup ? 'h-6 overflow-hidden' : ''}`}>
        {hcpOverride !== undefined && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">HCP {hcpOverride ?? '—'}</span>}
        {honours.scratch > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">{honours.scratch}× Scratch</span>}
        {honours.liekkipoika > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">{honours.liekkipoika}× Liekkipoika</span>}
      </div>
      {positionCounts && <div className="mt-2 text-[11px] text-white/50">1. {positionCounts[0]} · 2. {positionCounts[1]} · 3. {positionCounts[2]}</div>}
      {resultMetric && <div className="mt-4 border-t border-white/10 pt-3"><div className="font-display text-4xl font-black leading-none text-white xl:text-5xl">{resultMetric.primary}</div>{resultMetric.secondary && <div className="mt-1 text-sm font-semibold uppercase tracking-[.12em] text-white/50">{resultMetric.secondary}</div>}</div>}
      {showBetStats && <div className="mt-4 rounded-xl bg-white/[.04] px-3 py-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold uppercase tracking-[.16em] text-white/50 xl:text-base">veikkausta</span>
          <span className="font-display text-4xl font-black leading-none text-white xl:text-5xl">{count}</span>
        </div>
        <div className="mt-2 h-4 overflow-hidden rounded-full bg-white/10 xl:h-5">
          <div className={`gala-bet-bar h-full rounded-full ${animate ? 'gala-bet-bar-animate' : ''} ${animateBetConfirmation ? 'gala-bet-bar-confirm' : ''}`} style={{ '--gala-bet-width': `${percentage}%`, animationDelay: `${delay}ms`, width: `${percentage}%`, backgroundColor: betConfirmed ? 'var(--gala-result)' : 'var(--league-primary)' } as React.CSSProperties} />
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

function finnishGenitiveName(name: string): string {
  const parts = name.trim().split(/\s+/)
  const last = parts.pop() ?? name
  const genitive = last.endsWith('nen')
    ? `${last.slice(0, -3)}sen`
    : last.endsWith('i')
      ? `${last.slice(0, -1)}in`
      : `${last}n`
  return [...parts, genitive].join(' ')
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

function PlayerBetDistribution({ question, bets, eventPlayers, honours, animate, compact = false, showCorrect = false, resolution, animateCorrect = false }: { question: EventQuestion; bets: EventBet[]; eventPlayers: EventPlayer[]; honours: Map<string, PlayerHonours>; animate: boolean; compact?: boolean; showCorrect?: boolean; resolution?: Resolution; animateCorrect?: boolean }) {
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
  const correctPlayerId = showCorrect && resolution?.status === 'resolved' ? String(resolution.answer) : null
  return <div className={`grid w-full gap-6 ${crowded ? 'grid-cols-12' : 'grid-cols-3'}`}>
    {summaries.map((summary, index) => <div key={summary.player.id} className={crowded ? (index < 3 ? 'col-span-4' : 'col-span-3') : 'col-span-1'}>
      <div className={`rounded-2xl transition-all duration-500 ${correctPlayerId === summary.player.id ? 'ring-2 ring-[var(--gala-result)] shadow-[0_0_2rem_color-mix(in_srgb,var(--gala-result)_35%,transparent)]' : ''}`}>
        <PresentationPlayerCard player={summary.player} count={summary.count} maxCount={maxCount} honours={honours.get(summary.player.id) ?? emptyHonours()} compact={compact} animate={animate} delay={(summaries.length - 1 - index) * 700} betConfirmed={correctPlayerId === summary.player.id} animateBetConfirmation={animateCorrect && correctPlayerId === summary.player.id} />
      </div>
    </div>)}
  </div>
}

function BinarySplitBar({ labels, counts, correctIndex, animate, animateCorrect }: { labels: [string, string]; counts: [number, number]; correctIndex: number; animate: boolean; animateCorrect: boolean }) {
  const total = counts[0] + counts[1]
  const leftWidth = total ? (counts[0] / total) * 100 : 50
  const widths = [`${leftWidth}%`, `${100 - leftWidth}%`]
  const hasCorrect = correctIndex >= 0
  const colors = [
    hasCorrect ? (correctIndex === 0 ? 'var(--gala-result)' : 'rgba(255,255,255,.14)') : 'var(--league-primary)',
    hasCorrect ? (correctIndex === 1 ? 'var(--gala-result)' : 'rgba(255,255,255,.14)') : 'color-mix(in srgb, var(--league-primary) 58%, var(--bg-dark))',
  ]
  return <div className="mt-8 w-full rounded-2xl border border-white/10 bg-white/[.03] px-6 py-5" aria-label={`${labels[0]} ${counts[0]}, ${labels[1]} ${counts[1]}`}>
    <div className="grid grid-cols-2 gap-6">
      {labels.map((label, index) => <div key={label} className={index === 1 ? 'text-right' : ''}>
        <div className="text-2xl font-black uppercase tracking-[.08em] text-white xl:text-3xl">{label}</div>
        <div className={`mt-1 font-display text-5xl font-black leading-none xl:text-6xl ${hasCorrect && correctIndex !== index ? 'text-white/40' : 'text-white'}`}>{counts[index]}</div>
      </div>)}
    </div>
    <div className="relative mt-5 h-14 overflow-hidden rounded-xl bg-white/10 shadow-inner xl:h-16">
      {widths.map((width, index) => <div key={labels[index]} className={`absolute inset-y-0 ${index === 0 ? 'left-0' : 'right-0'} ${animate ? 'gala-binary-split-side-animate' : ''} ${animateCorrect && correctIndex === index ? 'gala-bet-bar-confirm' : ''}`} style={{ width, backgroundColor: colors[index], transformOrigin: index === 0 ? 'left center' : 'right center', animationDelay: `${index * 100}ms` } as React.CSSProperties} />)}
      {total > 0 && <div className="absolute inset-y-0 w-1 -translate-x-1/2 bg-white shadow-[0_0_1rem_rgba(255,255,255,.8)]" style={{ left: `${leftWidth}%` }} />}
    </div>
  </div>
}

function SplitBetDistribution({ question, bets, players, eventPlayers, honours, animate, showCorrect, resolution, animateCorrect = false }: { question: EventQuestion; bets: EventBet[]; players: ResolverPlayer[]; eventPlayers?: EventPlayer[]; honours?: Map<string, PlayerHonours>; animate: boolean; showCorrect: boolean; resolution?: Resolution; animateCorrect?: boolean }) {
  const key = questionKey(question)
  const isHeadToHead = key === 'yes_no_head_to_head'
  const labels: [string, string] = isHeadToHead
    ? [playerLabel(question.parameters.player_a_id, players), playerLabel(question.parameters.player_b_id, players)]
    : ['KYLLÄ', 'EI']
  const counts = labels.map((_, index) => {
    const expected = isHeadToHead
      ? (index === 0 ? String(question.parameters.player_a_id ?? '') : String(question.parameters.player_b_id ?? ''))
      : index === 0
    return bets.filter(bet => bet.question_id === question.id && (isHeadToHead ? String(bet.answer) === expected : bet.answer === expected)).length
  }) as [number, number]
  const correctIndex = showCorrect && resolution?.status === 'resolved'
    ? isHeadToHead
      ? (String(resolution.answer) === String(question.parameters.player_a_id) ? 0 : String(resolution.answer) === String(question.parameters.player_b_id) ? 1 : -1)
      : resolution.answer === true ? 0 : resolution.answer === false ? 1 : -1
    : -1
  const binaryBar = <BinarySplitBar labels={labels} counts={counts} correctIndex={correctIndex} animate={animate} animateCorrect={animateCorrect} />
  if (!isHeadToHead || !eventPlayers || !honours) return binaryBar

  const ids = [String(question.parameters.player_a_id ?? ''), String(question.parameters.player_b_id ?? '')]
  return <div className="w-full max-w-[1500px]">
    <div className="grid grid-cols-2 gap-8 xl:gap-12">
      {ids.map((id, index) => {
        const player = eventPlayers.find(item => String(item.player_id) === id)?.player
        const correct = correctIndex === index
        if (!player) return <div key={`${id}-${index}`} className="rounded-2xl border border-white/10 bg-white/[.03] px-6 py-5 text-3xl font-bold text-white/60">{id}</div>
        return <div key={player.id} className={`relative rounded-3xl border-2 p-4 transition-all duration-500 ${correct ? 'z-10 scale-[1.03] border-4 border-[var(--gala-result)] bg-[color-mix(in_srgb,var(--gala-result)_18%,transparent)] shadow-[0_0_2.5rem_color-mix(in_srgb,var(--gala-result)_40%,transparent)]' : correctIndex >= 0 ? 'scale-[.97] border-white/10 bg-white/[.02] opacity-40 grayscale' : 'border-white/10 bg-white/[.03]'}`}>
          <PresentationPlayerCard player={player} honours={honours.get(id) ?? emptyHonours()} compact={false} animate={animate} delay={(1 - index) * 350} />
          {correct && <div className="mt-3 rounded-xl bg-[var(--gala-result)] px-4 py-3 text-center text-2xl font-black uppercase tracking-[.12em] text-[var(--bg-dark)] shadow-[0_0_1.5rem_color-mix(in_srgb,var(--gala-result)_50%,transparent)]">✓ OIKEA VASTAUS</div>}
        </div>
      })}
    </div>
    {binaryBar}
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
      <div className="absolute left-5 right-5 top-24 h-1 rounded-full bg-[var(--league-primary)]/30" />
      {counts.map((item, index) => {
        const position = min === max ? 50 : ((item.value - min) / (max - min)) * 100
        return <div key={item.value} className={`absolute top-6 -translate-x-1/2 text-center ${animate ? 'gala-bet-marker-animate' : ''}`} style={{ left: `calc(${Math.min(97, Math.max(3, position))}% + ${position === 0 ? 5 : position === 100 ? -5 : 0}px)`, animationDelay: `${index * 90}ms` }}>
          <div className="text-3xl font-black text-[var(--league-primary)]">{item.count}</div>
          <div className="mx-auto mt-2 h-10 w-10 rounded-full border-4 border-[var(--league-primary)] bg-[var(--bg-card)]" />
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
  if (['yes_no_four_birdies', 'yes_no_birdie', 'yes_no_zero', 'yes_no_head_to_head'].includes(key)) return <SplitBetDistribution question={question} bets={bets} players={players} eventPlayers={eventPlayers} honours={honours} animate={animate} showCorrect={false} />
  if (['player_pick_best_front', 'player_pick_best_back', 'player_pick_best_scratch'].includes(key)) return <PlayerBetDistribution question={question} bets={bets} eventPlayers={eventPlayers} honours={honours} animate={animate} />
  if (key === 'slider_player_points') return <SliderBetDistribution question={question} bets={bets} animate={animate} />
  if (key === 'podium_top3') return <PodiumBetDistribution question={question} bets={bets} players={players} eventPlayers={eventPlayers} honours={honours} animate={animate} />
  const groups = distribution(question, bets, players, participants)
  if (!groups.length) return <p className="text-3xl text-white/45">Ei vielä veikkauksia</p>
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{groups.map(group => <div key={group.answer} className="rounded-2xl border border-white/10 bg-white/[.04] px-5 py-4"><div className="text-3xl font-bold text-white">{group.answer}</div><div className="mt-2 text-xl text-white/60">{group.names.length} · {group.names.join(', ')}</div></div>)}</div>
}

function Ruling({ question, resolution, bets, participants, players, eventPlayers, honours }: { question: EventQuestion; resolution: Resolution; bets: EventBet[]; participants: EventParticipant[]; players: ResolverPlayer[]; eventPlayers: EventPlayer[]; honours: Map<string, PlayerHonours> }) {
  if (resolution.status === 'unresolved') {
    return <div className="max-w-5xl">
      <div className="text-7xl font-black tracking-tight text-white">Ei ratkennut</div>
      <div className="mt-6 text-2xl text-white/55">{resolution.reason}</div>
      <div className="mt-8 text-2xl text-white/55">Kukaan ei saanut pisteitä</div>
    </div>
  }
  const correct = bets.filter(bet => bet.question_id === question.id && scoreAnswer(question, bet.answer, resolution) > 0)
  if (questionKey(question) === 'yes_no_head_to_head') {
    return <div className="max-w-5xl text-center">
      <div className="text-2xl font-semibold uppercase tracking-[.16em] text-white/45">Oikein veikanneet</div>
      <div className="mt-3 text-3xl font-bold text-white">{correct.length ? `${correct.length} oikein · ${correct.map(bet => participantLabel(bet.participant_id, participants)).join(', ')}` : 'Kukaan ei saanut pistettä'}</div>
      {resolution.warning && <div className="mt-4 text-xl text-white/45">{resolution.warning}</div>}
    </div>
  }
  const resolvedPlayer = eventPlayers.find(item => item.player_id === String(resolution.answer))?.player ?? null
  return <div className="max-w-6xl">
    <div className="text-3xl font-semibold uppercase tracking-[.18em] text-white/45">Oikea vastaus</div>
    {resolvedPlayer ? <div className="mt-6 w-full max-w-[34rem]">
      <PresentationPlayerCard player={resolvedPlayer} honours={honours.get(resolvedPlayer.id) ?? emptyHonours()} compact={false} featured animate={false} delay={0} />
    </div> : <div className="mt-3 text-7xl font-black tracking-tight" style={{ color: 'var(--league-primary)' }}>{answerText(question, resolution.answer, players)}</div>}
    <div className="mt-10 text-3xl text-white">{correct.length ? `${correct.length} oikein · ${correct.map(bet => participantLabel(bet.participant_id, participants)).join(', ')}` : 'Kukaan ei saanut pisteitä'}</div>
    {resolution.warning && <div className="mt-5 text-xl text-white/45">{resolution.warning}</div>}
  </div>
}

function AccumulatingYesNoBeat({ question, questionNumber, questionTotal, state, bets, resolution, participants, players, eventPlayers, honours, animateDistribution, animateRuling = false }: { question: EventQuestion; questionNumber: number; questionTotal: number; state: 1 | 2 | 3; bets: EventBet[]; resolution: Resolution; participants: EventParticipant[]; players: ResolverPlayer[]; eventPlayers: EventPlayer[]; honours: Map<string, PlayerHonours>; animateDistribution: boolean; animateRuling?: boolean }) {
  return <div className="mx-auto flex h-full min-h-[42rem] w-full max-w-6xl flex-col items-center text-center">
    <div className="flex h-[20rem] shrink-0 w-full flex-col items-center justify-center">
      <div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">VEIKKAUS</div>
      <h2 className="mt-7 max-w-6xl text-8xl font-black leading-[.95]">{questionTitle(question)}</h2>
      <div className="mt-8 text-3xl text-white/45">Kysymys {questionNumber} / {questionTotal}</div>
    </div>
    {state >= 2 && <div className="w-full shrink-0 border-t border-white/10 pt-8"><SplitBetDistribution question={question} bets={bets} players={players} eventPlayers={eventPlayers} honours={honours} animate={animateDistribution} showCorrect={state === 3} resolution={resolution} animateCorrect={state === 3 && animateRuling} /></div>}
    {state >= 3 && <div className="mt-8 w-full shrink-0 border-t border-white/10 pt-8"><Ruling question={question} resolution={resolution} bets={bets} participants={participants} players={players} eventPlayers={eventPlayers} honours={honours} /></div>}
  </div>
}

function AccumulatingPlayerPickRuling({ question, questionNumber, questionTotal, bets, resolution, participants, players, eventPlayers, honours, animateDistribution, animateRuling }: { question: EventQuestion; questionNumber: number; questionTotal: number; bets: EventBet[]; resolution: Resolution; participants: EventParticipant[]; players: ResolverPlayer[]; eventPlayers: EventPlayer[]; honours: Map<string, PlayerHonours>; animateDistribution: boolean; animateRuling: boolean }) {
  const correct = bets.filter(bet => bet.question_id === question.id && scoreAnswer(question, bet.answer, resolution) > 0)
  const resolvedPlayer = resolution.status === 'resolved'
    ? eventPlayers.find(item => item.player_id === String(resolution.answer))?.player ?? null
    : null
  const correctLine = correct.length
    ? `${correct.length} oikein · ${correct.map(bet => participantLabel(bet.participant_id, participants)).join(', ')}`
    : 'Kukaan ei saanut pisteitä'

  return <div className="mx-auto flex h-full min-h-[42rem] w-full max-w-[1500px] flex-col">
    <div className="shrink-0 text-center">
      <div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">VEIKKAUS</div>
      <h2 className="mt-5 text-6xl font-black leading-[.95] xl:text-7xl">{questionTitle(question)}</h2>
      <div className="mt-5 text-2xl text-white/45">Kysymys {questionNumber} / {questionTotal}</div>
    </div>
    <div className="mt-7 w-full shrink-0 border-t border-white/10 pt-6">
      <div className="text-center text-sm font-bold uppercase tracking-[.2em] text-white/40">Miten veikattiin</div>
      <div className="mt-4">
        <PlayerBetDistribution question={question} bets={bets} eventPlayers={eventPlayers} honours={honours} animate={animateDistribution} compact showCorrect resolution={resolution} animateCorrect={animateRuling} />
      </div>
    </div>
    <div className="mt-6 flex min-h-0 flex-1 flex-col items-center border-t border-white/10 pt-6 text-center">
      {resolution.status === 'unresolved' ? <Ruling question={question} resolution={resolution} bets={bets} participants={participants} players={players} eventPlayers={eventPlayers} honours={honours} /> : resolvedPlayer ? <>
        <div className="text-2xl font-semibold uppercase tracking-[.18em] text-white/45">Oikea vastaus</div>
        <div className={`mt-3 rounded-xl bg-[var(--gala-result)] px-5 py-2 text-2xl font-black uppercase tracking-[.12em] text-[var(--bg-dark)] shadow-[0_0_1.5rem_color-mix(in_srgb,var(--gala-result)_40%,transparent)] ${animateRuling ? 'gala-roster-card-animate' : ''}`}>✓ {resolvedPlayer.full_name}</div>
        <div className={`mt-4 w-full max-w-[30rem] ${animateRuling ? 'gala-roster-card-animate' : ''}`}>
          <PresentationPlayerCard player={resolvedPlayer} honours={honours.get(resolvedPlayer.id) ?? emptyHonours()} compact={false} featured animate={false} delay={0} />
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.04] px-8 py-4 text-2xl font-bold text-white/80 xl:text-3xl">{correctLine}</div>
      </> : <Ruling question={question} resolution={resolution} bets={bets} participants={participants} players={players} eventPlayers={eventPlayers} honours={honours} />}
    </div>
  </div>
}

type CompositionPresentationState = 1 | 2 | 3
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

function compositionParticipantScores(bets: readonly EventBet[], questionId: string, participants: readonly EventParticipant[], actual: readonly CompositionActualHole[], resolvedHoleNumbers: ReadonlySet<number>) {
  const byParticipant = new Map<string, EventBet>()
  for (const bet of bets) if (bet.question_id === questionId && !byParticipant.has(bet.participant_id)) byParticipant.set(bet.participant_id, bet)
  return [...byParticipant.values()]
    .map(bet => {
      const correct = actual.reduce((count, hole, index) => count + (resolvedHoleNumbers.has(hole.hole) && hole.category && compositionAnswerCategory(bet.answer, index) === hole.category ? 1 : 0), 0)
      const participant = participants.find(item => item.id === bet.participant_id)
      return { bet, name: participant?.display_name ?? 'Tuntematon veikkaaja', correct, submittedAt: participant?.submitted_at ?? '' }
    })
    .filter(item => item.correct > 0)
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
  const actualLabel = actualCategory
    ? actualCategory.fullLabel
    : 'Tarkka luokka ei tiedossa'
  const actualDetail = `${hole.points} pistettä`
  const rowClass = age === 0 ? 'gala-composition-row-current' : age <= 3 ? 'gala-composition-row-recent' : 'gala-composition-row-old'
  return <article className={`relative grid min-h-[7rem] grid-cols-[5rem_minmax(0,1fr)_minmax(16rem,1.05fr)_6rem_7rem] items-center gap-4 overflow-visible rounded-2xl border border-white/10 bg-[var(--bg-card)] px-4 py-3 shadow-xl ${rowClass} ${animate ? 'gala-composition-hole-in' : ''}`}>
    <div className="flex h-full flex-col justify-center border-r border-white/10 pr-4">
      <div className="text-4xl font-black leading-none text-white">{hole.hole}</div>
    </div>
    <div className="min-w-0">
      <div className="flex h-9 w-full overflow-hidden rounded-lg bg-white/10">
        {CATEGORY_ORDER.map(category => {
          const count = counts[category]
          if (!count || !totalBets) return null
          const width = `${(count / totalBets) * 100}%`
          const correct = actualRevealed && hole.category === category
          const showCount = count >= 2 || (totalBets <= 5 && count > 0)
          return <div key={category} className={`gala-composition-prediction-segment relative flex min-w-[2px] items-center justify-center ${correct ? 'gala-composition-prediction-correct' : ''}`} style={{ width, backgroundColor: CATEGORY_META[category].cellColor, boxShadow: correct ? `inset 0 0 0 3px #fff, 0 0 0 2px ${CATEGORY_META[category].cellColor}, 0 0 18px ${CATEGORY_META[category].cellColor}` : undefined }} title={`${CATEGORY_META[category].fullLabel}: ${count}`}><span className={showCount ? 'text-lg font-black text-white drop-shadow' : 'sr-only'}>{count}</span></div>
        })}
      </div>
    </div>
    <div className={`min-w-0 transition-opacity duration-300 ${actualRevealed ? 'opacity-100' : 'opacity-0'}`}>
      <div className="inline-flex max-w-full rounded-lg px-3 py-1.5 text-lg font-black leading-tight text-white shadow-lg xl:text-xl" style={{ backgroundColor: actualCategory?.cellColor ?? 'rgba(255,255,255,.14)', textShadow: '0 1px 2px rgba(0,0,0,.75)' }}>{actualLabel}</div>
      <div className="mt-2 text-base font-semibold text-white/60">{actualDetail}</div>
    </div>
    <div className={`relative flex h-[4.5rem] min-w-0 items-center justify-center transition-opacity duration-300 ${actualRevealed ? 'opacity-100' : 'opacity-0'}`}>
      {hole.category && hole.strokesPlayed != null && <CombinedScoreSymbol category={hole.category} />}
      <span className="relative z-10 font-display text-5xl font-black leading-none text-white">{hole.strokesPlayed ?? '—'}</span>
    </div>
    <div className="relative text-right">
      <div className="text-[11px] font-bold uppercase tracking-[.16em] text-white/40">Oikein</div>
      <div className="mt-1 text-3xl font-black text-white">{actualRevealed ? correctNames.length : '—'}</div>
    </div>
    {actualRevealed && correctNames.length > 0 && <div className="gala-composition-correct-flash pointer-events-none absolute inset-x-4 bottom-[calc(100%+0.5rem)] z-50 rounded-xl border-2 border-[var(--league-primary)] bg-white px-4 py-2.5 text-center text-[clamp(1rem,1.35vw,1.5rem)] font-black leading-tight text-[var(--bg-dark)] shadow-[0_0.5rem_1.5rem_rgba(0,0,0,.55),0_0_0_2px_rgba(255,255,255,.35)] xl:inset-x-6">✓ {correctNames.join(' · ')}</div>}
  </article>
}

function CompositionTargetCard({ target, score, honours }: { target: EventPlayer | null; score: EventScore | null; honours: PlayerHonours }) {
  if (!target) return <div className="rounded-2xl border border-white/10 bg-white/[.03] px-6 py-8 text-3xl text-white/55">Kohdepelaajaa ei löytynyt</div>
  return <div className="w-[30rem] shrink-0 xl:w-[36rem]">
    <PresentationPlayerCard player={target.player} honours={honours} compact={false} featured animate={false} delay={0} hcpOverride={score?.hcp ?? target.player.hcp_fallback} />
  </div>
}

function CompositionTopThreePanel({ items, denominator, animate }: { items: ReturnType<typeof compositionParticipantScores>; denominator: 9 | 18; animate: boolean }) {
  const rowOffset = (index: number) => index < 3 ? index * 4.1 : 12.3 + (index - 3) * 2.35
  const seenParticipantIds = useRef<Set<string>>(new Set())
  const itemIds = items.map(item => item.bet.participant_id)
  const itemIdKey = itemIds.join('|')
  const arrivingParticipantIds = animate
    ? new Set(itemIds.filter(participantId => !seenParticipantIds.current.has(participantId)))
    : new Set<string>()

  useEffect(() => {
    itemIds.forEach(participantId => seenParticipantIds.current.add(participantId))
  }, [itemIdKey])

  return <aside className="flex h-full min-h-[25rem] flex-col rounded-2xl border border-white/10 bg-white/[.03] p-5">
    <div className="shrink-0 text-sm font-bold uppercase tracking-[.18em] text-white/45">Kärkiveikkaajat</div>
    <div className="mt-1 shrink-0 text-xs font-semibold uppercase tracking-[.14em] text-white/35">Osumat / {denominator}</div>
    <div className="relative mt-5 min-h-0 flex-1 overflow-hidden">
      {items.length ? items.map((item, index) => <div key={item.bet.id} className={`gala-composition-ranking-row absolute inset-x-0 ${index < 3 ? 'text-lg' : 'text-sm opacity-60'}`} style={{ transform: `translateY(${rowOffset(index)}rem)` }}>
        <div className={`gala-composition-ranking-entry ${arrivingParticipantIds.has(item.bet.participant_id) ? 'gala-composition-ranking-entry-arrive' : ''}`}>
          <span className={`${index < 3 ? 'text-2xl' : 'text-base'} w-7 shrink-0 font-black ${index === 0 ? 'text-white' : 'text-white/40'}`}>{index + 1}.</span>
          <span className={`min-w-0 flex-1 truncate font-bold ${index < 3 ? 'text-white' : 'text-white/75'}`}>{item.name}</span>
          <span className={`${index < 3 ? 'text-2xl' : 'text-lg'} font-black`} style={{ color: 'var(--league-primary)' }}>{item.correct}</span>
        </div>
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

  if (state === 1) return <div className="flex min-h-[34rem] w-full max-w-[1500px] items-center justify-center gap-16 px-4 xl:gap-24">
    <CompositionTargetCard target={target} score={score} honours={honours} />
    <div className="min-w-0 max-w-4xl"><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">YKSITTÄISEN PELAAJAN TULOSKORTTI</div><h2 className="mt-6 text-7xl font-black leading-[.95] xl:text-8xl">Miten {finnishGenitiveName(target?.player.full_name ?? 'pelaajan')} kierros meni?</h2><div className="mt-8 text-3xl text-white/55">{event.course?.name ?? 'Lake & Forest'}{event.course?.par_total ? ` · Par ${event.course.par_total}` : ''}</div><div className="mt-4 text-2xl text-white/40">18 väylää · täydellinen veikkaus 8 pistettä</div></div>
  </div>

  const start = state === 3 ? 9 : 0
  const resolvedHoleNumbers = new Set(Array.from({ length: state === 3 ? 9 + actualRevealedCount : actualRevealedCount }, (_, index) => index + 1))
  const holes = actual.slice(start, start + revealedCount)
  const ranking = compositionParticipantScores(bets, question.id, participants, actual, resolvedHoleNumbers)
  const targetName = target?.player.full_name ?? 'Kohdepelaaja'
  const resolvedHoles = actual.filter(hole => resolvedHoleNumbers.has(hole.hole))
  const runningPoints = resolvedHoles.reduce((sum, hole) => sum + hole.points, 0)
  const runningStrokes = resolvedHoles.reduce((sum, hole) => sum + (hole.strokesPlayed ?? 0), 0)
  const missingCourseMetadata = actual.some(hole => hole.par == null || hole.strokeIndex == null)
  return <div className="flex h-full min-h-0 w-full max-w-[1500px] flex-col">
    <div className="shrink-0 rounded-2xl border border-white/10 bg-[var(--bg-card)]/80 px-6 py-4">
      <div className="flex items-end justify-between gap-8"><div><div className="text-2xl font-semibold uppercase tracking-[.2em] text-white/45">YKSITTÄISEN PELAAJAN TULOSKORTTI</div><h2 className="mt-2 text-5xl font-black">{targetName} · {state === 2 ? 'etuyhdeksikkö' : 'takayhdeksikkö'}</h2></div><div className="flex shrink-0 items-end gap-5 text-right"><div className="rounded-xl border border-[var(--league-primary)]/45 bg-[var(--league-primary)]/10 px-5 py-3"><div className="text-xs font-black uppercase tracking-[.16em] text-white/70">Pisteet tähän asti</div><div className="mt-1 font-display text-5xl font-black leading-none" style={{ color: 'var(--league-primary)', textShadow: '0 0 1.25rem color-mix(in srgb, var(--league-primary) 55%, transparent)' }}>{runningPoints}p</div></div><div className="border-l border-white/20 pl-5"><div className="text-xs font-black uppercase tracking-[.16em] text-white/70">Lyönnit tähän asti</div><div className="mt-1 font-display text-5xl font-black leading-none text-white">{runningStrokes}</div></div></div></div>
      <div className="mt-2 flex justify-between text-sm text-white/45"><span>{paused ? 'P tauko' : `Väylä ${Math.min(9, revealedCount)} / 9`}</span><span>P = tauko · R = aloita ysi alusta</span></div>
      <CompositionCategoryLegend />
    </div>
    {missingCourseMetadata && <div className="mt-3 shrink-0 text-sm text-amber-300/80">Kurssin par- tai SI-tieto puuttuu osasta väyliä — varmista scorecardin väylätiedot ennen esitystä.</div>}
    <div className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_17rem] gap-6">
      <div ref={rowViewport} className="no-scrollbar min-h-0 overflow-y-auto pr-2"><div className="space-y-3">{holes.map((hole, index) => <CompositionHoleRow key={hole.hole} question={question} hole={hole} bets={bets} participants={participants} age={revealedCount - index - 1} actualRevealed={index < actualRevealedCount} animate={animate} />)}</div></div>
      <CompositionTopThreePanel items={ranking} denominator={state === 2 ? 9 : 18} animate={animate} />
    </div>
  </div>
}

type PodiumMode = 'scratch' | 'liekkipaita'

function PodiumResultCard({ score, place, mode, honours, animate }: { score: EventScore; place: number; mode: PodiumMode; honours: Map<string, PlayerHonours>; animate: boolean }) {
  if (!score.player) return null
  const raw = rawStrokes(score)
  const resultMetric = mode === 'scratch'
    ? { primary: raw == null ? '—' : String(raw), secondary: raw == null ? 'raakatulos puuttuu' : 'lyöntiä' }
    : { primary: `${stableford(score)}p`, secondary: raw == null ? 'raakatulos puuttuu' : `${raw} lyöntiä` }
  return <div className={`gala-podium-card gala-podium-card-${place === 1 ? 'winner' : 'side'} ${animate ? 'gala-podium-card-in' : ''}`}>
    <div className="mb-2 text-center text-xl font-black uppercase tracking-[.16em] text-white/45">#{place}</div>
    <PresentationPlayerCard
      player={score.player}
      honours={honours.get(score.player_id) ?? emptyHonours()}
      compact={false}
      podium
      animate={false}
      delay={0}
      resultMetric={resultMetric}
    />
  </div>
}

function PodiumIncompleteState({ rank }: { rank: EventScore[] }) {
  return <div className="gala-podium-incomplete pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
    <div className="text-sm font-black uppercase tracking-[.22em] text-white/40">Podium odottaa</div>
    <div className="mt-2 text-xl font-bold text-white/65">Ei tarpeeksi kirjattuja kortteja</div>
    <div className="mt-1 text-sm text-white/35">{rank.length} / 3 korttia kirjattu</div>
  </div>
}

function LiekkipoikaRoomFlash({ animationDelay }: { animationDelay: number }) {
  return <div className="gala-liekkipoika-room-flash pointer-events-none fixed inset-0 z-40" style={{ animationDelay: `${animationDelay}ms` }} aria-hidden="true">
    <div className="gala-liekkipoika-firefield">🔥　🔥　🔥　🔥　🔥<br />　🔥　🔥　🔥　🔥　🔥<br />🔥　🔥　🔥　🔥　🔥</div>
    <div className="gala-liekkipoika-hype-label">🔥 LIEKKIPOIKA 🔥</div>
  </div>
}

function LineupHonoursOverlay({ player, honours }: { player: Player; honours: PlayerHonours }) {
  return <>
    <LiekkipoikaRoomFlash animationDelay={0} />
    <div className="gala-lineup-honours-layer pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-8" aria-hidden="true">
      <div className="relative w-[min(70vw,48rem)]">
        <PresentationPlayerCard player={player} honours={honours} compact={false} featured animate={false} delay={0} />
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-black/75 px-8 text-center text-4xl font-black leading-tight text-white xl:text-6xl">{honoursOverlayText(honours) ?? '🔥 LIEKKIPOIKA'}</div>
      </div>
    </div>
  </>
}

function PodiumPresentationBeat({ rank, mode, revealedCount, honours, animate, detail }: { rank: EventScore[]; mode: PodiumMode; revealedCount: 1 | 2 | 3; honours: Map<string, PlayerHonours>; animate: boolean; detail?: ReactNode }) {
  const revealOrder = [3, 2, 1]
  const newestPlace = revealOrder[revealedCount - 1]
  const revealedPlaces = new Set(revealOrder.slice(0, revealedCount))
  const title = mode === 'scratch' ? 'Scratch' : 'Liekkipaita'
  const showWinnerFlash = mode === 'liekkipaita' && animate && revealedCount === 3 && Boolean(rank[0]?.player)
  return <div className="w-full max-w-[1880px]">
    {showWinnerFlash && Array.from({ length: 3 }, (_, index) => <LiekkipoikaRoomFlash key={`liekkipaita-winner-flash-${index}`} animationDelay={index * 650} />)}
    <div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">{title} · podium</div>
    <h2 className="mt-5 text-7xl font-black">{mode === 'scratch' ? 'Scratch-tulos' : 'Liekkipaita'}</h2>
    <div className="gala-podium-stage relative mx-auto mt-8 h-[44rem] w-full max-w-[1840px]">
      {revealedPlaces.has(3) && rank[2] && <div className="absolute left-[1%] top-[10rem] w-[32%]"><PodiumResultCard score={rank[2]} place={3} mode={mode} honours={honours} animate={animate && newestPlace === 3} /></div>}
      {revealedPlaces.has(2) && rank[1] && <div className="absolute right-[1%] top-[10rem] w-[32%]"><PodiumResultCard score={rank[1]} place={2} mode={mode} honours={honours} animate={animate && newestPlace === 2} /></div>}
      {revealedPlaces.has(1) && rank[0] && <div className="absolute left-1/2 top-0 w-[40%] -translate-x-1/2"><PodiumResultCard score={rank[0]} place={1} mode={mode} honours={honours} animate={animate && newestPlace === 1} /></div>}
      {rank.length < 3 && <PodiumIncompleteState rank={rank} />}
    </div>
    {revealedCount === 3 && detail && <div className="mx-auto mt-3 max-w-5xl border-t border-white/15 pt-5 text-2xl text-white/65">{detail}</div>}
  </div>
}

function unresolvedReveal(reason: string | undefined) {
  return <div><div className="text-7xl font-black text-white">Ei ratkennut</div>{reason && <div className="mt-5 text-2xl text-white/55">{reason}</div>}</div>
}

function EventPlayerRoster({ players, honours, animate }: { players: EventPlayer[]; honours: Map<string, PlayerHonours>; animate: boolean }) {
  const ordered = useMemo(() => [...players].sort((a, b) => {
    const aHonours = honours.get(a.player_id) ?? emptyHonours()
    const bHonours = honours.get(b.player_id) ?? emptyHonours()
    const aHasLiekkipoika = aHonours.liekkipoika > 0
    const bHasLiekkipoika = bHonours.liekkipoika > 0
    return Number(aHasLiekkipoika) - Number(bHasLiekkipoika) || a.display_order - b.display_order
  }), [players, honours])
  const orderedIds = ordered.map(player => player.player_id).join(',')
  const [landedCount, setLandedCount] = useState(animate ? 0 : ordered.length)
  const [revealState, setRevealState] = useState<{ index: number; phase: 'overlay' | 'card' } | null>(null)
  const lineupOverlayDuration = 1400
  const lineupCardDuration = 650

  useEffect(() => {
    setLandedCount(animate ? 0 : ordered.length)
    setRevealState(null)
  }, [animate, ordered.length, orderedIds])

  useEffect(() => {
    if (!animate || landedCount >= ordered.length) {
      setRevealState(null)
      return
    }
    const index = landedCount
    const playerHonours = honours.get(ordered[index].player_id) ?? emptyHonours()
    const hasLiekkipoika = playerHonours.liekkipoika > 0
    let cardTimer: number | undefined
    setRevealState({ index, phase: hasLiekkipoika ? 'overlay' : 'card' })
    const overlayTimer = window.setTimeout(() => {
      setRevealState({ index, phase: 'card' })
      cardTimer = window.setTimeout(() => {
        setLandedCount(current => Math.max(current, index + 1))
        setRevealState(null)
      }, lineupCardDuration)
    }, hasLiekkipoika ? lineupOverlayDuration : 0)
    return () => {
      window.clearTimeout(overlayTimer)
      if (cardTimer != null) window.clearTimeout(cardTimer)
    }
  }, [animate, landedCount, ordered, orderedIds, honours])

  const rows = Array.from({ length: Math.ceil(ordered.length / 4) }, (_, rowIndex) => ordered.slice(rowIndex * 4, rowIndex * 4 + 4))
  const activeOverlay = revealState?.phase === 'overlay' ? ordered[revealState.index] : null
  return <div className="relative mx-auto h-full w-full max-w-[1760px] pt-4 xl:pt-6">
    {activeOverlay && <LineupHonoursOverlay player={activeOverlay.player} honours={honours.get(activeOverlay.player_id) ?? emptyHonours()} />}
    <div className="text-3xl font-semibold uppercase tracking-[.18em] text-white/45">{players.length} PELAAJAA</div>
    <h2 className="mt-5 text-7xl font-black">Päivän lineup</h2>
    <div className="mt-8 space-y-6">
      {rows.map((row, rowIndex) => <div key={rowIndex} className="flex justify-center gap-6">
        {row.map((eventPlayer, index) => {
          const globalIndex = rowIndex * 4 + index
          const playerHonours = honours.get(eventPlayer.player_id) ?? emptyHonours()
          const isLanded = globalIndex < landedCount || (revealState?.index === globalIndex && revealState.phase === 'card')
          const isAppearing = revealState?.index === globalIndex && revealState.phase === 'card'
          return <div key={eventPlayer.player_id} className="gala-lineup-slot flex min-w-0 items-stretch" style={{ width: 'calc((100% - 72px) / 4)' }}>
            {isLanded && <PresentationPlayerCard player={eventPlayer.player} honours={playerHonours} compact={false} lineup animate={isAppearing} delay={0} suppressHonoursOverlay />}
          </div>
        })}
      </div>)}
    </div>
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

type BettingLeaderboardEntry = { name: string; points: number; submittedAt: string }

function BettingLeaderboardBeat({ leaderboard, animate, closing = false }: { leaderboard: BettingLeaderboardEntry[]; animate: boolean; closing?: boolean }) {
  const leaderboardKey = leaderboard.map(item => `${item.name}:${item.points}:${item.submittedAt}`).join('|')
  const [revealedCount, setRevealedCount] = useState(() => animate && !closing ? 0 : leaderboard.length)

  useEffect(() => {
    setRevealedCount(animate && !closing ? 0 : leaderboard.length)
  }, [animate, closing, leaderboard.length, leaderboardKey])

  useEffect(() => {
    if (!animate || closing || !leaderboard.length || revealedCount >= leaderboard.length) return
    const nextIndex = leaderboard.length - revealedCount - 1
    const delay = nextIndex === 0 ? 1500 : revealedCount === 0 ? 700 : 180
    const timer = window.setTimeout(() => setRevealedCount(current => Math.min(leaderboard.length, current + 1)), delay)
    return () => window.clearTimeout(timer)
  }, [animate, closing, leaderboard.length, leaderboardKey, revealedCount])

  if (closing) {
    return <div className="flex w-full flex-col items-center justify-center text-center">
      <div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">TULOSVEIKKAUS VOITTAJA</div>
      <div className="mt-12 max-w-full text-[clamp(4rem,11vw,11rem)] font-black leading-[.9] tracking-tight text-white">{leaderboard[0]?.name ?? 'Ei veikkauksia'}</div>
    </div>
  }

  const visible = leaderboard.slice(Math.max(0, leaderboard.length - revealedCount))
  return <div className="flex h-full min-h-0 w-full flex-col justify-start text-center">
    <h2 className="shrink-0 text-6xl font-black leading-none tracking-tight xl:text-8xl">TULOSVEIKKAUS VOITTAJA</h2>
    <div className="mx-auto mt-10 flex w-full max-w-[1760px] flex-col gap-3 overflow-visible">
      {visible.length ? visible.map((item, visibleIndex) => {
        const index = leaderboard.length - revealedCount + visibleIndex
        const winner = index === 0
        const podium = index < 3
        const newest = animate && visibleIndex === 0
        return <div key={`${item.name}-${index}`} className={`grid grid-cols-[5rem_minmax(0,1fr)_7rem] items-center gap-6 border-b border-white/10 text-left ${newest ? 'gala-composition-final-row-in' : ''} ${winner ? 'rounded-2xl border-2 border-[var(--league-primary)] bg-[var(--league-primary)]/15 px-7 py-7 shadow-[0_0_2.5rem_color-mix(in_srgb,var(--league-primary)_28%,transparent)] xl:px-10 xl:py-9' : podium ? 'rounded-xl bg-white/[.06] px-6 py-5 xl:px-8 xl:py-6' : 'px-5 py-3 xl:px-7 xl:py-4'}`}>
          <span className={`${winner ? 'text-5xl text-[var(--league-primary)] xl:text-7xl' : podium ? 'text-4xl text-white/65 xl:text-6xl' : 'text-3xl text-white/40 xl:text-4xl'} font-black`}>#{index + 1}</span>
          <span className={`${winner ? 'text-6xl xl:text-8xl' : podium ? 'text-5xl xl:text-7xl' : 'text-3xl xl:text-5xl'} min-w-0 truncate font-bold ${winner ? 'text-white' : 'text-white/90'}`}>{item.name}</span>
          <span className={`${winner ? 'text-5xl xl:text-7xl' : podium ? 'text-4xl xl:text-6xl' : 'text-3xl xl:text-5xl'} text-right font-black`} style={{ color: 'var(--league-primary)' }}>{item.points}p</span>
        </div>
      }) : <div className="text-4xl text-white/55">Ei veikkauksia</div>}
    </div>
  </div>
}

function findEventPlayer(players: readonly EventPlayer[], playerId: string | null | undefined, playerName: string | null | undefined): EventPlayer | null {
  if (playerId) {
    const byId = players.find(item => item.player_id === playerId)
    if (byId) return byId
  }
  if (playerName) {
    const normalized = playerName.trim().toLocaleLowerCase()
    return players.find(item => item.player.full_name.trim().toLocaleLowerCase() === normalized) ?? null
  }
  return null
}

type ClosingEndCardProps = {
  event: EventRow
  winner: EventPlayer | null
  winnerScore: EventScore | null
  scratchWinner: EventPlayer | null
  scratchWinnerScore: EventScore | null
  roll: Array<{ year: number; name: string | null }>
  animate: boolean
}

function ClosingScorecard({ holes }: { holes: CompositionActualHole[] }) {
  const nines = [{ label: 'OUT', holes: holes.slice(0, 9) }, { label: 'IN', holes: holes.slice(9, 18) }]
  return <div className="rounded-2xl border border-white/15 bg-[var(--bg-card)]/90 p-3 shadow-xl xl:p-4">
    <div className="mb-3 flex items-center justify-between gap-4">
      <div className="text-sm font-black uppercase tracking-[.2em] text-white/45">18 reiän tuloskortti</div>
      <div className="text-xs font-bold uppercase tracking-[.16em] text-white/35">Par · lyönnit</div>
    </div>
    {nines.map(nine => {
      const total = nine.holes.every(hole => hole.strokesPlayed != null)
        ? nine.holes.reduce((sum, hole) => sum + (hole.strokesPlayed ?? 0), 0)
        : null
      return <div key={nine.label} className="grid grid-cols-[2.7rem_repeat(9,minmax(0,1fr))_3.5rem] items-stretch border-b border-white/10 last:border-b-0">
        <div className="flex items-center text-xs font-black uppercase tracking-[.12em] text-white/45">{nine.label}</div>
        {nine.holes.map(hole => {
          const category = hole.category
          return <div key={hole.hole} className="relative flex min-h-[5.2rem] flex-col items-center justify-center border-l border-white/10">
            <div className="text-sm font-black text-white/80">{hole.hole}</div>
            <div className="mt-0.5 text-[10px] font-bold text-white/40">{hole.par == null ? 'Par —' : `Par ${hole.par}`}</div>
            <div className="relative mt-1 flex h-9 w-9 items-center justify-center rounded-full text-xl font-black text-white">
              {hole.strokesPlayed != null && <CombinedScoreSymbol category={category} />}
              <span className="relative z-10">{hole.strokesPlayed ?? '—'}</span>
            </div>
          </div>
        })}
        <div className="flex items-center justify-center border-l border-white/10 font-display text-2xl font-black" style={{ color: total == null ? 'rgba(255,255,255,.25)' : 'var(--league-primary)' }}>{total ?? '—'}</div>
      </div>
    })}
  </div>
}

function ClosingEndCard({ event, winner, winnerScore, scratchWinner, scratchWinnerScore, roll, animate }: ClosingEndCardProps) {
  type RevealStage = 0 | 1 | 2 | 3 | 4
  const [stage, setStage] = useState<RevealStage>(() => animate ? 0 : 4)
  const winnerName = winner?.player.full_name ?? 'Liekkipoika ei ratkennut'
  const points = winnerScore ? stableford(winnerScore) : null
  const strokes = winnerScore ? rawStrokes(winnerScore) : null
  const scratchStrokes = scratchWinnerScore ? rawStrokes(scratchWinnerScore) : null
  const holes = winnerScore ? compositionActualHoles(winnerScore) : compositionActualHoles(null)
  const winnerImage = winner ? (winner.player.avatar_url || playerImagePath(winner.player.full_name)) : null
  const [image, setImage] = useState(winnerImage)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setStage(animate ? 0 : 4)
  }, [animate, event.id, winner?.player_id])

  useEffect(() => {
    setImage(winnerImage)
    setImageFailed(false)
  }, [winnerImage])

  useEffect(() => {
    if (!animate) return
    const timers = [
      window.setTimeout(() => setStage(1), 700),
      window.setTimeout(() => setStage(2), 1900),
      window.setTimeout(() => setStage(3), 3300),
      window.setTimeout(() => setStage(4), 4700),
    ]
    return () => timers.forEach(timer => window.clearTimeout(timer))
  }, [animate])

  const revealed = (required: RevealStage) => stage >= required ? 'gala-closing-detail-in' : 'opacity-0'
  const eventDate = new Date(`${event.event_date}T00:00:00`).toLocaleDateString('fi-FI')

  return <div className="mx-auto flex h-full w-full max-w-[1840px] flex-col justify-between gap-5 py-3 xl:gap-7">
    <div className={`flex items-center justify-between gap-8 ${revealed(1)}`}>
      <div className="flex items-center gap-5">
        <LeagueLogo className="h-16 w-16 object-contain xl:h-20 xl:w-20" />
        <div>
          <div className="text-sm font-bold uppercase tracking-[.28em] text-white/45">Golf Company Invitational</div>
          <div className="mt-1 text-2xl font-black uppercase tracking-[.16em] text-white/80">Liekkipoika 2026</div>
        </div>
      </div>
      <div className="max-w-[38rem] text-right">
        <div className="text-xs font-black uppercase tracking-[.2em] text-white/40">{event.name}</div>
        <div className="mt-1 text-3xl font-black text-white/90 xl:text-4xl">{event.course?.name ?? 'Lake & Forest'}</div>
        <div className="mt-1 text-xl font-semibold text-white/65 xl:text-2xl">{eventDate}</div>
      </div>
    </div>

    <div className="grid min-h-0 grid-cols-[minmax(22rem,.82fr)_minmax(0,1.5fr)] gap-6 xl:gap-10">
      <section className={`min-w-0 ${revealed(2)}`}>
        <div className="overflow-hidden rounded-3xl border border-white/15 bg-[var(--bg-card)] shadow-2xl">
          <div className="relative h-[19rem] overflow-hidden bg-[var(--bg-dark)] xl:h-[23rem]">
            {image && !imageFailed
              ? <img src={image} alt="" onError={() => {
                const fallback = winner ? playerImagePath(winner.player.full_name) : null
                if (fallback && image !== fallback) setImage(fallback)
                else setImageFailed(true)
              }} className="h-full w-full object-cover" />
              : <div className="flex h-full items-center justify-center bg-[var(--league-primary)] text-6xl font-black text-[var(--bg-dark)]">{winnerName.slice(0, 2).toUpperCase()}</div>}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
            <div className="absolute bottom-5 left-6 right-6">
              <div className="text-sm font-black uppercase tracking-[.22em] text-white/65">Uusi Liekkipoika</div>
              <h1 className="mt-2 text-5xl font-black leading-none xl:text-7xl">{winnerName}</h1>
            </div>
          </div>
          <div className={`grid grid-cols-2 gap-4 border-t border-white/10 px-6 py-5 ${revealed(3)}`}>
            <div><div className="font-display text-6xl font-black leading-none text-[var(--league-primary)]">{points == null ? '—' : `${points}p`}</div><div className="mt-2 text-xs font-black uppercase tracking-[.18em] text-white/45">voittopisteet</div></div>
            <div><div className="font-display text-6xl font-black leading-none text-white">{strokes ?? '—'}</div><div className="mt-2 text-xs font-black uppercase tracking-[.18em] text-white/45">lyönnit</div></div>
          </div>
        </div>
      </section>

      <section className={`min-w-0 ${revealed(4)}`}>
        <ClosingScorecard holes={holes} />
        <div className="mt-4 flex items-center justify-between gap-5 rounded-2xl border border-white/10 bg-white/[.04] px-5 py-4">
          <div className="text-sm font-bold uppercase tracking-[.18em] text-white/45">Scratch-mestari</div>
          <div className="text-right text-3xl font-black text-white xl:text-4xl">
            <span>{scratchWinner?.player.full_name ?? '—'}</span>
            <span className="ml-3 whitespace-nowrap text-xl font-bold text-white/60 xl:text-2xl">· {scratchStrokes == null ? '—' : `${scratchStrokes} lyöntiä`}</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-[minmax(0,1.2fr)_minmax(16rem,.8fr)] gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[.04] px-5 py-4">
            <div className="text-xs font-black uppercase tracking-[.18em] text-white/40">Liekkipoika · 2018–{new Date(`${event.event_date}T00:00:00`).getFullYear()}</div>
            <div className="mt-3 grid grid-cols-3 gap-x-5 gap-y-1 text-sm text-white/70">
              {roll.map(item => <div key={item.year} className="flex min-w-0 gap-2"><span className="shrink-0 font-black text-white/40">{item.year}</span><span className="truncate">{item.name ?? '—'}</span></div>)}
            </div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-white p-4 text-center shadow-xl">
            <QRCodeSVG value="https://karaokelistat.fi/7269" size={220} bgColor="#ffffff" fgColor="#050607" level="H" includeMargin />
            <div className="mt-2 text-sm font-black uppercase tracking-[.12em] text-[#050607]">Karhu Pub setlist</div>
          </div>
        </div>
      </section>
    </div>
  </div>
}

function PresentationTestCard({ eventName, needsFullscreenStart, onStartFullscreen }: { eventName: string; needsFullscreenStart: boolean; onStartFullscreen: () => void }) {
  const bars = ['white', 'yellow', 'cyan', 'green', 'magenta', 'red', 'blue']
  const lowerBars = ['blue', 'black', 'magenta', 'black', 'cyan', 'black']
  return <main className="gala-test-card fixed inset-0 overflow-hidden bg-[#090a0b] text-white">
    <div className="gala-test-card-colour-bars" aria-hidden="true">
      {bars.map(color => <div key={color} className={`gala-test-card-bar gala-test-card-bar-${color}`} />)}
    </div>
    <div className="gala-test-card-lower" aria-hidden="true">
      <div className="gala-test-card-lower-bars">
        {lowerBars.map((color, index) => <div key={`${color}-${index}`} className={`gala-test-card-lower-bar gala-test-card-lower-bar-${color}`} />)}
      </div>
      <div className="gala-test-card-ramp">
        {Array.from({ length: 11 }, (_, index) => <div key={index} style={{ backgroundColor: `rgb(${index * 25.5} ${index * 25.5} ${index * 25.5})` }} />)}
      </div>
    </div>
    <div className="gala-test-card-centre">
      <div className="gala-test-card-logo-well">
        <LeagueLogo className="gala-test-card-logo" />
      </div>
      <div className="gala-test-card-kicker">SIGNAL CHECK · GALA ADMIN</div>
      <div className="gala-test-card-name">{eventName}</div>
    </div>
    <div className="gala-test-card-instructions">TEST CARD&nbsp;&nbsp;·&nbsp;&nbsp;→ ALOITA ESITYS</div>
    <div className="gala-test-card-frame" aria-hidden="true" />
    {needsFullscreenStart && <button type="button" onClick={onStartFullscreen} className="fixed left-1/2 top-8 z-10 -translate-x-1/2 border border-white/40 bg-black/80 px-5 py-3 text-xs font-bold tracking-[.16em] text-white shadow-xl">ALOITA KOKO NÄYTÖN ESITYS</button>}
  </main>
}

export default function AdminEventPresentation() {
  const { id } = useParams<{ id: string }>()
  const league = useLeague()
  const [data, setData] = useState<LoadedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [beatIndex, setBeatIndex] = useState(0)
  const [testCardVisible, setTestCardVisible] = useState(true)
  const [needsFullscreenStart, setNeedsFullscreenStart] = useState(false)
  const [animatedBeatId, setAnimatedBeatId] = useState<string | null>(null)
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward')
  const [transitionKind, setTransitionKind] = useState<'default' | 'black'>('default')
  const [transitionId, setTransitionId] = useState(0)
  const [openingQuestionRevealed, setOpeningQuestionRevealed] = useState(false)
  const [openingQuestionAnimate, setOpeningQuestionAnimate] = useState(false)
  const beatIndexRef = useRef(0)
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
    const closingYear = Number(event.event_date.slice(0, 4))
    const closingCurrentResult = historicalResults.find(result => result.year === closingYear) ?? null
    const closingPodiumQuestion = questions.find(question => questionKey(question) === 'podium_top3')
    const closingPodiumRanked = closingPodiumQuestion ? rankScoresForQuestion(closingPodiumQuestion, scores, resolverPlayers) : []
    const closingWinner = findEventPlayer(
      players,
      closingCurrentResult?.liekkipoika_winner_player_id ?? closingPodiumRanked[0]?.player_id,
      closingCurrentResult?.liekkipoika_winner ?? closingPodiumRanked[0]?.player?.full_name,
    )
    const closingWinnerScore = closingWinner ? scores.find(score => score.player_id === closingWinner.player_id) ?? null : null
    const closingScratchQuestion = questions.find(question => questionKey(question) === 'player_pick_best_scratch')
    const closingScratchResolution = closingScratchQuestion ? resolutionFor(closingScratchQuestion) : null
    const closingScratchRanked = closingScratchQuestion ? rankScoresForQuestion(closingScratchQuestion, scores, resolverPlayers) : []
    const closingScratchWinner = findEventPlayer(
      players,
      closingCurrentResult?.scratch_winner_player_id ?? (closingScratchResolution?.status === 'resolved' ? String(closingScratchResolution.answer) : closingScratchRanked[0]?.player_id),
      closingCurrentResult?.scratch_winner ?? closingScratchRanked[0]?.player?.full_name,
    )
    const closingScratchWinnerScore = closingScratchWinner ? scores.find(score => score.player_id === closingScratchWinner.player_id) ?? null : null
    const closingWinnerName = closingWinner?.player.full_name ?? closingCurrentResult?.liekkipoika_winner ?? null
    const historicalByYear = new Map(historicalResults.map(result => [result.year, result]))
    const closingRoll = Array.from({ length: Math.max(0, closingYear - 2017) }, (_, index) => {
      const year = 2018 + index
      const result = historicalByYear.get(year)
      const player = result ? findEventPlayer(players, result.liekkipoika_winner_player_id, result.liekkipoika_winner) : null
      return { year, name: year === closingYear ? (closingWinnerName ?? player?.player.full_name ?? null) : (result?.liekkipoika_winner ?? player?.player.full_name ?? null) }
    })

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
      content: <EventPlayerRoster players={players} honours={playerHonours} animate={animatedBeatId === 'opening-players'} />,
    })

    const openingData = openingStrokeData(scores)
    const openingLeaders = openingStrokeLeaders(scores, players)
    list.push({
      id: 'opening-question',
      next: openingQuestionRevealed ? 'Yhdistelmäkortti' : 'Vastaus: lyöntimäärä',
      content: <div className="mx-auto flex min-h-[31rem] w-full max-w-6xl flex-col items-center text-center">
        <div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Kysymys yleisölle</div>
        <h2 className="mt-8 text-8xl font-black leading-[.95]">Montako lyöntiä {players.length} pelaajaa löi yhteensä?</h2>
        <div className="mt-8 flex min-h-[15rem] flex-col items-center justify-start">
          {openingQuestionRevealed && <div className="text-center">
            <div className="text-[10rem] font-black leading-none" style={{ color: 'var(--league-primary)' }}><AnimatedCount target={openingData.total} animate={openingQuestionAnimate} delay={0} duration={1000} /></div>
            <div className={`mt-5 text-4xl text-white/65 ${openingQuestionAnimate ? 'gala-opening-answer-label-animate' : ''}`}>lyöntiä kirjatuista väylistä</div>
            <OpeningStrokeStats data={openingData} playerCount={scores.length} animate={openingQuestionAnimate} />
          </div>}
        </div>
      </div>,
    })
    const combinedHoles = combinedScorecardHoles(scores)
    const inferredCoursePar = combinedHoles.every(hole => hole.par != null) ? combinedHoles.reduce((sum, hole) => sum + hole.par!, 0) : null
    const combinedCoursePar = event.course?.par_total ?? inferredCoursePar
    list.push({
      id: 'opening-composite-intro',
      next: 'Yhdistelmäkortin väylät',
      content: <div className="mx-auto flex w-full max-w-6xl items-center justify-center gap-16 text-center"><div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">KENTÄN YHDISTELMÄKORTTI</div><h2 className="mt-7 text-8xl font-black leading-[.95]">Paras tulos jokaiselta väylältä</h2><div className="mt-8 text-4xl text-white/65">{event.course?.name ?? 'Kenttä'} · Par {combinedCoursePar ?? '—'}</div><div className="mt-4 text-2xl text-white/40">Numerot ilman pelaajien nimiä</div></div></div>,
    })
    list.push({
      id: 'opening-composite-scorecard',
      next: 'Lyöntityyppien jakauma',
      content: <CombinedScorecardBeat holes={combinedHoles} courseName={event.course?.name ?? 'Kenttä'} coursePar={combinedCoursePar} animate={animatedBeatId === 'opening-composite-scorecard'} />,
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
      const isPlayerPick = ['player_pick_best_front', 'player_pick_best_back'].includes(questionKey(question))
      const next = index + 1 < safeQuestions.length ? `Seuraava kysymys: ${questionTitle(safeQuestions[index + 1])}` : nextAfterSafe
      if (isYesNo) {
        const base = `safe-${question.id}`
        list.push({ id: `${base}-question`, next: `Veikkausjakauma: ${questionTitle(question)}`, content: <AccumulatingYesNoBeat question={question} questionNumber={index + 1} questionTotal={safeQuestions.length} state={1} bets={bets} resolution={resolution} participants={participants} players={resolverPlayers} eventPlayers={players} honours={playerHonours} animateDistribution={false} /> })
        list.push({ id: `${base}-bets`, next: `Ratkaisu: ${questionTitle(question)}`, content: <AccumulatingYesNoBeat question={question} questionNumber={index + 1} questionTotal={safeQuestions.length} state={2} bets={bets} resolution={resolution} participants={participants} players={resolverPlayers} eventPlayers={players} honours={playerHonours} animateDistribution={animatedBeatId === `${base}-bets`} /> })
        list.push({ id: `${base}-ruling`, next, content: <AccumulatingYesNoBeat question={question} questionNumber={index + 1} questionTotal={safeQuestions.length} state={3} bets={bets} resolution={resolution} participants={participants} players={resolverPlayers} eventPlayers={players} honours={playerHonours} animateDistribution={false} animateRuling={animatedBeatId === `${base}-ruling`} /> })
      } else if (isPlayerPick) {
        const base = `safe-${question.id}`
        list.push({ id: `${base}-question`, next: `Veikkausjakauma: ${questionTitle(question)}`, content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Veikkaus</div><h2 className="mt-7 max-w-6xl text-8xl font-black leading-[.95]">{questionTitle(question)}</h2><div className="mt-8 text-3xl text-white/45">Kysymys {index + 1} / {safeQuestions.length}</div></div> })
        list.push({ id: `${base}-bets`, next: `Ratkaisu: ${questionTitle(question)}`, content: <div className="w-full"><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Miten veikattiin</div><h2 className="mt-5 max-w-6xl text-5xl font-black">{questionTitle(question)}</h2><div className="mt-10 w-full"><BetDistribution question={question} bets={bets} players={resolverPlayers} participants={participants} eventPlayers={players} honours={playerHonours} animate={animatedBeatId === `${base}-bets`} /></div></div> })
        list.push({ id: `${base}-ruling`, next, content: <AccumulatingPlayerPickRuling question={question} questionNumber={index + 1} questionTotal={safeQuestions.length} bets={bets} resolution={resolution} participants={participants} players={resolverPlayers} eventPlayers={players} honours={playerHonours} animateDistribution={false} animateRuling={animatedBeatId === `${base}-ruling`} /> })
      } else if (questionKey(question) === 'composition_player_line') {
        const base = `safe-${question.id}`
        const targetId = String(question.parameters.player_id ?? question.parameters.target_player_id ?? '')
        const target = players.find(item => item.player_id === targetId) ?? null
        const score = scores.find(item => item.player_id === targetId) ?? null
        const honours = target ? playerHonours.get(target.player_id) ?? emptyHonours() : emptyHonours()
        list.push({ id: `${base}-question`, next: 'Tuloskortin etuyhdeksikkö', content: <CompositionPresentationBeat state={1} question={question} event={event} target={target} score={score} bets={bets} participants={participants} honours={honours} animate={animatedBeatId === `${base}-question`} /> })
        list.push({ id: `${base}-front`, next: 'Tuloskortin takayhdeksikkö', content: <CompositionPresentationBeat state={2} question={question} event={event} target={target} score={score} bets={bets} participants={participants} honours={honours} animate={animatedBeatId === `${base}-front`} /> })
        list.push({ id: `${base}-back`, next, content: <CompositionPresentationBeat state={3} question={question} event={event} target={target} score={score} bets={bets} participants={participants} honours={honours} animate={animatedBeatId === `${base}-back`} /> })
      } else {
        list.push({ id: `safe-${question.id}-question`, next: `Veikkausjakauma: ${questionTitle(question)}`, content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Veikkaus</div><h2 className="mt-7 max-w-6xl text-8xl font-black leading-[.95]">{questionTitle(question)}</h2><div className="mt-8 text-3xl text-white/45">Kysymys {index + 1} / {safeQuestions.length}</div></div> })
        list.push({ id: `safe-${question.id}-bets`, next: `Ratkaisu: ${questionTitle(question)}`, content: <div className="w-full"><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Miten veikattiin</div><h2 className="mt-5 max-w-6xl text-5xl font-black">{questionTitle(question)}</h2><div className="mt-10 w-full"><BetDistribution question={question} bets={bets} players={resolverPlayers} participants={participants} eventPlayers={players} honours={playerHonours} animate={animatedBeatId === `safe-${question.id}-bets`} /></div></div> })
        list.push({ id: `safe-${question.id}-ruling`, next, content: <div><div className="mt-10"><Ruling question={question} resolution={resolution} bets={bets} participants={participants} players={resolverPlayers} eventPlayers={players} honours={playerHonours} /></div></div> })
      }
    })

    const scratchQuestion = questions.find(question => questionKey(question) === 'player_pick_best_scratch')
    if (scratchQuestion) {
      const resolution = resolutionFor(scratchQuestion)
      const ranked = rankScoresForQuestion(scratchQuestion, scores, resolverPlayers)
      list.push({ id: 'scratch-question', next: 'Scratchin veikkausjakauma', content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Scratch</div><h2 className="mt-7 text-8xl font-black">Kuka voittaa scratchin?</h2></div> })
      list.push({ id: 'scratch-bets', next: 'Scratch #3', content: <div className="w-full"><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Miten veikattiin</div><div className="mt-10 w-full"><BetDistribution question={scratchQuestion} bets={bets} players={resolverPlayers} participants={participants} eventPlayers={players} honours={playerHonours} animate={animatedBeatId === 'scratch-bets'} /></div></div> })
      for (const revealedCount of [1, 2, 3] as const) {
        list.push({ id: `scratch-podium-${revealedCount}`, next: revealedCount < 3 ? `Scratch #${revealedCount === 1 ? 2 : 1}` : 'Ketkä osuivat scratch-voittajaan?', content: <PodiumPresentationBeat rank={ranked} mode="scratch" revealedCount={revealedCount} honours={playerHonours} animate={animatedBeatId === `scratch-podium-${revealedCount}`} /> })
      }
      const winners = resolution.status === 'resolved' ? bets.filter(bet => bet.question_id === scratchQuestion.id && scoreAnswer(scratchQuestion, bet.answer, resolution) > 0) : []
      list.push({ id: 'scratch-correct', next: hasPodium ? 'Liekkipaita-veikkaus' : 'Lopputulokset', content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Scratch-veikkaus</div>{resolution.status === 'unresolved' ? <div className="mt-12">{unresolvedReveal(resolution.reason)}</div> : <><div className="mt-8 text-7xl font-black" style={{ color: 'var(--league-primary)' }}>{winners.length} oikein</div><div className="mt-6 max-w-5xl text-4xl text-white/65">{winners.length ? winners.map(bet => participantLabel(bet.participant_id, participants)).join(' · ') : 'Kukaan ei saanut pistettä'}</div></>}</div> })
    }

    const podiumQuestion = questions.find(question => questionKey(question) === 'podium_top3')
    if (podiumQuestion) {
      const ranked = rankScoresForQuestion(podiumQuestion, scores, resolverPlayers)
      const totalQuestion = questions.find(question => questionKey(question) === 'player_pick_best_total')
      const totalResolution = totalQuestion ? resolutionFor(totalQuestion) : null
      const totalWinners = totalQuestion && totalResolution ? bets.filter(bet => bet.question_id === totalQuestion.id && scoreAnswer(totalQuestion, bet.answer, totalResolution) > 0) : []
      const totalDetail = totalQuestion ? totalResolution?.status === 'resolved' ? <><div>Paras kokonaispistemäärä: {answerText(totalQuestion, totalResolution.answer, resolverPlayers)}</div><div className="mt-3">{totalWinners.length ? `${totalWinners.length} oikein · ${totalWinners.map(bet => participantLabel(bet.participant_id, participants)).join(', ')}` : 'Kukaan ei saanut pisteitä'}</div></> : <div>Paras kokonaispistemäärä: Ei ratkennut</div> : null
      list.push({ id: 'podium-question', next: 'Liekkipaita-veikkaukset', content: <div><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Liekkipaita</div><h2 className="mt-7 text-8xl font-black">Ketkä ovat kolme parasta?</h2></div> })
      list.push({ id: 'podium-bets', next: 'Podiumin #3', content: <div className="w-full"><div className="text-3xl font-semibold uppercase tracking-[.2em] text-white/45">Miten veikattiin</div><div className="mt-10 w-full"><BetDistribution question={podiumQuestion} bets={bets} players={resolverPlayers} participants={participants} eventPlayers={players} honours={playerHonours} animate={animatedBeatId === 'podium-bets'} /></div></div> })
      for (const revealedCount of [1, 2, 3] as const) {
        list.push({ id: `podium-podium-${revealedCount}`, next: revealedCount < 3 ? (revealedCount === 1 ? 'Podiumin #2' : 'Podiumin #1 · Liekkipaita') : 'Tulosveikkaus voittaja', content: <PodiumPresentationBeat rank={ranked} mode="liekkipaita" revealedCount={revealedCount} honours={playerHonours} animate={animatedBeatId === `podium-podium-${revealedCount}`} detail={totalDetail} /> })
      }
    }

    const leaderboard: BettingLeaderboardEntry[] = participants.map(participant => ({ name: participant.display_name, points: bets.filter(bet => bet.participant_id === participant.id).reduce((sum, bet) => {
      const question = questions.find(item => item.id === bet.question_id)
      return question ? sum + scoreAnswer(question, bet.answer, resolutionFor(question)) : sum
    }, 0), submittedAt: participant.submitted_at })).sort((a, b) => b.points - a.points || a.submittedAt.localeCompare(b.submittedAt))
    list.push({ id: 'leaderboard', next: leaderboard.length ? 'Tulosveikkaus voittaja' : 'Lopetus', content: <BettingLeaderboardBeat leaderboard={leaderboard} animate={animatedBeatId === 'leaderboard' && transitionDirection === 'forward'} /> })
    if (leaderboard.length) list.push({ id: 'leaderboard-winner', next: 'Lopetus', content: <BettingLeaderboardBeat leaderboard={leaderboard} animate={false} closing /> })
    list.push({ id: 'closing', next: 'Esityksen viimeinen dia', content: <ClosingEndCard event={event} winner={closingWinner} winnerScore={closingWinnerScore} scratchWinner={closingScratchWinner} scratchWinnerScore={closingScratchWinnerScore} roll={closingRoll} animate={animatedBeatId === 'closing' && transitionDirection === 'forward'} /> })
    return list
  }, [data, resolverPlayers, animatedBeatId, transitionDirection, openingQuestionRevealed, openingQuestionAnimate])

  const currentBeatId = beats[beatIndex]?.id ?? null
  function navigateToBeat(nextIndex: number) {
    const boundedIndex = Math.min(Math.max(0, nextIndex), Math.max(0, beats.length - 1))
    const previousIndex = beatIndexRef.current
    if (boundedIndex === previousIndex) return
    const nextBeatId = beats[boundedIndex]?.id ?? null
    beatIndexRef.current = boundedIndex
    setTransitionDirection(boundedIndex > previousIndex ? 'forward' : 'backward')
    setTransitionKind(nextBeatId === 'scratch-podium-1' || nextBeatId === 'podium-podium-1' ? 'black' : 'default')
    setTransitionId(current => current + 1)
    setAnimatedBeatId(nextBeatId && boundedIndex > previousIndex && !seenBeatIds.current.has(nextBeatId) ? nextBeatId : null)
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
    if (currentBeatId !== 'opening-distribution' || transitionDirection !== 'forward') return

    // The bars and the player-card leaders are two beats of the same slide.
    // Move between those beats automatically; the admin still advances from
    // the revealed player cards to the next slide.
    const timer = window.setTimeout(() => {
      navigateToBeat(beatIndexRef.current + 1)
    }, 3200)

    return () => window.clearTimeout(timer)
  }, [currentBeatId, transitionDirection])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault()
        if (testCardVisible) {
          setTestCardVisible(false)
          setTransitionDirection('forward')
          setTransitionId(current => current + 1)
          return
        }
        if (currentBeatId === 'opening-question' && !openingQuestionRevealed) {
          setOpeningQuestionRevealed(true)
          setOpeningQuestionAnimate(!openingQuestionSeen.current)
          openingQuestionSeen.current = true
          return
        }
        if (currentBeatId === 'opening-question') setOpeningQuestionAnimate(false)
        navigateToBeat(beatIndexRef.current + 1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (testCardVisible) return
        if (currentBeatId === 'opening-title') {
          setTestCardVisible(true)
          setAnimatedBeatId(null)
          setTransitionDirection('backward')
          setTransitionId(current => current + 1)
          return
        }
        if (currentBeatId === 'opening-question' && openingQuestionRevealed) {
          setOpeningQuestionRevealed(false)
          setOpeningQuestionAnimate(false)
          return
        }
        navigateToBeat(beatIndexRef.current - 1)
      } else if (event.key === 'Escape' && document.fullscreenElement) {
        event.preventDefault()
        void document.exitFullscreen()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [beatIndex, beats.length, currentBeatId, openingQuestionRevealed, testCardVisible])

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
  if (testCardVisible) return <PresentationTestCard eventName={data.event.name} needsFullscreenStart={needsFullscreenStart} onStartFullscreen={startFullscreen} />
  return <main className="fixed inset-0 overflow-hidden bg-[var(--bg-dark)] text-white" style={{ fontFamily: 'var(--font-body)' }}>
    <div className="absolute inset-0 opacity-[.035]" style={{ backgroundImage: 'var(--league-logo)', backgroundSize: '300px 300px' }} />
    <div className="relative flex h-full flex-col px-12 py-10 xl:px-20 xl:py-14">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-5"><LeagueLogo className="h-12 w-12 object-contain" /><span className="text-xl font-semibold uppercase tracking-[.2em] text-white/45">{league.name}</span></div>
        <div className="text-lg text-white/35">{beatIndex + 1} / {beats.length}</div>
      </header>
      <section key={`${beat.id}-${transitionId}`} className="flex min-h-0 flex-1 items-center py-8">
        <div className={`flex h-full w-full items-center ${transitionId === 0 ? '' : transitionKind === 'black' ? 'gala-slide-content-black' : transitionDirection === 'backward' ? 'gala-slide-content-backward' : 'gala-slide-content-forward'}`}>
          {beat.content}
        </div>
      </section>
      <footer className="flex items-end justify-between text-sm text-white/30">
        <span>← takaisin · → / välilyönti eteen</span>
        <span>{beat.id === 'closing' ? 'Viimeinen dia · pysyy tässä' : `Seuraavaksi: ${beat.next}`}</span>
      </footer>
    </div>
    {needsFullscreenStart && <button type="button" onClick={startFullscreen} className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-white/20 bg-black/75 px-5 py-3 text-sm text-white/70 shadow-xl backdrop-blur">Aloita koko näytön esitys</button>}
  </main>
}
