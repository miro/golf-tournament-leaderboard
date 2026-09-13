import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLeague } from '../contexts/LeagueContext'
import type { Player } from '../lib/database.types'
import { normalizeEventQuestion, type EventPlayer, type EventQuestion, type EventRow } from '../lib/eventQueries'
import InitialsAvatar from '../components/shared/InitialsAvatar'
import { playerImagePath } from '../lib/playerImage'
import { getCurrentSeason, getLeaderboard } from '../lib/queries'

const db = supabase as any

type Identity = { display_name: string; pin: string; identity_token: string }
type Submission = { submitted: true; participant_id: string; submitted_at: string }
type PodiumAnswer = { first: string | null; second: string | null; third: string | null }
type Answer = number | boolean | string | PodiumAnswer
type BetRow = { id: string; participant_id: string; question_id: string; answer: Answer; points_awarded: number | null }
type Participant = {
  id: string; event_id: string; display_name: string; pin: string | null; identity_token: string | null
  bettor_account_id: string | null; is_event_player: boolean; submitted_at: string; total_points_awarded: number
}
type ResultData = { current: Participant | null; bets: BetRow[]; participants: Participant[] }
type PageStage = 'identity' | 'returning' | 'wrong-code' | 'questions' | 'complete' | 'results' | 'message' | 'submit-error'

const IDENTITY_KEY = 'betting_identity'
const submissionKey = (eventId: string) => `betting_submission_${eventId}`

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function playerFrom(parameters: Record<string, unknown>, key: string, players: Player[]) {
  const id = String(parameters[key] ?? '')
  return players.find(player => player.id === id) ?? null
}

function questionTitle(question: EventQuestion, players: Player[]) {
  const key = question.question_type.key
  const target = playerFrom(question.parameters, 'player_id', players) ?? playerFrom(question.parameters, 'target_player_id', players)
  if (key === 'slider_player_points') return target ? `Kuinka monta pistettä ${target.full_name} tekee?` : 'Kuinka monta pistettä kohdepelaaja tekee?'
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
  if (key.startsWith('yes_no_')) return answer === true ? 'Kyllä' : 'Ei'
  if (key === 'podium_top3') {
    const podium = answer as PodiumAnswer
    return `1. ${players.find(p => p.id === podium.first)?.full_name ?? '–'} · 2. ${players.find(p => p.id === podium.second)?.full_name ?? '–'} · 3. ${players.find(p => p.id === podium.third)?.full_name ?? '–'}`
  }
  return players.find(player => player.id === answer)?.full_name ?? String(answer)
}

function MainShell({ children }: { children: ReactNode }) {
  return <main className="min-h-screen px-4 py-7 sm:py-10" style={{ background: 'var(--bg-dark)', color: 'white' }}><div className="mx-auto w-full max-w-[560px]">{children}</div></main>
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
  const [showPin, setShowPin] = useState(false)
  const [isPlayer, setIsPlayer] = useState(false)
  const ready = name.trim().length > 0 && /^\d{4}$/.test(pin)
  return <MainShell><LogoHeader event={event} /><div className="space-y-7"><section><h2 className="mb-3 font-display text-lg font-semibold text-white">Mikä on nimesi?</h2><TextInput value={name} onChange={setName} placeholder="Kirjoita nimesi" autoFocus={!initialIdentity} /></section><section><h2 className="font-display text-lg font-semibold text-white">Valitse 4-numeroinen PIN-koodi</h2><p className="mb-3 mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>Muista tämä — tarvitset sitä myöhemmin</p><div className="relative"><input type={showPin ? 'tel' : 'password'} inputMode="numeric" pattern="[0-9]*" maxLength={4} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="_ _ _ _" className="w-full rounded-xl px-4 py-3 text-center font-display font-extrabold tracking-[0.3em] text-white outline-none placeholder:opacity-70 focus:border-[var(--league-primary)]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-muted)', fontSize: 32 }} aria-label="4-numeroinen PIN-koodi" /><button type="button" aria-label={showPin ? 'Piilota PIN' : 'Näytä PIN'} onClick={() => setShowPin(value => !value)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xl" style={{ color: 'var(--text-muted)' }}>{showPin ? '◉' : '◌'}</button></div></section><ParticipantCodeFields enabled={isPlayer} onEnabledChange={setIsPlayer} value={code} onChange={setCode} /><button type="button" disabled={!ready || busy} onClick={() => onSubmit(name.trim(), pin, isPlayer ? code.trim() : '')} className="w-full rounded-xl py-3 font-display text-lg font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-30" style={{ background: 'var(--league-primary)', color: 'var(--bg-dark)' }}>{busy ? 'Ladataan…' : 'ALOITA VEIKKAAMINEN'}</button></div></MainShell>
}

