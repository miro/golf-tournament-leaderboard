import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLeague } from '../contexts/LeagueContext'
import type { Player } from '../lib/database.types'
import { normalizeEventQuestion, type EventPlayer, type EventQuestion, type EventRow } from '../lib/eventQueries'
import InitialsAvatar from '../components/shared/InitialsAvatar'
import { playerImagePath } from '../lib/playerImage'
import { getCurrentSeason, getLeaderboard } from '../lib/queries'
import CompositionQuestion from './proto/bet/CompositionQuestion'
import { COMPOSITION_HOLE_PARS, compositionPoints, initialCompositionForHandicap, lockComposition, type CompositionAnswer as PrototypeCompositionAnswer, type CompositionLineAnswer as PrototypeCompositionLineAnswer } from './proto/bet/types'
import CombinedPlayerPickScreen, { type BetKey, type CombinedAssignments } from './proto/bet/CombinedPlayerPickScreen'

const db = supabase as any

type Identity = { display_name: string; pin: string; identity_token: string }
type Submission = { submitted: true; participant_id: string; submitted_at: string }
type BettingDraft = { answers: Record<string, Answer>; current_question: number }
type PodiumAnswer = { first: string | null; second: string | null; third: string | null }
type CompositionAnswer = PrototypeCompositionAnswer | PrototypeCompositionLineAnswer
type Answer = number | boolean | string | PodiumAnswer | CompositionAnswer
type BetRow = { id: string; participant_id: string; question_id: string; answer: Answer; points_awarded: number | null }
type Participant = {
  id: string; event_id: string; display_name: string; pin: string | null; identity_token: string | null
  bettor_account_id: string | null; is_event_player: boolean; submitted_at: string; total_points_awarded: number
}
type ResultData = { current: Participant | null; bets: BetRow[]; participants: Participant[] }
type HoleGuide = { par: number; stroke_index: number }
type PageStage = 'identity' | 'returning' | 'wrong-code' | 'questions' | 'complete' | 'results' | 'message' | 'submit-error'

const IDENTITY_KEY = 'betting_identity'
const submissionKey = (eventId: string) => `betting_submission_${eventId}`
const draftKey = (eventId: string) => `betting_draft_${eventId}`
const COMBINED_KEY_BY_QUESTION: Record<string, BetKey> = {
  player_pick_best_total: 'best_total',
  player_pick_best_front: 'best_front',
  player_pick_best_back: 'best_back',
  player_pick_best_scratch: 'best_scratch',
}

function readStorage<T>(key: string): T | null {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage is optional */ }
}

function clearIdentity() {
  try { window.localStorage.removeItem(IDENTITY_KEY) } catch { /* storage is optional */ }
}