function ReturningIdentity({ event, identity, onContinue, onChangeIdentity, busy }: { event: EventRow; identity: Identity; onContinue: (code: string) => void; onChangeIdentity: () => void; busy: boolean }) {
  const [code, setCode] = useState('')
  const [isPlayer, setIsPlayer] = useState(false)
  return <MainShell><LogoHeader event={event} /><h1 className="mb-6 text-center font-display text-[22px] font-extrabold text-white">Tervetuloa takaisin! 👋</h1><div className="rounded-2xl p-5 text-center" style={{ background: 'color-mix(in srgb, var(--league-primary) 12%, transparent)', border: '2px solid var(--league-primary)' }}><div className="font-display text-4xl font-black tracking-[0.3em]" style={{ color: 'var(--league-primary)' }}>PIN: {identity.pin}</div><div className="mt-2 text-[22px] font-bold text-white">{identity.display_name}</div></div><div className="mt-6 space-y-3"><button type="button" disabled={busy} onClick={() => onContinue(isPlayer ? code.trim() : '')} className="w-full rounded-xl py-3 font-display text-lg font-bold disabled:opacity-30" style={{ background: 'var(--league-primary)', color: 'var(--bg-dark)' }}>{busy ? 'Ladataan…' : 'Jatka tällä tunnuksella →'}</button><button type="button" onClick={onChangeIdentity} className="w-full rounded-xl border py-3 font-display font-semibold text-white" style={{ borderColor: 'var(--border-accent)' }}>Vaihda tunnusta</button></div><ParticipantCodeFields enabled={isPlayer} onEnabledChange={setIsPlayer} value={code} onChange={setCode} /></MainShell>
}

function WrongCodeNotice({ onRetry, onContinue }: { onRetry: () => void; onContinue: () => void }) {
  return <MainShell><div className="flex min-h-[80vh] flex-col items-center justify-center text-center"><div className="mb-5 text-6xl" aria-hidden="true">⚠️</div><h1 className="font-display text-[22px] font-extrabold text-white">Koodi ei täsmännyt</h1><p className="mt-4 max-w-sm text-[15px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>Syöttämäsi osallistujakoodi ei ole oikein.<br />Sinut on merkitty katsojaksi — voit silti veikkia normaalisti.</p><div className="mt-8 w-full space-y-3"><button type="button" onClick={onRetry} className="w-full rounded-xl border py-3 font-display font-semibold text-white" style={{ borderColor: 'var(--border-accent)' }}>Kokeile uudelleen</button><button type="button" onClick={onContinue} className="w-full rounded-xl py-3 font-display text-lg font-bold" style={{ background: 'var(--league-primary)', color: 'var(--bg-dark)' }}>JATKA VEIKKAAMISEEN →</button></div></div></MainShell>
}

function PlayerCard({ player, selected = false, onClick, rank, points, compact = false }: { player: Player; selected?: boolean; onClick?: () => void; rank?: unknown; points?: unknown; compact?: boolean }) {
  const [failed, setFailed] = useState(false)
  const image = player.avatar_url ?? playerImagePath(player.full_name)
  const body = <><div className={`relative overflow-hidden ${compact ? 'h-16' : 'h-28'}`} style={{ background: 'var(--bg-dark)' }}>{failed ? <div className="flex h-full items-center justify-center"><InitialsAvatar name={player.full_name} size={compact ? 42 : 64} color="var(--league-primary)" /></div> : <img src={image} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />}<div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /></div><div className="p-3 text-left"><div className="truncate font-display font-bold text-white">{player.full_name}</div><div className="mt-1 flex gap-2 text-xs" style={{ color: 'var(--text-muted)' }}><span>HCP {player.hcp_current ?? '–'}</span>{rank != null && <span>#{String(rank)}</span>}{points != null && <span>{String(points)}p</span>}</div></div></>
  if (!onClick) return <div className="overflow-hidden rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-muted)' }}>{body}</div>
  return <button type="button" onClick={onClick} className="w-full overflow-hidden rounded-xl text-left transition-all" style={{ background: selected ? 'color-mix(in srgb, var(--league-primary) 14%, var(--bg-card))' : 'var(--bg-card)', border: `${selected ? 2 : 1}px solid ${selected ? 'var(--league-primary)' : 'var(--border-muted)'}` }}>{body}</button>
}

function PlayerCarousel({ players, selectedId, onSelect, stats }: { players: Player[]; selectedId: string | null; onSelect: (id: string) => void; stats?: Record<string, { rank?: unknown; points?: unknown }> }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [center, setCenter] = useState(0)
  const sorted = [...players].sort((a, b) => (a.hcp_current ?? 99) - (b.hcp_current ?? 99))
  function updateCenter() {
    const element = scroller.current
    if (!element) return
    const middle = element.scrollLeft + element.clientWidth / 2
    let best = 0; let distance = Number.POSITIVE_INFINITY
    Array.from(element.children).forEach((child, index) => { const item = child as HTMLElement; const itemMiddle = item.offsetLeft + item.offsetWidth / 2; if (Math.abs(itemMiddle - middle) < distance) { best = index; distance = Math.abs(itemMiddle - middle) } })
    setCenter(best)
  }
  return <div><div ref={scroller} onScroll={updateCenter} className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18%] py-2"><div className="w-1 shrink-0" />{sorted.map((player, index) => { const selected = selectedId === player.id; const distance = Math.abs(center - index); return <div key={player.id} className="w-[68%] shrink-0 snap-center transition-all" style={{ opacity: distance > 1 ? 0.55 : 1, transform: `scale(${distance === 0 ? 1 : 0.92})` }}><PlayerCard player={player} selected={selected} onClick={() => { onSelect(player.id); (scroller.current?.children[index + 1] as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }) }} rank={stats?.[player.id]?.rank} points={stats?.[player.id]?.points} /></div>})}<div className="w-1 shrink-0" /></div><p className="mt-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>Selaa pelaajia ja napauta valintaasi</p></div>
}