function clearDraft(eventId: string | null) {
  if (!eventId) return
  try { window.localStorage.removeItem(draftKey(eventId)) } catch { /* storage is optional */ }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function playerFrom(parameters: Record<string, unknown>, key: string, players: Player[]) {
  const id = String(parameters[key] ?? '')
  return players.find(player => player.id === id) ?? null
}

function isCompositionAnswer(answer: Answer | null | undefined): answer is CompositionAnswer {
  return Boolean(answer && typeof answer === 'object' && 'holes' in answer)
}

function questionTitle(question: EventQuestion, players: Player[]) {
  const key = question.question_type.key
  const target = playerFrom(question.parameters, 'player_id', players) ?? playerFrom(question.parameters, 'target_player_id', players)
  if (key === 'slider_player_points') return target ? `Kuinka monta pistettä ${target.full_name} tekee?` : 'Kuinka monta pistettä kohdepelaaja tekee?'
  if (key === 'composition_player_line') return target ? `Miten ${target.full_name} pelaa kierroksen?` : 'Miten kohdepelaaja pelaa kierroksen?'
  if (question.question_text?.trim()) return question.question_text
  if (key === 'player_pick_best_total') return 'Kuka tekee parhaan tuloksen?'
  if (key === 'player_pick_best_front') return 'Kuka tekee parhaan etuysin?'
  if (key === 'player_pick_best_back') return 'Kuka tekee parhaan takaysin?'
  if (key === 'player_pick_best_scratch') return 'Kuka tekee parhaan scratch-tuloksen?'
  if (key === 'yes_no_birdie') return 'Tuleeko kierroksella birdie?'
  if (key === 'yes_no_zero') return 'Tuleeko kierroksella nollapisteen reikä?'
  if (key === 'yes_no_four_birdies') return 'Tuleeko kierroksella neljä birdie-reikää?'
  if (key === 'yes_no_head_to_head') return 'Kumpi voittaa kaksintaistelun?'
  if (key === 'podium_top3') return 'Ketkä ovat kierroksen kolme parasta?'
  if (key === 'beat_the_leader') return 'Kuka päihittää heidät?'
  return question.question_type.display_name
}

function answerLabel(question: EventQuestion, answer: Answer | null | undefined, players: Player[]) {
  if (answer == null) return '–'
  const key = question.question_type.key
  if (key === 'slider_player_points') return `${answer}p`
  if (key === 'composition_player_line' && isCompositionAnswer(answer)) {
    const target = playerFrom(question.parameters, 'player_id', players) ?? playerFrom(question.parameters, 'target_player_id', players)
    const summary = 'summary' in answer ? answer.summary : null
    const stablefordPoints = summary && typeof summary.stableford_points === 'number' ? summary.stableford_points : null
    if (stablefordPoints != null) {
      const stablefordDelta = 36 - stablefordPoints
      const comparison = stablefordDelta === 0 ? 'E' : stablefordDelta > 0 ? `+${stablefordDelta}` : String(stablefordDelta)
      return `${target?.full_name ?? 'Pelaaja'} · ${comparison} (${stablefordPoints}p)`
    }
    const predictedPoints = summary && typeof summary.predicted_points === 'number' ? summary.predicted_points : compositionPoints(answer)
    return `${target?.full_name ?? 'Pelaaja'} · ${predictedPoints}p`
  }
  if (key === 'yes_no_head_to_head') return players.find(player => player.id === answer)?.full_name ?? '–'
  if (key.startsWith('yes_no_')) return answer === true ? 'Kyllä' : 'Ei'
  if (key === 'podium_top3') {
    const podium = answer as PodiumAnswer
    return `1. ${players.find(p => p.id === podium.first)?.full_name ?? '–'} · 2. ${players.find(p => p.id === podium.second)?.full_name ?? '–'} · 3. ${players.find(p => p.id === podium.third)?.full_name ?? '–'}`
  }
  return players.find(player => player.id === answer)?.full_name ?? String(answer)
}

function MainShell({ children, onLogout }: { children: ReactNode; onLogout?: () => void }) {
  return <main className="min-h-screen px-4 py-7 sm:py-10" style={{ background: 'var(--bg-dark)', color: 'white' }}><div className="mx-auto w-full max-w-[560px]">{children}{onLogout && <div className="mt-8 flex justify-center"><button type="button" onClick={onLogout} className="px-2 py-1 text-[11px] text-white/40 transition-colors hover:text-white/70">Kirjaudu ulos</button></div>}</div></main>
}

function PageMessage({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <MainShell><div className="flex min-h-[80vh] flex-col items-center justify-center text-center"><div className="mb-7 text-5xl" aria-hidden="true">⛳</div><h1 className="font-display text-3xl font-extrabold text-white">{children}</h1>{action && <div className="mt-8 w-full">{action}</div>}</div></MainShell>
}

function LogoHeader({ event }: { event: EventRow }) {
  const league = useLeague()
  return <header className="mb-9 text-center"><img src={league.logo_url ?? '/gc-logo.png'} alt={league.name} className="mx-auto mb-4 h-10 w-auto" style={{ filter: 'invert(1)' }} /><h1 className="font-display text-[22px] font-extrabold text-white">{event.name}</h1><p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{formatDate(event.event_date)}</p></header>
}

function TextInput({ label, value, onChange, placeholder, autoFocus = false, type = 'text' }: { label?: string; value: string; onChange: (value: string) => void; placeholder: string; autoFocus?: boolean; type?: string }) {
  return <label className="block">{label && <span className="mb-2 block font-display text-lg font-semibold text-white">{label}</span>}<input type={type} autoFocus={autoFocus} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl px-4 py-3 text-white outline-none transition-colors placeholder:opacity-70 focus:border-[var(--league-primary)]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-muted)', fontSize: 20 }} /></label>
}

function ParticipantCodeFields({ enabled, onEnabledChange, value, onChange }: { enabled: boolean; onEnabledChange: (enabled: boolean) => void; value: string; onChange: (value: string) => void }) {
  return <div className="mt-7"><button type="button" onClick={() => onEnabledChange(!enabled)} className="flex w-full items-center gap-3 text-left text-[15px] text-white"><span className="flex h-5 w-5 items-center justify-center rounded border" style={{ borderColor: enabled ? 'var(--league-primary)' : 'var(--border-accent)', background: enabled ? 'var(--league-primary)' : 'transparent', color: 'var(--bg-dark)' }}>{enabled ? '✓' : ''}</span><span>Olen tapahtuman pelaaja</span><span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{enabled ? '−' : '+'}</span></button>{enabled && <div className="mt-4"><TextInput label="Syötä osallistujakoodi" value={value} onChange={onChange} placeholder="Koodi" /><p className="mt-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>Saat koodin tapahtuman järjestäjältä</p></div>}</div>
}

function IdentityForm({ event, initialIdentity, onSubmit, busy }: { event: EventRow; initialIdentity?: Identity | null; onSubmit: (name: string, pin: string, code: string) => void; busy: boolean }) {
  const [name, setName] = useState(initialIdentity?.display_name ?? '')
  const [pin, setPin] = useState(initialIdentity?.pin ?? '')
  const [code, setCode] = useState('')
  const [isPlayer, setIsPlayer] = useState(false)
  const ready = name.trim().length > 0 && /^\d{4}$/.test(pin)
  return <MainShell><LogoHeader event={event} /><div className="space-y-7"><section><h2 className="mb-3 font-display text-lg font-semibold text-white">Mikä on nimesi?</h2><TextInput value={name} onChange={setName} placeholder="Kirjoita nimesi" autoFocus={!initialIdentity} /></section><section><h2 className="font-display text-lg font-semibold text-white">Valitse 4-numeroinen PIN-koodi</h2><p className="mb-3 mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>Muista tämä — tarvitset sitä myöhemmin</p><input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="_ _ _ _" className="w-full rounded-xl px-4 py-3 text-center font-display font-extrabold tracking-[0.3em] text-white outline-none placeholder:opacity-70 focus:border-[var(--league-primary)]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-muted)', fontSize: 32 }} aria-label="4-numeroinen PIN-koodi" /></section><ParticipantCodeFields enabled={isPlayer} onEnabledChange={setIsPlayer} value={code} onChange={setCode} /><button type="button" disabled={!ready || busy} onClick={() => onSubmit(name.trim(), pin, isPlayer ? code.trim() : '')} className="w-full rounded-xl py-3 font-display text-lg font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-30" style={{ background: 'var(--league-primary)', color: 'var(--bg-dark)' }}>{busy ? 'Ladataan…' : 'ALOITA VEIKKAAMINEN'}</button></div></MainShell>
}

function ReturningIdentity({ event, identity, onContinue, onChangeIdentity, onLogout, busy }: { event: EventRow; identity: Identity; onContinue: (code: string) => void; onChangeIdentity: () => void; onLogout: () => void; busy: boolean }) {
  const [code, setCode] = useState('')
  const [isPlayer, setIsPlayer] = useState(false)
  return <MainShell onLogout={onLogout}><LogoHeader event={event} /><h1 className="mb-6 text-center font-display text-[22px] font-extrabold text-white">Tervetuloa takaisin! 👋</h1><div className="rounded-2xl p-5 text-center" style={{ background: 'color-mix(in srgb, var(--league-primary) 12%, transparent)', border: '2px solid var(--league-primary)' }}><div className="font-display text-4xl font-black tracking-[0.3em]" style={{ color: 'var(--league-primary)' }}>PIN: {identity.pin}</div><div className="mt-2 text-[22px] font-bold text-white">{identity.display_name}</div></div><div className="mt-6 space-y-3"><button type="button" disabled={busy} onClick={() => onContinue(isPlayer ? code.trim() : '')} className="w-full rounded-xl py-3 font-display text-lg font-bold disabled:opacity-30" style={{ background: 'var(--league-primary)', color: 'var(--bg-dark)' }}>{busy ? 'Ladataan…' : 'Jatka tällä tunnuksella →'}</button><button type="button" onClick={onChangeIdentity} className="w-full rounded-xl border py-3 font-display font-semibold text-white" style={{ borderColor: 'var(--border-accent)' }}>Vaihda tunnusta</button></div><ParticipantCodeFields enabled={isPlayer} onEnabledChange={setIsPlayer} value={code} onChange={setCode} /></MainShell>
}

function WrongCodeNotice({ onRetry, onContinue, onLogout }: { onRetry: () => void; onContinue: () => void; onLogout: () => void }) {
  return <MainShell onLogout={onLogout}><div className="flex min-h-[80vh] flex-col items-center justify-center text-center"><div className="mb-5 text-6xl" aria-hidden="true">⚠️</div><h1 className="font-display text-[22px] font-extrabold text-white">Osallistujakoodi ei täsmännyt</h1><p className="mt-4 max-w-sm text-[15px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>Syöttämäsi osallistujakoodi ei täsmännyt.<br />Sinut on merkitty katsojaksi, mutta voit silti osallistua veikkaukseen.</p><div className="mt-8 w-full space-y-3"><button type="button" onClick={onRetry} className="w-full rounded-xl border py-3 font-display font-semibold text-white" style={{ borderColor: 'var(--border-accent)' }}>Kokeile uudelleen</button><button type="button" onClick={onContinue} className="w-full rounded-xl py-3 font-display text-lg font-bold" style={{ background: 'var(--league-primary)', color: 'var(--bg-dark)' }}>JATKA VEIKKAAMISTA →</button></div></div></MainShell>
}

function PlayerCard({ player, selected = false, confirming = false, onClick, rank, points, compact = false, hcpOverride }: { player: Player; selected?: boolean; confirming?: boolean; onClick?: () => void; rank?: unknown; points?: unknown; compact?: boolean; hcpOverride?: number | null }) {
  const [failed, setFailed] = useState(false)
  const image = player.avatar_url ?? playerImagePath(player.full_name)
  const body = <><div className={`relative overflow-hidden ${compact ? 'h-16' : 'h-28'}`} style={{ background: 'var(--bg-dark)' }}>{failed ? <div className="flex h-full items-center justify-center"><InitialsAvatar name={player.full_name} size={compact ? 42 : 64} color="var(--league-primary)" /></div> : <img src={image} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />}<div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /></div><div className="p-3 text-left"><div className="truncate font-display font-bold text-white">{player.full_name}</div><div className="mt-1 flex gap-2 text-xs" style={{ color: 'var(--text-muted)' }}><span>HCP {hcpOverride ?? player.hcp_fallback ?? '–'}</span>{rank != null && <span>#{String(rank)}</span>}{points != null && <span>{String(points)}p</span>}</div></div></>
  if (!onClick) return <div className="overflow-hidden rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-muted)' }}>{body}</div>
  return <button type="button" onClick={onClick} className={`w-full overflow-hidden rounded-xl text-left transition-all ${confirming ? 'animate-player-pick-confirm' : ''}`} style={{ background: selected ? 'color-mix(in srgb, var(--league-primary) 14%, var(--bg-card))' : 'var(--bg-card)', border: `${selected ? 2 : 1}px solid ${selected ? 'var(--league-primary)' : 'var(--border-muted)'}` }}>{body}</button>
}

function PlayerCarousel({ players, selectedId, confirming = false, onSelect, stats, seasonalHandicaps = {} }: { players: Player[]; selectedId: string | null; confirming?: boolean; onSelect: (id: string) => void; stats?: Record<string, { rank?: unknown; points?: unknown }>; seasonalHandicaps?: Record<string, number> }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [center, setCenter] = useState(0)
  const sorted = [...players].sort((a, b) => (seasonalHandicaps[a.id] ?? a.hcp_fallback ?? 99) - (seasonalHandicaps[b.id] ?? b.hcp_fallback ?? 99))
  function updateCenter() {
    const element = scroller.current
    if (!element) return
    const middle = element.scrollLeft + element.clientWidth / 2
    let best = 0; let distance = Number.POSITIVE_INFINITY
    Array.from(element.children).forEach((child, index) => { const item = child as HTMLElement; const itemMiddle = item.offsetLeft + item.offsetWidth / 2; if (Math.abs(itemMiddle - middle) < distance) { best = index; distance = Math.abs(itemMiddle - middle) } })
    setCenter(best)
  }
  return <div><div ref={scroller} onScroll={updateCenter} className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18%] py-2"><div className="w-1 shrink-0" />{sorted.map((player, index) => { const selected = selectedId === player.id; const distance = Math.abs(center - index); return <div key={player.id} className="w-[68%] shrink-0 snap-center transition-all" style={{ opacity: distance > 1 ? 0.55 : 1, transform: `scale(${distance === 0 ? 1 : 0.92})` }}><PlayerCard player={player} hcpOverride={seasonalHandicaps[player.id]} selected={selected} confirming={selected && confirming} onClick={() => { onSelect(player.id); (scroller.current?.children[index + 1] as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }) }} rank={stats?.[player.id]?.rank} points={stats?.[player.id]?.points} /></div>})}<div className="w-1 shrink-0" /></div><p className="mt-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>Selaa pelaajia ja napauta valintaasi</p></div>
}

function PodiumPicker({ players, value, onChange, seasonalHandicaps = {} }: { players: Player[]; value: PodiumAnswer; onChange: (value: PodiumAnswer) => void; seasonalHandicaps?: Record<string, number> }) {
  const [recentSelection, setRecentSelection] = useState<{ playerId: string; slot: number } | null>(null)
  const [departingSelection, setDepartingSelection] = useState<{ playerId: string; slot: number; phase: 'card' | 'medal' } | null>(null)
  const selectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const placementTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slots = [value.first, value.second, value.third]
  const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}']

  useEffect(() => () => {
    if (selectionTimer.current) clearTimeout(selectionTimer.current)
    if (placementTimer.current) clearTimeout(placementTimer.current)
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
  }, [])

  const remove = (index: number) => {
    const next = [...slots]
    next[index] = null
    onChange({ first: next[0], second: next[1], third: next[2] })
  }

  const selectPlayer = (playerId: string) => {
    const slot = slots.findIndex(value => value === null)
    if (slot < 0 || departingSelection) return
    const next = [...slots]
    next[slot] = playerId
    setRecentSelection({ playerId, slot })
    setDepartingSelection({ playerId, slot, phase: 'card' })
    if (selectionTimer.current) clearTimeout(selectionTimer.current)
    selectionTimer.current = setTimeout(() => setRecentSelection(null), 650)
    placementTimer.current = setTimeout(() => {
      setDepartingSelection({ playerId, slot, phase: 'medal' })
      onChange({ first: next[0], second: next[1], third: next[2] })
      collapseTimer.current = setTimeout(() => setDepartingSelection(null), 760)
    }, 220)
  }

  const recentPlayer = recentSelection ? players.find(player => player.id === recentSelection.playerId) : null
  const gridPlayers = players.filter(player => !slots.includes(player.id) || player.id === departingSelection?.playerId)
  return (
    <div>
      <div className="mb-5 grid grid-cols-3 gap-2">
        {slots.map((id, index) => {
          const player = players.find(item => item.id === id)
          const linkedToDepartingCard = departingSelection?.phase === 'medal' && departingSelection.slot === index
          return (
            <div key={index} className={'relative flex min-h-[110px] flex-col items-center justify-center rounded-xl p-2 text-center ' + (recentSelection?.slot === index ? 'animate-podium-slot-in' : '') + (linkedToDepartingCard ? ' animate-podium-rank-link' : '')} style={{ background: player ? 'color-mix(in srgb, var(--league-primary) 12%, var(--bg-card))' : 'var(--bg-card)', border: (linkedToDepartingCard ? '2px' : '1px') + ' solid ' + (player ? 'var(--league-primary)' : 'var(--border-muted)') }}>
              <span className="text-2xl">{medals[index]}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{index + 1}. SIJA</span>
              {player ? <>
                <button type="button" aria-label={'Poista ' + (index + 1) + '. sijan valinta'} onClick={() => remove(index)} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-2xl font-bold leading-none transition-colors" style={{ background: 'color-mix(in srgb, var(--bg-dark) 70%, transparent)', border: '1px solid var(--border-accent)', color: 'white' }}>{'\u00d7'}</button>
                <span className="mt-1 w-full truncate text-xs font-semibold text-white">{player.full_name}</span>
              </> : <span className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Tyhjä</span>}
            </div>
          )
        })}
      </div>
      <div className="mb-2 min-h-[16px] text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }} aria-live="polite">{recentPlayer && recentSelection ? <span className="inline-block normal-case tracking-normal text-league-primary animate-podium-selection">{recentPlayer.full_name} → {recentSelection.slot + 1}. sija</span> : 'Valitse pelaajat'}</div>
      <div className="grid max-h-[38vh] grid-cols-2 gap-2 overflow-y-auto">
        {gridPlayers.map(player => departingSelection?.playerId === player.id && departingSelection.phase === 'medal'
          ? <div key={player.id} className="flex min-h-[118px] flex-col items-center justify-center rounded-xl border-2 border-league-primary bg-league-primary/10 animate-podium-rank-reveal"><span className="text-4xl">{medals[departingSelection.slot]}</span><span className="mt-1 text-xs font-semibold text-league-primary">{departingSelection.slot + 1}. sija</span></div>
          : <PlayerCard key={player.id} player={player} hcpOverride={seasonalHandicaps[player.id]} compact confirming={departingSelection?.playerId === player.id && departingSelection.phase === 'card'} onClick={() => selectPlayer(player.id)} />)}
      </div>
    </div>
  )
}
function Progress({ index, total }: { index: number; total: number }) {
  return <div className="mb-7"><div className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: 'var(--border-muted)' }}><div className="h-full transition-all" style={{ width: `${(index / total) * 100}%`, background: 'var(--league-primary)' }} /></div><div className="mt-2 text-right text-xs" style={{ color: 'var(--text-muted)' }}>{index}/{total}</div></div>
}