function PodiumPicker({ players, value, onChange }: { players: Player[]; value: PodiumAnswer; onChange: (value: PodiumAnswer) => void }) {
  const slots = [value.first, value.second, value.third]
  const medals = ['🥇', '🥈', '🥉']
  const remove = (index: number) => { const next = [...slots]; next[index] = null; onChange({ first: next[0], second: next[1], third: next[2] }) }
  return <div><div className="mb-5 grid grid-cols-3 gap-2">{slots.map((id, index) => { const player = players.find(item => item.id === id); return <div key={index} className="relative flex min-h-[110px] flex-col items-center justify-center rounded-xl p-2 text-center" style={{ background: player ? 'color-mix(in srgb, var(--league-primary) 12%, var(--bg-card))' : 'var(--bg-card)', border: `1px solid ${player ? 'var(--league-primary)' : 'var(--border-muted)'}` }}><span className="text-2xl">{medals[index]}</span><span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{index + 1}. SIJA</span>{player ? <><button type="button" aria-label={`Poista ${index + 1}. sijan valinta`} onClick={() => remove(index)} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-2xl font-bold leading-none transition-colors" style={{ background: 'color-mix(in srgb, var(--bg-dark) 70%, transparent)', border: '1px solid var(--border-accent)', color: 'white' }}>×</button><span className="mt-1 w-full truncate text-xs font-semibold text-white">{player.full_name}</span></> : <span className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Tyhjä</span>}</div>})}</div><div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Valitse pelaajat</div><div className="grid max-h-[38vh] grid-cols-2 gap-2 overflow-y-auto">{players.filter(player => !slots.includes(player.id)).map(player => <PlayerCard key={player.id} player={player} compact onClick={() => { const index = slots.findIndex(slot => slot === null); if (index < 0) return; const next = [...slots]; next[index] = player.id; onChange({ first: next[0], second: next[1], third: next[2] }) }} />)}</div></div>
}

function Progress({ index, total }: { index: number; total: number }) {
  return <div className="mb-7"><div className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: 'var(--border-muted)' }}><div className="h-full transition-all" style={{ width: `${(index / total) * 100}%`, background: 'var(--league-primary)' }} /></div><div className="mt-2 text-right text-xs" style={{ color: 'var(--text-muted)' }}>{index}/{total}</div></div>
}

function QuestionCard({ question, index, total, answer, players, event, seasonStats, onChange, onLock, moving, submitting }: { question: EventQuestion; index: number; total: number; answer: Answer | null; players: Player[]; event: EventRow; seasonStats: Record<string, { rank?: unknown; points?: unknown }>; onChange: (answer: Answer) => void; onLock: () => void; moving: boolean; submitting: boolean }) {
  const key = question.question_type.key
  const parameters = question.parameters
  const configuredTarget = playerFrom(parameters, 'player_id', players) ?? playerFrom(parameters, 'target_player_id', players)
  const target = configuredTarget ?? (key === 'slider_player_points' || key === 'beat_the_leader' ? players[0] ?? null : null)
  const playerA = playerFrom(parameters, 'player_a_id', players)
  const playerB = playerFrom(parameters, 'player_b_id', players)
  const configuredHeadToHeadPlayers = [playerA, playerB].filter((player): player is Player => Boolean(player))
  const headToHeadPlayers = configuredHeadToHeadPlayers.length === 2 ? configuredHeadToHeadPlayers : players.slice(0, 2)
  const stats = { ...seasonStats, ...((parameters.player_stats ?? {}) as Record<string, { rank?: unknown; points?: unknown }>) }
  const valid = key === 'podium_top3' ? !!answer && (answer as PodiumAnswer).first != null && (answer as PodiumAnswer).second != null && (answer as PodiumAnswer).third != null : answer !== null
  let context = ''
  if (key === 'slider_player_points') context = `HCP ${target?.hcp_current ?? '–'} · ${event.course?.name ?? 'Kenttä'} Par ${event.course?.par_total ?? 72}`
  if (key.startsWith('player_pick_')) context = 'Valitse tapahtuman pelaajista yksi'
  if (key.startsWith('yes_no_') && key !== 'yes_no_head_to_head') context = 'Arvioi kierroksen tulosta'
  if (key === 'yes_no_head_to_head') context = `${headToHeadPlayers[0]?.full_name ?? 'Pelaaja A'} vastaan ${headToHeadPlayers[1]?.full_name ?? 'Pelaaja B'}`
  if (key === 'podium_top3') context = 'Järjestä kolme pelaajaa oikeaan järjestykseen'
  if (key === 'beat_the_leader') context = 'Valitse haastajan voittava pelaaja'
  const currentSlider = typeof answer === 'number' ? answer : 36
  return <div className={`transition-all duration-200 ${moving ? '-translate-x-8 opacity-0' : 'translate-x-0 opacity-100'}`}><Progress index={index} total={total} /><div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>VEIKKAUS {index + 1}/{total}</div><h2 className="font-display text-[26px] font-extrabold leading-tight text-white">{key === 'beat_the_leader' ? 'Kuka päihittää heidät?' : questionTitle(question, players)}</h2>{context && <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{context}</p>}<div className="mb-8 mt-7">{key === 'slider_player_points' && <div>{target && <div className="mb-5"><div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--league-primary)' }}>KOHDEPELAAJA</div><PlayerCard player={target} rank={parameters.target_rank} points={parameters.target_points} /></div>}<div className="mb-5 text-center font-display text-[72px] font-black leading-none" style={{ color: 'var(--league-primary)' }}>{currentSlider}</div><input type="range" min="18" max="54" value={currentSlider} onChange={eventChange => onChange(Number(eventChange.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-full" style={{ background: `linear-gradient(to right, var(--league-primary) 0%, var(--league-primary) ${((currentSlider - 18) / 36) * 100}%, var(--border-muted) ${((currentSlider - 18) / 36) * 100}%, var(--border-muted) 100%)`, accentColor: 'var(--league-primary)' }} /><div className="mt-2 flex justify-between text-sm" style={{ color: 'var(--text-muted)' }}><span>18</span><span>54</span></div></div>}{key.startsWith('player_pick_') && <PlayerCarousel players={players} selectedId={typeof answer === 'string' ? answer : null} onSelect={onChange} stats={stats} />}{key.startsWith('yes_no_') && key !== 'yes_no_head_to_head' && <div className="flex flex-col gap-3"><button type="button" onClick={() => onChange(true)} className="rounded-xl py-5 font-display text-xl font-bold text-white" style={{ background: answer === true ? 'color-mix(in srgb, var(--status-positive) 20%, var(--bg-card))' : 'var(--bg-card)', border: `1px solid ${answer === true ? 'var(--status-positive)' : 'var(--border-muted)'}` }}>KYLLÄ ✓</button><button type="button" onClick={() => onChange(false)} className="rounded-xl py-5 font-display text-xl font-bold text-white" style={{ background: answer === false ? 'color-mix(in srgb, var(--status-negative) 20%, var(--bg-card))' : 'var(--bg-card)', border: `1px solid ${answer === false ? 'var(--status-negative)' : 'var(--border-muted)'}` }}>EI ✗</button></div>}{key === 'yes_no_head_to_head' && <div className="grid grid-cols-2 gap-3">{headToHeadPlayers.map(player => <PlayerCard key={player.id} player={player} selected={answer === player.id} onClick={() => onChange(player.id)} />)}</div>}{key === 'podium_top3' && <PodiumPicker players={players} value={(answer as PodiumAnswer) ?? { first: null, second: null, third: null }} onChange={onChange as (value: PodiumAnswer) => void} />}{key === 'beat_the_leader' && <div>{target && <><div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--league-primary)' }}>HAASTETTAVA</div><div className="mb-5"><PlayerCard player={target} rank={parameters.target_rank} points={parameters.target_points} /></div></>}<PlayerCarousel players={players.filter(player => player.id !== target?.id)} selectedId={typeof answer === 'string' ? answer : null} onSelect={onChange} stats={stats} /></div>}</div><button type="button" disabled={!valid || submitting} onClick={onLock} className="w-full rounded-xl py-3 font-display text-lg font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-30" style={{ background: 'var(--league-primary)', color: 'var(--bg-dark)' }}>{submitting ? 'LÄHETETÄÄN…' : 'LUKITSE VEIKKAUS →'}</button></div>
}