function StablefordResult({ points }: { points: number }) {
  const delta = 36 - points
  return <div className="mb-5 text-center">
    <div className={`font-display text-[72px] font-black leading-none ${delta < 0 ? 'text-gc-red' : 'text-white'}`}>{delta === 0 ? 'E' : delta > 0 ? `+${delta}` : delta}</div>
    <div className="mt-1 text-[11px] uppercase tracking-wide text-gc-muted">{delta === 0 ? 'par' : delta > 0 ? 'yli parin' : 'alle parin'}</div>
    <div className="mt-2 font-display text-lg font-bold text-white">{points}p <span className="font-sans text-xs font-normal text-gc-muted">Bogeypoint</span></div>
  </div>
}

function QuestionCard({ question, index, total, answer, players, event, seasonStats, playerHandicaps, holeGuide, onChange, onLock, moving, submitting }: { question: EventQuestion; index: number; total: number; answer: Answer | null; players: Player[]; event: EventRow; seasonStats: Record<string, { rank?: unknown; points?: unknown }>; playerHandicaps: Record<string, number>; holeGuide: HoleGuide[]; onChange: (answer: Answer) => void; onLock: () => void; moving: boolean; submitting: boolean }) {
  const [confirmingSelection, setConfirmingSelection] = useState(false)
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const key = question.question_type.key
  const parameters = question.parameters
  const configuredTarget = playerFrom(parameters, 'player_id', players) ?? playerFrom(parameters, 'target_player_id', players)
  const target = configuredTarget ?? (key === 'slider_player_points' || key === 'beat_the_leader' || key === 'composition_player_line' ? players[0] ?? null : null)
  const targetHandicap = target ? playerHandicaps[target.id] ?? target.hcp_fallback ?? null : null
  const playerA = playerFrom(parameters, 'player_a_id', players)
  const playerB = playerFrom(parameters, 'player_b_id', players)
  const configuredHeadToHeadPlayers = [playerA, playerB].filter((player): player is Player => Boolean(player))
  const headToHeadPlayers = configuredHeadToHeadPlayers.length === 2 ? configuredHeadToHeadPlayers : players.slice(0, 2)
  const stats = { ...seasonStats, ...((parameters.player_stats ?? {}) as Record<string, { rank?: unknown; points?: unknown }>) }
  const compositionAnswer = isCompositionAnswer(answer) && !('type' in answer) ? answer : initialCompositionForHandicap(targetHandicap, holeGuide.map(hole => hole.stroke_index))
  const valid = key === 'podium_top3' ? !!answer && (answer as PodiumAnswer).first != null && (answer as PodiumAnswer).second != null && (answer as PodiumAnswer).third != null : key === 'composition_player_line' ? compositionAnswer.holes.length === 18 && compositionAnswer.holes.every(category => category != null) : answer !== null
  let context = ''
  if (key === 'slider_player_points') context = `HCP ${targetHandicap ?? '–'} · ${event.course?.name ?? 'Kenttä'} Par ${event.course?.par_total ?? 72}`
  if (key.startsWith('player_pick_')) context = 'Valitse tapahtuman pelaajista yksi'
  if (key.startsWith('yes_no_') && key !== 'yes_no_head_to_head') context = 'Arvioi kierroksen tulosta'
  if (key === 'yes_no_head_to_head') context = `${headToHeadPlayers[0]?.full_name ?? 'Pelaaja A'} vastaan ${headToHeadPlayers[1]?.full_name ?? 'Pelaaja B'}`
  if (key === 'podium_top3') context = 'Järjestä kolme pelaajaa oikeaan järjestykseen'
  if (key === 'beat_the_leader') context = 'Valitse haastajan voittava pelaaja'
  if (key === 'composition_player_line') context = 'Arvioi pelaajan kierros väylä kerrallaan'
  const currentSlider = typeof answer === 'number' ? answer : 36
  useEffect(() => () => { if (confirmationTimer.current) clearTimeout(confirmationTimer.current) }, [])
  const needsSelectionConfirmation = key.startsWith('player_pick_') || key === 'beat_the_leader' || key === 'yes_no_head_to_head'
  const handleLock = () => {
    if (!needsSelectionConfirmation || typeof answer !== 'string' || confirmingSelection) {
      onLock()
      return
    }
    setConfirmingSelection(true)
    confirmationTimer.current = setTimeout(() => {
      setConfirmingSelection(false)
      onLock()
    }, 300)
  }
  return <div className={`transition-all duration-200 ${moving ? '-translate-x-8 opacity-0' : 'translate-x-0 opacity-100'}`}><Progress index={index} total={total} /><div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>VEIKKAUS {index + 1}/{total}</div><h2 className="font-display text-[26px] font-extrabold leading-tight text-white">{key === 'beat_the_leader' ? 'Kuka päihittää heidät?' : questionTitle(question, players)}</h2>{context && <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{context}</p>}<div className="mb-8 mt-7">{key === 'slider_player_points' && <div>{target && <div className="mb-5"><div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--league-primary)' }}>KOHDEPELAAJA</div><PlayerCard player={target} rank={parameters.target_rank} points={parameters.target_points} hcpOverride={targetHandicap} /></div>}<StablefordResult points={currentSlider} /><input type="range" min="18" max="54" value={currentSlider} onChange={eventChange => onChange(Number(eventChange.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-full" style={{ background: `linear-gradient(to right, var(--league-primary) 0%, var(--league-primary) ${((currentSlider - 18) / 36) * 100}%, var(--border-muted) ${((currentSlider - 18) / 36) * 100}%, var(--border-muted) 100%)`, accentColor: 'var(--league-primary)' }} /><div className="mt-2 flex justify-between text-sm" style={{ color: 'var(--text-muted)' }}><span>18</span><span>54</span></div></div>}{key === 'composition_player_line' && <div>{target && <div className="mb-5"><div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--league-primary)' }}>KOHDEPELAAJA</div><PlayerCard player={target} rank={parameters.target_rank} points={parameters.target_points} hcpOverride={targetHandicap} /></div>}<CompositionQuestion value={compositionAnswer} onChange={value => onChange(value)} showStablefordPreview playerHandicap={targetHandicap} holePars={holeGuide.map(hole => hole.par)} holeHandicapIndexes={holeGuide.map(hole => hole.stroke_index)} /></div>}{key.startsWith('player_pick_') && <PlayerCarousel players={players} selectedId={typeof answer === 'string' ? answer : null} confirming={confirmingSelection} onSelect={onChange} stats={stats} seasonalHandicaps={playerHandicaps} />}{key.startsWith('yes_no_') && key !== 'yes_no_head_to_head' && <div className="flex flex-col gap-3"><button type="button" onClick={() => onChange(true)} className="rounded-xl py-5 font-display text-xl font-bold text-white" style={{ background: answer === true ? 'color-mix(in srgb, var(--status-positive) 20%, var(--bg-card))' : 'var(--bg-card)', border: `1px solid ${answer === true ? 'var(--status-positive)' : 'var(--border-muted)'}` }}>KYLLÄ ✓</button><button type="button" onClick={() => onChange(false)} className="rounded-xl py-5 font-display text-xl font-bold text-white" style={{ background: answer === false ? 'color-mix(in srgb, var(--status-negative) 20%, var(--bg-card))' : 'var(--bg-card)', border: `1px solid ${answer === false ? 'var(--status-negative)' : 'var(--border-muted)'}` }}>EI ✗</button></div>}{key === 'yes_no_head_to_head' && <div className="grid grid-cols-2 gap-3">{headToHeadPlayers.map(player => <PlayerCard key={player.id} player={player} hcpOverride={playerHandicaps[player.id]} selected={answer === player.id} confirming={confirmingSelection && answer === player.id} onClick={() => onChange(player.id)} />)}</div>}{key === 'podium_top3' && <PodiumPicker players={players} value={(answer as PodiumAnswer) ?? { first: null, second: null, third: null }} onChange={onChange as (value: PodiumAnswer) => void} seasonalHandicaps={playerHandicaps} />}{key === 'beat_the_leader' && <div>{target && <><div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--league-primary)'}}>HAASTETTAVA</div><div className="mb-5"><PlayerCard player={target} rank={parameters.target_rank} points={parameters.target_points} hcpOverride={targetHandicap} /></div></>}<PlayerCarousel players={players.filter(player => player.id !== target?.id)} selectedId={typeof answer === 'string' ? answer : null} confirming={confirmingSelection} onSelect={onChange} stats={stats} seasonalHandicaps={playerHandicaps} /></div>}</div><button type="button" disabled={!valid || submitting || confirmingSelection} onClick={handleLock} className="w-full rounded-xl py-3 font-display text-lg font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-30" style={{ background: 'var(--league-primary)', color: 'var(--bg-dark)' }}>{confirmingSelection ? 'VALITTU ✓' : submitting ? 'LÄHETETÄÄN…' : 'LUKITSE VEIKKAUS →'}</button></div>
}

function IdentityBadge({ identity, isEventPlayer, compact = false }: { identity: Identity; isEventPlayer: boolean; compact?: boolean }) {
  return <div className="rounded-2xl p-5 text-center" style={{ background: 'color-mix(in srgb, var(--league-primary) 10%, transparent)', border: '2px solid var(--league-primary)' }}><div className={`font-display font-black tracking-[0.3em] ${compact ? 'text-4xl' : 'text-[40px]'}`} style={{ color: 'var(--league-primary)' }}>PIN: {identity.pin}</div><div className={`${compact ? 'text-[22px]' : 'text-2xl'} mt-2 font-bold text-white`}>{identity.display_name}</div>{isEventPlayer && <div className="mx-auto mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'color-mix(in srgb, var(--league-primary) 20%, transparent)', border: '1px solid var(--league-primary)', color: 'white' }}>⛳ Tapahtuman pelaaja</div>}{!compact && <p className="mt-3 text-[13px] italic" style={{ color: 'var(--text-muted)' }}>📸 Ota kuvakaappaus tunnuksestasi</p>}</div>
}

function Completion({ event, questions, players, answers, identity, isEventPlayer, onLogout }: { event: EventRow; questions: EventQuestion[]; players: Player[]; answers: Record<string, Answer>; identity: Identity; isEventPlayer: boolean; onLogout: () => void }) {
  return <MainShell onLogout={onLogout}><div className="py-2"><div className="mb-5 text-center text-5xl" style={{ color: 'var(--league-primary)' }}>✓</div><h1 className="mb-7 text-center font-display text-3xl font-extrabold text-white">Veikkaukset lähetetty!</h1><IdentityBadge identity={identity} isEventPlayer={isEventPlayer} /><div className="mt-8"><div className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>VEIKKAUKSESI</div><div className="space-y-2">{questions.map((question, index) => <div key={question.id} className="flex gap-3 rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg-card)' }}><span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{index + 1}.</span><span className="min-w-0 flex-1" style={{ color: 'var(--text-muted)' }}>{questionTitle(question, players).slice(0, 40)}{questionTitle(question, players).length > 40 ? '…' : ''}</span><span className="max-w-[48%] text-right font-semibold text-white">→ {answerLabel(question, answers[question.id], players)}</span></div>)}</div></div><div className="mt-8 text-center"><p className="font-display text-lg font-bold text-white">{event.name}</p><p className="text-sm" style={{ color: 'var(--text-muted)' }}>{formatDate(event.event_date)}</p><p className="mt-3 text-[13px] italic" style={{ color: 'var(--text-muted)' }}>Tulokset julkaistaan kierroksen jälkeen</p></div></div></MainShell>
}

function Leaderboard({ participants, currentId }: { participants: Participant[]; currentId: string | null }) {
  const ordered = [...participants].sort((a, b) => b.total_points_awarded - a.total_points_awarded || a.submitted_at.localeCompare(b.submitted_at))
  const hasPlayers = ordered.some(participant => participant.is_event_player)
  const groups = hasPlayers ? [{ label: 'PELAAJAT', rows: ordered.filter(p => p.is_event_player) }, { label: 'YLEISÖ', rows: ordered.filter(p => !p.is_event_player) }] : [{ label: '', rows: ordered }]
  return <div className="mt-9"><div className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>VEIKKAUSRANKING</div>{groups.map(group => <div key={group.label} className="mb-6">{group.label && <div className="mb-2 font-display text-sm font-bold" style={{ color: 'var(--league-primary)' }}>{group.label}</div>}<div className="divide-y overflow-hidden rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-muted)' }}>{group.rows.map(participant => <div key={participant.id} className="flex items-center gap-2 px-3 py-3 font-display text-sm" style={{ borderLeft: participant.id === currentId ? '3px solid var(--league-primary)' : '3px solid transparent' }}><span className="w-5" style={{ color: 'var(--text-muted)' }}>{ordered.indexOf(participant) + 1}</span><span className="w-12" style={{ color: 'var(--text-muted)' }}>••{(participant.pin ?? '––').slice(-2)}</span><span className="min-w-0 flex-1 truncate font-semibold text-white">{participant.display_name}</span><span className="font-bold" style={{ color: participant.id === currentId ? 'var(--league-primary)' : 'white' }}>{participant.total_points_awarded}p</span></div>)}</div></div>)}</div>
}

function Results({ event, questions, players, data, identity, onLogout }: { event: EventRow; questions: EventQuestion[]; players: Player[]; data: ResultData; identity: Identity | null; onLogout: () => void }) {
  const betByQuestion = new Map(data.bets.map(bet => [bet.question_id, bet]))
  const scored = event.status === 'results_ready' || event.status === 'presented'
  const maxPoints = questions.reduce((sum, question) => sum + question.question_type.max_points, 0)
  return <MainShell onLogout={onLogout}><div className="pb-8"><h1 className="font-display text-3xl font-extrabold text-white">{event.name}</h1><p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Veikkausten tulokset</p><div className="mt-7 space-y-3">{questions.map((question, index) => { const bet = betByQuestion.get(question.id); const correct = scored && bet?.points_awarded != null; return <section key={question.id} className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-muted)' }}><h2 className="font-display text-lg font-bold text-white">{index + 1}. {questionTitle(question, players)}</h2><div className="mt-3 flex items-start justify-between gap-4 text-sm"><div style={{ color: 'var(--text-muted)' }}>Sinun vastauksesi<br /><span className="font-semibold text-white">{answerLabel(question, bet?.answer, players)}</span>{scored && <><br /><span className="mt-2 inline-block">Oikea vastaus: <strong className="text-white">{answerLabel(question, question.correct_answer as Answer, players)}</strong></span></>}</div>{scored && <span className="shrink-0 font-display text-lg font-bold" style={{ color: correct && (bet?.points_awarded ?? 0) > 0 ? 'var(--status-positive)' : 'var(--status-negative)' }}>{correct && (bet?.points_awarded ?? 0) > 0 ? '✓' : '✗'} {bet?.points_awarded ?? 0}p</span>}</div></section>})}</div>{!scored ? <div className="mt-8 rounded-xl px-4 py-5 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-muted)' }}><p className="font-display font-bold text-white">Tuloksia ei ole vielä saatavilla</p><p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Pisteet ja veikkausranking julkaistaan kierroksen jälkeen.</p></div> : <><div className="mt-8 text-center"><span className="font-display text-[32px] font-black" style={{ color: 'var(--league-primary)' }}>Yhteensä: {data.current?.total_points_awarded ?? 0}p</span><span className="ml-2 text-base" style={{ color: 'var(--text-muted)' }}>/ {maxPoints}p mahdollista</span></div><Leaderboard participants={data.participants} currentId={data.current?.id ?? null} /></>}{identity && <p className="mt-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>PIN: {identity.pin} · {formatDate(event.event_date)}</p>}</div></MainShell>
}

export default function PublicBetPage() {
  const { token } = useParams<{ token: string }>()
  const league = useLeague()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [questions, setQuestions] = useState<EventQuestion[]>([])
  const [eventPlayers, setEventPlayers] = useState<EventPlayer[]>([])
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [stage, setStage] = useState<PageStage>('message')
  const [message, setMessage] = useState('Ladataan…')
  const [result, setResult] = useState<ResultData | null>(null)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [isEventPlayer, setIsEventPlayer] = useState(false)
  const [seasonStats, setSeasonStats] = useState<Record<string, { rank?: unknown; points?: unknown }>>({})
  const [playerHandicaps, setPlayerHandicaps] = useState<Record<string, number>>({})
  const [holeGuide, setHoleGuide] = useState<HoleGuide[]>(COMPOSITION_HOLE_PARS.map((par, index) => ({ par, stroke_index: index + 1 })))
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [moving, setMoving] = useState(false)
  const [identityBusy, setIdentityBusy] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const players = useMemo(() => eventPlayers.map(item => item.player), [eventPlayers])
  const combinedPlayerQuestions = useMemo(
    () => questions.filter(question => COMBINED_KEY_BY_QUESTION[question.question_type.key] != null),
    [questions],
  )
  const combinedQuestionIndexes = useMemo(
    () => combinedPlayerQuestions.map(question => questions.indexOf(question)),
    [combinedPlayerQuestions, questions],
  )
  const combinedQuestionIndexSet = useMemo(
    () => combinedPlayerQuestions.length >= 1 && combinedPlayerQuestions.length <= 4 ? new Set(combinedQuestionIndexes) : new Set<number>(),
    [combinedPlayerQuestions.length, combinedQuestionIndexes],
  )
  const combinedStartIndex = combinedQuestionIndexSet.size ? Math.min(...combinedQuestionIndexes) : -1
  const combinedEndIndex = combinedQuestionIndexSet.size ? Math.max(...combinedQuestionIndexes) : -1
  const combinedBetKeys = combinedPlayerQuestions.map(question => COMBINED_KEY_BY_QUESTION[question.question_type.key])
  const standingsByPlayer = useMemo(() => {
    const entries: Array<[string, { rank: number; points: number }]> = []
    players.forEach(player => {
      const standing = seasonStats[player.id]
      if (standing?.rank != null && standing.points != null) entries.push([player.id, { rank: Number(standing.rank), points: Number(standing.points) }])
    })
    return new Map(entries)
  }, [players, seasonStats])

  function nextRegularQuestionIndex(afterIndex: number) {
    let nextIndex = afterIndex + 1
    while (nextIndex < questions.length && combinedQuestionIndexSet.has(nextIndex)) nextIndex += 1
    return nextIndex
  }

  async function loadResults(eventId: string, currentParticipantId: string) {
    const [{ data: participants, error: participantError }, { data: bets, error: betError }] = await Promise.all([
      db.from('betting_participants').select('*').eq('event_id', eventId).order('submitted_at', { ascending: true }),
      db.from('bets').select('*').eq('participant_id', currentParticipantId),
    ])
    if (participantError) throw participantError
    if (betError) throw betError
    const all = (participants ?? []) as unknown as Participant[]
    const loadedResult = { current: all.find(participant => participant.id === currentParticipantId) ?? null, bets: (bets ?? []) as unknown as BetRow[], participants: all }
    setResult(loadedResult)
    if (loadedResult.bets.length) clearDraft(eventId)
    return loadedResult
  }

  async function findSubmittedResult(eventId: string, currentIdentity: Identity, bettorAccountId: string | null, preferredParticipantId: string | null) {
    const { data: participantRows, error: participantError } = await db.from('betting_participants')
      .select('*')
      .eq('event_id', eventId)
      .order('submitted_at', { ascending: false })
    if (participantError) throw participantError
    const matchingParticipants = ((participantRows ?? []) as Participant[]).filter(participant =>
      participant.id === preferredParticipantId ||
      participant.identity_token === currentIdentity.identity_token ||
      (bettorAccountId != null && participant.bettor_account_id === bettorAccountId) ||
      (participant.pin === currentIdentity.pin && participant.display_name.trim().toLocaleLowerCase() === currentIdentity.display_name.trim().toLocaleLowerCase()),
    )
    for (const participant of matchingParticipants) {
      try {
        const loadedResult = await loadResults(eventId, participant.id)
        if (loadedResult.bets.length) return { participant, loadedResult }
      } catch {
        // Continue checking duplicate participant rows for this identity.
      }
    }
    return null
  }

  useEffect(() => {
    if (!event || stage !== 'questions' || !Object.keys(answers).length) return
    writeStorage(draftKey(event.id), { answers, current_question: currentQuestion } satisfies BettingDraft)
  }, [answers, currentQuestion, event, stage])

  useEffect(() => {
    if (stage !== 'questions' || !questions.length) return
    const firstIncompleteIndex = questions.findIndex(question => answers[question.id] == null)
    if (firstIncompleteIndex < 0 || currentQuestion <= firstIncompleteIndex) return
    const resumeIndex = combinedQuestionIndexSet.has(firstIncompleteIndex) ? combinedStartIndex : firstIncompleteIndex
    if (resumeIndex >= 0 && resumeIndex !== currentQuestion) setCurrentQuestion(resumeIndex)
  }, [answers, combinedQuestionIndexSet, combinedStartIndex, currentQuestion, questions, stage])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!token) { setMessage('Tapahtumaa ei löydy'); setStage('message'); return }
      try {
        const { data, error } = await db.from('league_events').select('*, course:courses(name, par_total)').eq('betting_url_token', token).maybeSingle()
        if (error) throw error
        if (!data) { setMessage('Tapahtumaa ei löydy'); setStage('message'); return }
        const loadedEvent = data as unknown as EventRow
        const [{ data: playerData, error: playerError }, { data: questionData, error: questionError }] = await Promise.all([
          db.from('league_event_players').select('*, player:players(*)').eq('event_id', loadedEvent.id).order('display_order'),
          db.from('betting_questions').select('*, question_type:betting_question_types(*)').eq('event_id', loadedEvent.id).order('display_order'),
        ])
        if (playerError) throw playerError
        if (questionError) throw questionError
        if (cancelled) return
        const loadedEventPlayers = (playerData ?? []) as unknown as EventPlayer[]
        const loadedQuestions: EventQuestion[] = (questionData ?? []).map(normalizeEventQuestion)
        setEvent(loadedEvent)
        setEventPlayers(loadedEventPlayers)
        setQuestions(loadedQuestions)
        const compositionQuestion = loadedQuestions.find(question => question.question_type.key === 'composition_player_line')
        const parameterPars: number[] = Array.isArray(compositionQuestion?.parameters.hole_pars) && compositionQuestion.parameters.hole_pars.length === 18
          ? compositionQuestion.parameters.hole_pars.map(Number)
          : COMPOSITION_HOLE_PARS
        const parameterIndexes: number[] = Array.isArray(compositionQuestion?.parameters.hole_handicap_indexes) && compositionQuestion.parameters.hole_handicap_indexes.length === 18
          ? compositionQuestion.parameters.hole_handicap_indexes.map(Number)
          : parameterPars.map((_, index) => index + 1)
        setHoleGuide(parameterPars.map((par, index) => ({ par, stroke_index: parameterIndexes[index] ?? index + 1 })))
        if (loadedQuestions.length) {
          try {
            const { data: rounds, error: roundsError } = await db.from('rounds')
              .select('id, player_id, course_id, hcp_at_time, played_date, submitted_at')
              .eq('league_id', loadedEvent.league_id)
              .eq('status', 'published')
              .order('played_date', { ascending: false })
              .order('submitted_at', { ascending: false })
              .limit(200)
            if (!roundsError && rounds?.length) {
              const eventPlayerIds = new Set(loadedEventPlayers.map(item => item.player_id))
              const fallbackHcps: Record<string, number> = {}
              for (const round of rounds as Array<{ id: string; player_id: string; course_id: string; hcp_at_time: number | null }>) {
                if (eventPlayerIds.has(round.player_id) && round.hcp_at_time != null && fallbackHcps[round.player_id] == null) fallbackHcps[round.player_id] = Number(round.hcp_at_time)
              }
              setPlayerHandicaps(fallbackHcps)
              const sampleRoundId = loadedEvent.course_id
                ? (rounds as Array<{ id: string; course_id: string }>).find(round => round.course_id === loadedEvent.course_id)?.id
                : undefined
              if (sampleRoundId) {
                const { data: holes, error: holesError } = await db.from('hole_results')
                  .select('hole_number, par, stroke_index')
                  .eq('round_id', sampleRoundId)
                  .order('hole_number')
                if (!holesError && holes?.length) {
                  const byHole = new Map((holes as Array<{ hole_number: number; par: number; stroke_index: number }>).map(hole => [hole.hole_number, hole]))
                  setHoleGuide(parameterPars.map((par, index) => {
                    const hole = byHole.get(index + 1)
                    return { par: Number(hole?.par ?? par), stroke_index: Number(hole?.stroke_index ?? parameterIndexes[index] ?? index + 1) }
                  }))
                }
              }
            }
          } catch {
            // Hole metadata is optional. The line editor retains its course defaults if it is unavailable.
          }
        }
        try {
          const season = await getCurrentSeason()
          const standings = await getLeaderboard(season.id)
          setSeasonStats(Object.fromEntries(standings.map(standing => [standing.player.id, { rank: standing.rank, points: standing.total_points }])))
        } catch {
          // Season standings are supporting card metadata; betting remains usable without them.
        }
        const savedIdentity = readStorage<Identity>(IDENTITY_KEY)
        const savedSubmission = readStorage<Submission>(submissionKey(loadedEvent.id))
        const savedDraft = readStorage<BettingDraft>(draftKey(loadedEvent.id))
        setIdentity(savedIdentity)
        if (savedDraft?.answers && typeof savedDraft.answers === 'object') {
          setAnswers(savedDraft.answers)
          const savedQuestionIndex = Math.min(Math.max(savedDraft.current_question ?? 0, 0), Math.max(loadedQuestions.length - 1, 0))
          const groupedQuestionIndexes = loadedQuestions
            .map((question, index) => COMBINED_KEY_BY_QUESTION[question.question_type.key] != null ? index : -1)
            .filter(index => index >= 0)
          const groupedQuestionSet = groupedQuestionIndexes.length >= 1 && groupedQuestionIndexes.length <= 4 ? new Set(groupedQuestionIndexes) : new Set<number>()
          const firstIncompleteIndex = loadedQuestions.findIndex(question => savedDraft.answers[question.id] == null)
          const resumeIndex = firstIncompleteIndex >= 0 && savedQuestionIndex > firstIncompleteIndex
            ? groupedQuestionSet.has(firstIncompleteIndex) ? Math.min(...groupedQuestionIndexes) : firstIncompleteIndex
            : savedQuestionIndex
          setCurrentQuestion(resumeIndex)
        }
        if (loadedEvent.status === 'draft') { setMessage('Veikkaukset eivät ole vielä auki'); setStage('message'); return }
        if (savedSubmission?.submitted) {
          try {
            const loadedResult = await loadResults(loadedEvent.id, savedSubmission.participant_id)
            if (loadedResult.bets.length) {
              setParticipantId(savedSubmission.participant_id)
              if (loadedResult.current) setIsEventPlayer(Boolean(loadedResult.current.is_event_player))
              if (!cancelled) setStage('results')
              return
            }
          } catch {
            // A stale local marker must not prevent account based recovery below.
          }
          try { window.localStorage.removeItem(submissionKey(loadedEvent.id)) } catch { /* storage is optional */ }
        }
        if (savedIdentity) {
          let bettorAccountId: string | null = null
          try {
            const { data: account } = await db.from('bettor_accounts')
              .select('id')
              .eq('pin', savedIdentity.pin)
              .ilike('display_name', savedIdentity.display_name)
              .maybeSingle()
            bettorAccountId = account?.id ?? null
          } catch {
            // The identity token and legacy name/PIN matching below are sufficient fallbacks.
          }
          const { data: participantRows, error: participantError } = await db.from('betting_participants')
            .select('*')
            .eq('event_id', loadedEvent.id)
            .order('submitted_at', { ascending: false })
          const matchingParticipants = !participantError
            ? ((participantRows ?? []) as Participant[]).filter(participant =>
              participant.id === savedSubmission?.participant_id ||
              participant.identity_token === savedIdentity.identity_token ||
              (bettorAccountId != null && participant.bettor_account_id === bettorAccountId) ||
              (participant.pin === savedIdentity.pin && participant.display_name.trim().toLocaleLowerCase() === savedIdentity.display_name.trim().toLocaleLowerCase()),
            )
            : []
          let resumableParticipant: Participant | undefined
          for (const matchingParticipant of matchingParticipants) {
            try {
              const serverResult = await loadResults(loadedEvent.id, matchingParticipant.id)
              if (serverResult.bets.length) {
                setParticipantId(matchingParticipant.id)
                setIsEventPlayer(Boolean(matchingParticipant.is_event_player))
                writeStorage(submissionKey(loadedEvent.id), { submitted: true, participant_id: matchingParticipant.id, submitted_at: matchingParticipant.submitted_at } satisfies Submission)
                setStage('results')
                return
              }
            } catch {
              // Continue checking other participant rows for the same identity.
            }
            if (!resumableParticipant) resumableParticipant = matchingParticipant
          }
          if (resumableParticipant && loadedEvent.status === 'betting_open') {
            setParticipantId(resumableParticipant.id)
            setIsEventPlayer(Boolean(resumableParticipant.is_event_player))
            setStage('questions')
            return
          }
        }
        if (loadedEvent.status !== 'betting_open') { setMessage('Veikkaukset on suljettu'); setStage('message'); return }
        setStage(savedIdentity ? 'returning' : 'identity')
      } catch (error) {
        if (!cancelled) { setMessage(error instanceof Error ? error.message : 'Tapahtuman lataus epäonnistui'); setStage('message') }
      }
    }
    load()
    return () => { cancelled = true }
    // The active league is set by LeagueProvider before this route renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, league.id])

  async function createOrRecoverParticipant(name: string, pin: string, code: string) {
    if (!event) return
    setIdentityBusy(true)
    try {
      let { data: account, error: accountError } = await db.from('bettor_accounts').select('*').eq('pin', pin).ilike('display_name', name).maybeSingle()
      if (accountError) throw accountError
      if (!account) {
        const inserted = await db.from('bettor_accounts').insert({ display_name: name, pin }).select().single()
        if (inserted.error) {
          const retry = await db.from('bettor_accounts').select('*').eq('pin', pin).ilike('display_name', name).maybeSingle()
          if (retry.error || !retry.data) throw inserted.error
          account = retry.data
        } else account = inserted.data
      }
      if (!account) throw new Error('Tunnuksen luonti epäonnistui')
      const savedIdentity: Identity = { display_name: account.display_name, pin: account.pin, identity_token: account.identity_token }
      writeStorage(IDENTITY_KEY, savedIdentity)
      setIdentity(savedIdentity)
      const codeCorrect = Boolean(code) && Boolean(event.participant_code) && code.trim().toLocaleLowerCase() === event.participant_code!.trim().toLocaleLowerCase()
      const payload = { event_id: event.id, display_name: savedIdentity.display_name, pin: savedIdentity.pin, identity_token: savedIdentity.identity_token, bettor_account_id: account.id, is_event_player: codeCorrect }
      // Always resolve through the idempotent function. The in-memory participantId
      // can refer to an older empty row while this account already has submitted bets.
      const insertedParticipant = await db.rpc('create_public_betting_participant', { p_event_id: payload.event_id, p_display_name: payload.display_name, p_pin: payload.pin, p_identity_token: payload.identity_token, p_bettor_account_id: payload.bettor_account_id, p_is_event_player: payload.is_event_player })
      if (insertedParticipant.error || !insertedParticipant.data) throw insertedParticipant.error ?? new Error('Osallistujan luonti epäonnistui')
      const createdId = insertedParticipant.data as string
      setParticipantId(createdId)
      setIsEventPlayer(codeCorrect)
      if (!createdId) throw new Error('Osallistujaa ei löytynyt')
      try {
        const submitted = await findSubmittedResult(event.id, savedIdentity, account.id, createdId)
        if (submitted) {
          setParticipantId(submitted.participant.id)
          setIsEventPlayer(Boolean(submitted.participant.is_event_player))
          const submission: Submission = { submitted: true, participant_id: submitted.participant.id, submitted_at: submitted.loadedResult.current?.submitted_at ?? new Date().toISOString() }
          writeStorage(submissionKey(event.id), submission)
          setStage('results')
          return
        }
      } catch {
        // The participant can still continue if the optional existing-bets read fails.
      }
      if (code && !codeCorrect) setStage('wrong-code')
      else setStage('questions')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tunnuksen luonti epäonnistui')
      setStage('submit-error')
    } finally { setIdentityBusy(false) }
  }

  function changeIdentity() { clearIdentity(); clearDraft(event?.id ?? null); setIdentity(null); setParticipantId(null); setStage('identity') }

  function logout() {
    clearIdentity()
    if (event) {
      try { window.localStorage.removeItem(submissionKey(event.id)) } catch { /* storage is optional */ }
      clearDraft(event.id)
    }
    setIdentity(null)
    setParticipantId(null)
    setResult(null)
    setAnswers({})
    setCurrentQuestion(0)
    setMoving(false)
    if (event?.status === 'betting_open') setStage('identity')
    else { setMessage('Veikkaukset on suljettu'); setStage('message') }
  }

  function retryParticipantCode() { setStage('identity') }

  function resumeIncompleteQuestion() {
    const firstIncompleteIndex = questions.findIndex(question => answers[question.id] == null)
    if (firstIncompleteIndex >= 0) {
      const resumeIndex = combinedQuestionIndexSet.has(firstIncompleteIndex) ? combinedStartIndex : firstIncompleteIndex
      setCurrentQuestion(resumeIndex)
    }
    setStage('questions')
  }

  async function submitAnswers() {
    if (!event) return
    let currentParticipantId = participantId
    if (!currentParticipantId && identity?.identity_token) {
      const { data: matchingParticipants } = await db.from('betting_participants')
        .select('id,is_event_player')
        .eq('event_id', event.id)
        .eq('identity_token', identity.identity_token)
        .order('submitted_at', { ascending: false })
        .limit(1)
      const matchingParticipant = matchingParticipants?.[0] as { id: string; is_event_player: boolean } | undefined
      if (matchingParticipant) {
        currentParticipantId = matchingParticipant.id
        setParticipantId(matchingParticipant.id)
        setIsEventPlayer(Boolean(matchingParticipant.is_event_player))
      }
    }
    if (!currentParticipantId) {
      setMessage('Veikkaajan tunnus puuttuu. Kirjaudu uudelleen jatkaaksesi.')
      setStage('identity')
      return
    }
    const missingQuestions = questions.filter(question => answers[question.id] == null)
    if (missingQuestions.length) {
      setMessage(`Täytä vielä: ${missingQuestions.map(question => questionTitle(question, players)).join(', ')}`)
      resumeIncompleteQuestion()
      return
    }
    setSubmitting(true)
    try {
      const submittedAt = new Date().toISOString()
      const submittedAnswers = { ...answers }
      const rows = questions.map(question => {
        const rawAnswer = answers[question.id]
        let answer = rawAnswer
        if (question.question_type.key === 'composition_player_line' && isCompositionAnswer(rawAnswer) && !('type' in rawAnswer)) {
          const target = playerFrom(question.parameters, 'player_id', players) ?? playerFrom(question.parameters, 'target_player_id', players) ?? players[0]
          if (!target) throw new Error('Tälle kysymykselle ei ole kohdepelaajaa')
          const targetHandicap = playerHandicaps[target.id] ?? target.hcp_fallback ?? null
          answer = lockComposition(rawAnswer, target.id, holeGuide.map(hole => hole.par), targetHandicap, holeGuide.map(hole => hole.stroke_index))
          submittedAnswers[question.id] = answer
        }
        return { participant_id: currentParticipantId, question_id: question.id, answer, points_awarded: null }
      })
      const betsInsert = await db.rpc('submit_public_bets', { p_event_id: event.id, p_participant_id: currentParticipantId, p_identity_token: identity?.identity_token, p_bets: rows.map(row => ({ question_id: row.question_id, answer: row.answer })) })
      if (betsInsert.error) throw betsInsert.error
      const submission: Submission = { submitted: true, participant_id: currentParticipantId, submitted_at: submittedAt }
      writeStorage(submissionKey(event.id), submission)
      clearDraft(event.id)
      const participant = { id: currentParticipantId, event_id: event.id, display_name: identity?.display_name ?? '', pin: identity?.pin ?? null, identity_token: identity?.identity_token ?? null, bettor_account_id: null, is_event_player: isEventPlayer, submitted_at: submittedAt, total_points_awarded: 0 }
      setResult({ current: participant, participants: [participant], bets: rows as BetRow[] })
      setAnswers(submittedAnswers)
      setStage('complete')
    } catch (error) {
      const submitError = error as { code?: string; message?: string }
      if (currentParticipantId && (submitError.code === 'P0001' || submitError.message?.includes('Veikkaukset on jo lähetetty'))) {
        try {
          const submitted = identity
            ? await findSubmittedResult(event.id, identity, null, currentParticipantId)
            : null
          if (submitted) {
            setParticipantId(submitted.participant.id)
            setIsEventPlayer(Boolean(submitted.participant.is_event_player))
            writeStorage(submissionKey(event.id), { submitted: true, participant_id: submitted.participant.id, submitted_at: submitted.loadedResult.current?.submitted_at ?? new Date().toISOString() } satisfies Submission)
            setStage('results')
            return
          }
        } catch {
          // Fall through to the normal submission error if the existing result cannot be loaded.
        }
      }
      setMessage(error instanceof Error ? error.message : 'Veikkausten lähetys epäonnistui')
      setStage('submit-error')
    } finally { setSubmitting(false) }
  }

  function assignCombined(key: BetKey, playerId: string | null) {
    const question = combinedPlayerQuestions.find(item => COMBINED_KEY_BY_QUESTION[item.question_type.key] === key)
    if (!question) return
    setAnswers(current => {
      const next = { ...current }
      if (playerId) next[question.id] = playerId
      else delete next[question.id]
      return next
    })
  }

  function lockCombined() {
    if (submitting || combinedEndIndex < 0) return
    const nextIndex = nextRegularQuestionIndex(currentQuestion === combinedStartIndex ? combinedStartIndex : combinedEndIndex)
    if (nextIndex >= questions.length) { submitAnswers(); return }
    setMoving(true)
    window.setTimeout(() => { setCurrentQuestion(nextIndex); setMoving(false) }, 180)
  }

  function lockQuestion() {
    if (submitting) return
    if (!questions[currentQuestion]) return
    if (currentQuestion === questions.length - 1) { submitAnswers(); return }
    const nextIndex = currentQuestion + 1 === combinedStartIndex
      ? combinedStartIndex
      : nextRegularQuestionIndex(currentQuestion)
    setMoving(true)
    window.setTimeout(() => { setCurrentQuestion(nextIndex); setMoving(false) }, 180)
  }

  if (!event || stage === 'message') return <PageMessage>{message}</PageMessage>
  if (stage === 'submit-error') return <PageMessage action={<div className="flex flex-col items-center gap-3"><button type="button" onClick={participantId ? resumeIncompleteQuestion : () => setStage('identity')} className="rounded-xl px-6 py-3 font-display font-bold" style={{ background: 'var(--league-primary)', color: 'var(--bg-dark)' }}>Palaa takaisin</button><button type="button" onClick={logout} className="rounded-xl border px-6 py-3 font-display font-semibold text-white" style={{ borderColor: 'var(--border-accent)' }}>Kirjaudu ulos</button></div>}>{message}</PageMessage>
  if (stage === 'identity') return <IdentityForm event={event} initialIdentity={identity} onSubmit={createOrRecoverParticipant} busy={identityBusy} />
  if (stage === 'returning' && identity) return <ReturningIdentity event={event} identity={identity} onContinue={(code) => createOrRecoverParticipant(identity.display_name, identity.pin, code)} onChangeIdentity={changeIdentity} onLogout={logout} busy={identityBusy} />
  if (stage === 'wrong-code') return <WrongCodeNotice onRetry={retryParticipantCode} onContinue={() => setStage('questions')} onLogout={logout} />
  if (stage === 'questions' && combinedStartIndex >= 0 && combinedQuestionIndexSet.has(currentQuestion)) {
    const assignments = Object.fromEntries(combinedPlayerQuestions.map(question => [COMBINED_KEY_BY_QUESTION[question.question_type.key], typeof answers[question.id] === 'string' ? answers[question.id] : null])) as CombinedAssignments
    return <MainShell onLogout={logout}><CombinedPlayerPickScreen players={players} standingsByPlayer={standingsByPlayer} assignments={assignments} onAssign={assignCombined} onLock={lockCombined} transitioningOut={moving} seasonalHandicaps={playerHandicaps} questionStartIndex={combinedStartIndex} totalQuestions={questions.length} activeBetKeys={combinedBetKeys} /></MainShell>
  }
  if (stage === 'questions' && questions[currentQuestion]) return <MainShell onLogout={logout}><QuestionCard question={questions[currentQuestion]} index={currentQuestion} total={questions.length} answer={answers[questions[currentQuestion].id] ?? null} players={players} event={event} seasonStats={seasonStats} playerHandicaps={playerHandicaps} holeGuide={holeGuide} moving={moving} submitting={submitting} onChange={answer => setAnswers(current => ({ ...current, [questions[currentQuestion].id]: answer }))} onLock={lockQuestion} /></MainShell>
  if (stage === 'complete' && identity) return <Completion event={event} questions={questions} players={players} answers={answers} identity={identity} isEventPlayer={isEventPlayer} onLogout={logout} />
  if (stage === 'results' && result) return <Results event={event} questions={questions} players={players} data={result} identity={identity} onLogout={logout} />
  return <PageMessage>{submitting ? 'Lähetetään…' : 'Ladataan…'}</PageMessage>
}