function IdentityBadge({ identity, isEventPlayer, compact = false }: { identity: Identity; isEventPlayer: boolean; compact?: boolean }) {
  return <div className="rounded-2xl p-5 text-center" style={{ background: 'color-mix(in srgb, var(--league-primary) 10%, transparent)', border: '2px solid var(--league-primary)' }}><div className={`font-display font-black tracking-[0.3em] ${compact ? 'text-4xl' : 'text-[40px]'}`} style={{ color: 'var(--league-primary)' }}>PIN: {identity.pin}</div><div className={`${compact ? 'text-[22px]' : 'text-2xl'} mt-2 font-bold text-white`}>{identity.display_name}</div>{isEventPlayer && <div className="mx-auto mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'color-mix(in srgb, var(--league-primary) 20%, transparent)', border: '1px solid var(--league-primary)', color: 'white' }}>⛳ Tapahtuman pelaaja</div>}{!compact && <p className="mt-3 text-[13px] italic" style={{ color: 'var(--text-muted)' }}>📸 Ota kuvakaappaus tunnuksestasi</p>}</div>
}

function Completion({ event, questions, players, answers, identity, isEventPlayer }: { event: EventRow; questions: EventQuestion[]; players: Player[]; answers: Record<string, Answer>; identity: Identity; isEventPlayer: boolean }) {
  return <MainShell><div className="py-2"><div className="mb-5 text-center text-5xl" style={{ color: 'var(--league-primary)' }}>✓</div><h1 className="mb-7 text-center font-display text-3xl font-extrabold text-white">Veikkaukset lähetetty!</h1><IdentityBadge identity={identity} isEventPlayer={isEventPlayer} /><div className="mt-8"><div className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>VEIKKAUKSESI</div><div className="space-y-2">{questions.map((question, index) => <div key={question.id} className="flex gap-3 rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg-card)' }}><span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{index + 1}.</span><span className="min-w-0 flex-1" style={{ color: 'var(--text-muted)' }}>{questionTitle(question, players).slice(0, 40)}{questionTitle(question, players).length > 40 ? '…' : ''}</span><span className="max-w-[48%] text-right font-semibold text-white">→ {answerLabel(question, answers[question.id], players)}</span></div>)}</div></div><div className="mt-8 text-center"><p className="font-display text-lg font-bold text-white">{event.name}</p><p className="text-sm" style={{ color: 'var(--text-muted)' }}>{formatDate(event.event_date)}</p><p className="mt-3 text-[13px] italic" style={{ color: 'var(--text-muted)' }}>Tulokset julkaistaan kierroksen jälkeen</p></div></div></MainShell>
}

function Leaderboard({ participants, currentId }: { participants: Participant[]; currentId: string | null }) {
  const ordered = [...participants].sort((a, b) => b.total_points_awarded - a.total_points_awarded || a.submitted_at.localeCompare(b.submitted_at))
  const hasPlayers = ordered.some(participant => participant.is_event_player)
  const groups = hasPlayers ? [{ label: 'PELAAJAT', rows: ordered.filter(p => p.is_event_player) }, { label: 'YLEISÖ', rows: ordered.filter(p => !p.is_event_player) }] : [{ label: '', rows: ordered }]
  return <div className="mt-9"><div className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>VEIKKAUSRANKING</div>{groups.map(group => <div key={group.label} className="mb-6">{group.label && <div className="mb-2 font-display text-sm font-bold" style={{ color: 'var(--league-primary)' }}>{group.label}</div>}<div className="divide-y overflow-hidden rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-muted)' }}>{group.rows.map(participant => <div key={participant.id} className="flex items-center gap-2 px-3 py-3 font-display text-sm" style={{ borderLeft: participant.id === currentId ? '3px solid var(--league-primary)' : '3px solid transparent' }}><span className="w-5" style={{ color: 'var(--text-muted)' }}>{ordered.indexOf(participant) + 1}</span><span className="w-12" style={{ color: 'var(--text-muted)' }}>••{(participant.pin ?? '––').slice(-2)}</span><span className="min-w-0 flex-1 truncate font-semibold text-white">{participant.display_name}</span><span className="font-bold" style={{ color: participant.id === currentId ? 'var(--league-primary)' : 'white' }}>{participant.total_points_awarded}p</span></div>)}</div></div>)}</div>
}

function Results({ event, questions, players, data, identity }: { event: EventRow; questions: EventQuestion[]; players: Player[]; data: ResultData; identity: Identity | null }) {
  const betByQuestion = new Map(data.bets.map(bet => [bet.question_id, bet]))
  const scored = event.status === 'results_ready' || event.status === 'presented'
  const maxPoints = questions.reduce((sum, question) => sum + question.question_type.max_points, 0)
  return <MainShell><div className="pb-8"><h1 className="font-display text-3xl font-extrabold text-white">{event.name}</h1><p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Veikkausten tulokset</p><div className="mt-7 space-y-3">{questions.map((question, index) => { const bet = betByQuestion.get(question.id); const correct = scored && bet?.points_awarded != null; return <section key={question.id} className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-muted)' }}><h2 className="font-display text-lg font-bold text-white">{index + 1}. {questionTitle(question, players)}</h2><div className="mt-3 flex items-start justify-between gap-4 text-sm"><div style={{ color: 'var(--text-muted)' }}>Sinun vastauksesi<br /><span className="font-semibold text-white">{answerLabel(question, bet?.answer, players)}</span>{scored && <><br /><span className="mt-2 inline-block">Oikea vastaus: <strong className="text-white">{answerLabel(question, question.correct_answer as Answer, players)}</strong></span></>}</div>{scored && <span className="shrink-0 font-display text-lg font-bold" style={{ color: correct && (bet?.points_awarded ?? 0) > 0 ? 'var(--status-positive)' : 'var(--status-negative)' }}>{correct && (bet?.points_awarded ?? 0) > 0 ? '✓' : '✗'} {bet?.points_awarded ?? 0}p</span>}</div></section>})}</div>{!scored && <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Tuloksia ei vielä saatavilla</p>}<div className="mt-8 text-center"><span className="font-display text-[32px] font-black" style={{ color: 'var(--league-primary)' }}>Yhteensä: {data.current?.total_points_awarded ?? 0}p</span><span className="ml-2 text-base" style={{ color: 'var(--text-muted)' }}>/ {maxPoints}p mahdollista</span></div><Leaderboard participants={data.participants} currentId={data.current?.id ?? null} />{identity && <p className="mt-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>PIN: {identity.pin} · {formatDate(event.event_date)}</p>}</div></MainShell>
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
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [moving, setMoving] = useState(false)
  const [identityBusy, setIdentityBusy] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const players = useMemo(() => eventPlayers.map(item => item.player), [eventPlayers])

  async function loadResults(eventId: string, currentParticipantId: string) {
    const [{ data: participants, error: participantError }, { data: bets, error: betError }] = await Promise.all([
      db.from('betting_participants').select('*').eq('event_id', eventId).order('submitted_at', { ascending: true }),
      db.from('bets').select('*').eq('participant_id', currentParticipantId),
    ])
    if (participantError) throw participantError
    if (betError) throw betError
    const all = (participants ?? []) as unknown as Participant[]
    setResult({ current: all.find(participant => participant.id === currentParticipantId) ?? null, bets: (bets ?? []) as unknown as BetRow[], participants: all })
  }

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
        setEvent(loadedEvent)
        setEventPlayers((playerData ?? []) as unknown as EventPlayer[])
        setQuestions((questionData ?? []).map(normalizeEventQuestion))
        try {
          const season = await getCurrentSeason()
          const standings = await getLeaderboard(season.id)
          setSeasonStats(Object.fromEntries(standings.map(standing => [standing.player.id, { rank: standing.rank, points: standing.total_points }])))
        } catch {
          // Season standings are supporting card metadata; betting remains usable without them.
        }
        const savedIdentity = readStorage<Identity>(IDENTITY_KEY)
        const savedSubmission = readStorage<Submission>(submissionKey(loadedEvent.id))
        setIdentity(savedIdentity)
        if (loadedEvent.status === 'draft') { setMessage('Veikkaukset eivät ole vielä auki'); setStage('message'); return }
        if (savedSubmission?.submitted) {
          setParticipantId(savedSubmission.participant_id)
          await loadResults(loadedEvent.id, savedSubmission.participant_id)
          if (!cancelled) setStage('results')
          return
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
      let createdId = participantId
      if (createdId) {
        const updated = await db.rpc('update_public_betting_participant', { p_participant_id: createdId, p_pin: savedIdentity.pin, p_identity_token: savedIdentity.identity_token, p_bettor_account_id: account.id, p_is_event_player: codeCorrect })
        if (updated.error) throw updated.error
      } else {
        const insertedParticipant = await db.rpc('create_public_betting_participant', { p_event_id: payload.event_id, p_display_name: payload.display_name, p_pin: payload.pin, p_identity_token: payload.identity_token, p_bettor_account_id: payload.bettor_account_id, p_is_event_player: payload.is_event_player })
        if (insertedParticipant.error || !insertedParticipant.data) throw insertedParticipant.error ?? new Error('Osallistujan luonti epäonnistui')
        createdId = insertedParticipant.data as string
        setParticipantId(createdId)
      }
      setIsEventPlayer(codeCorrect)
      if (code && !codeCorrect) setStage('wrong-code')
      else setStage('questions')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tunnuksen luonti epäonnistui')
      setStage('submit-error')
    } finally { setIdentityBusy(false) }
  }

  function changeIdentity() { clearIdentity(); setIdentity(null); setParticipantId(null); setStage('identity') }

  function retryParticipantCode() { setStage('identity') }

  async function submitAnswers() {
    if (!event || !participantId || questions.some(question => answers[question.id] == null)) return
    setSubmitting(true)
    try {
      const submittedAt = new Date().toISOString()
      const rows = questions.map(question => ({ participant_id: participantId, question_id: question.id, answer: answers[question.id], points_awarded: null }))
      const betsInsert = await db.rpc('submit_public_bets', { p_event_id: event.id, p_participant_id: participantId, p_identity_token: identity?.identity_token, p_bets: rows.map(row => ({ question_id: row.question_id, answer: row.answer })) })
      if (betsInsert.error) throw betsInsert.error
      const submission: Submission = { submitted: true, participant_id: participantId, submitted_at: submittedAt }
      writeStorage(submissionKey(event.id), submission)
      const participant = { id: participantId, event_id: event.id, display_name: identity?.display_name ?? '', pin: identity?.pin ?? null, identity_token: identity?.identity_token ?? null, bettor_account_id: null, is_event_player: isEventPlayer, submitted_at: submittedAt, total_points_awarded: 0 }
      setResult({ current: participant, participants: [participant], bets: rows as BetRow[] })
      setStage('complete')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Veikkausten lähetys epäonnistui')
      setStage('submit-error')
    } finally { setSubmitting(false) }
  }

  function lockQuestion() {
    if (submitting) return
    if (!questions[currentQuestion]) return
    if (currentQuestion === questions.length - 1) { submitAnswers(); return }
    setMoving(true)
    window.setTimeout(() => { setCurrentQuestion(index => index + 1); setMoving(false) }, 180)
  }

  if (!event || stage === 'message') return <PageMessage>{message}</PageMessage>
  if (stage === 'submit-error') return <PageMessage action={<button type="button" onClick={() => setStage(participantId ? 'questions' : 'identity')} className="rounded-xl px-6 py-3 font-display font-bold" style={{ background: 'var(--league-primary)', color: 'var(--bg-dark)' }}>Palaa takaisin</button>}>{message}</PageMessage>
  if (stage === 'identity') return <IdentityForm event={event} initialIdentity={identity} onSubmit={createOrRecoverParticipant} busy={identityBusy} />
  if (stage === 'returning' && identity) return <ReturningIdentity event={event} identity={identity} onContinue={(code) => createOrRecoverParticipant(identity.display_name, identity.pin, code)} onChangeIdentity={changeIdentity} busy={identityBusy} />
  if (stage === 'wrong-code') return <WrongCodeNotice onRetry={retryParticipantCode} onContinue={() => setStage('questions')} />
  if (stage === 'questions' && questions[currentQuestion]) return <MainShell><QuestionCard question={questions[currentQuestion]} index={currentQuestion} total={questions.length} answer={answers[questions[currentQuestion].id] ?? null} players={players} event={event} seasonStats={seasonStats} moving={moving} submitting={submitting} onChange={answer => setAnswers(current => ({ ...current, [questions[currentQuestion].id]: answer }))} onLock={lockQuestion} /></MainShell>
  if (stage === 'complete' && identity) return <Completion event={event} questions={questions} players={players} answers={answers} identity={identity} isEventPlayer={isEventPlayer} />
  if (stage === 'results' && result) return <Results event={event} questions={questions} players={players} data={result} identity={identity} />
  return <PageMessage>{submitting ? 'Lähetetään…' : 'Ladataan…'}</PageMessage>
}
