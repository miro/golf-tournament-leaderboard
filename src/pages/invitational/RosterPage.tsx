import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getActivePlayers,
  getAllSeasonRounds,
  getCurrentSeason,
  getHoleResultsForRounds,
  getInvitationalResults,
  getLeaderboard,
  getSeasonCourses,
} from '../../lib/queries'
import { skinsByPlayerId } from '../../lib/skins'
import BackButton from './BackButton'
import { AMBER, buildRoster, INVITATIONAL_ROSTER_2026, type KesakisaStats, type RosterEntry } from './roster'
import RosterCard from './RosterCard'
import IntroCard from './IntroCard'
import StoryProgressBar from './StoryProgressBar'

const SWIPE_THRESHOLD = 50
const SNAP_MS = 300
/** Below this much movement a touch counts as a tap rather than a drag. */
const TAP_SLOP = 8
/** Taps left of this fraction of the width go back; the rest go forward. */
const BACK_ZONE = 0.4

export default function InvitationalRosterPage() {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null)
  const [historyYears, setHistoryYears] = useState(0)
  const [loadError, setLoadError] = useState(false)
  /** Slide 0 is the intro card; players occupy 1..roster.length. */
  const [index, setIndex] = useState(0)
  const [interacted, setInteracted] = useState(false)
  /** Held down — freezes the story bar and its auto-advance. */
  const [held, setHeld] = useState(false)

  // Carousel transform: `slide` is the committed ±1 step being animated, `drag` the
  // live finger offset in px, `anim` whether the track is currently transitioning.
  const [slide, setSlide] = useState(0)
  const [drag, setDrag] = useState(0)
  const [anim, setAnim] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const touchStart = useRef<{ x: number; y: number; axis: '?' | 'x' | 'y' } | null>(null)
  /** Suppresses the synthetic click that follows a touch on mobile. */
  const recentTouch = useRef(false)
  /** Deep-link target read once, before any URL rewriting happens. */
  const [requestedSlug] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('player'),
  )

  /** Number of player cards. */
  const playerCount = roster?.length ?? 0
  /** Number of slides including the intro card at index 0. */
  const total = playerCount > 0 ? playerCount + 1 : 0

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const season = await getCurrentSeason()
        const [players, standings, results, seasonCourses, rounds] = await Promise.all([
          getActivePlayers(),
          getLeaderboard(season.id),
          getInvitationalResults(),
          getSeasonCourses(season.id),
          getAllSeasonRounds(season.id),
        ])
        // Skins are contested against the whole field, so this is computed from every
        // player's rounds — not just the Invitational twelve.
        const holeResults = await getHoleResultsForRounds(rounds.map(r => r.id))
        if (cancelled) return

        const skins = skinsByPlayerId(rounds, holeResults, seasonCourses.map(sc => sc.course))
        const holesByPlayer = new Map<string, number>()
        const playerByRound = new Map(rounds.map(r => [r.id, r.player_id]))
        for (const hr of holeResults) {
          const pid = playerByRound.get(hr.round_id)
          if (pid) holesByPlayer.set(pid, (holesByPlayer.get(pid) ?? 0) + 1)
        }
        const kesakisa = new Map<string, KesakisaStats>()
        for (const p of players) {
          kesakisa.set(p.id, { holesPlayed: holesByPlayer.get(p.id) ?? 0, skins: skins.get(p.id) ?? 0 })
        }

        const field = new Set(INVITATIONAL_ROSTER_2026)
        const built = buildRoster(players.filter(p => field.has(p.slug)), standings, results, kesakisa)
        // Deep links address players, so shift past the intro card at slide 0.
        const start = requestedSlug ? built.findIndex(e => e.player.slug === requestedSlug) : -1
        setIndex(start >= 0 ? start + 1 : 0)
        setHistoryYears(results.length)
        setRoster(built)
      } catch {
        if (!cancelled) setLoadError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [requestedSlug])

  // Full-screen screenshot mode — no page scroll behind the carousel.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const settle = useCallback(() => {
    setAnim(true)
    setDrag(0)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setAnim(false), SNAP_MS)
  }, [])

  const go = useCallback(
    (dir: 1 | -1) => {
      if (busy.current) return
      if (total < 2) {
        settle()
        return
      }
      busy.current = true
      setInteracted(true)
      setAnim(true)
      setDrag(0)
      // Moving forward slides the track left.
      setSlide(dir === 1 ? -1 : 1)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        setIndex(i => (i + dir + total) % total)
        setSlide(0)
        setAnim(false)
        busy.current = false
      }, SNAP_MS)
    },
    [total, settle],
  )

  const tapAt = useCallback(
    (clientX: number) => {
      const width = containerRef.current?.clientWidth ?? window.innerWidth
      go(clientX < width * BACK_ZONE ? -1 : 1)
    },
    [go],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  // Keep the URL pointing at the visible card so it can be shared as-is. The intro
  // card is not a player, so it drops the query param entirely.
  useEffect(() => {
    if (!roster) return
    const entry = index > 0 ? roster[index - 1] : null
    window.history.replaceState(
      null,
      '',
      entry ? `/invitational/roster?player=${entry.player.slug}` : '/invitational/roster',
    )
  }, [index, roster])

  function onTouchStart(e: React.TouchEvent) {
    setHeld(true)
    if (busy.current) return
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY, axis: '?' }
    window.clearTimeout(timer.current)
    setAnim(false)
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = touchStart.current
    if (!start || busy.current) return
    const t = e.touches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (start.axis === '?') {
      if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (start.axis !== 'x') return
    setDrag(dx)
  }

  function onTouchEnd(e: React.TouchEvent) {
    setHeld(false)
    const start = touchStart.current
    touchStart.current = null
    recentTouch.current = true
    window.setTimeout(() => {
      recentTouch.current = false
    }, 400)
    if (!start || busy.current) return

    const endX = e.changedTouches[0]?.clientX ?? start.x
    const dx = endX - start.x

    if (start.axis === '?') tapAt(endX)
    else if (start.axis === 'x' && Math.abs(dx) > SWIPE_THRESHOLD) go(dx < 0 ? 1 : -1)
    else settle()
  }

  function onClick(e: React.MouseEvent) {
    if (recentTouch.current) return
    tapAt(e.clientX)
  }

  if (!roster || total === 0) {
    return (
      <div
        style={{
          // Matches the loaded carousel: fills the column, not the viewport.
          position: 'relative',
          width: '100%',
          height: '100dvh',
          background: '#17130F',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <img
          src="/gc-logo.png"
          alt="GC"
          className={loadError || roster ? undefined : 'animate-pulse'}
          style={{ height: 64, width: 'auto', filter: 'invert(1)' }}
        />
        {loadError && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)' }}>Rosteria ei saatu ladattua</div>}
        {!loadError && roster && total === 0 && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)' }}>Ei pelaajia</div>
        )}
      </div>
    )
  }

  const prevIndex = (index - 1 + total) % total
  const nextIndex = (index + 1) % total
  // With three or more cards each slot holds a distinct roster entry, so keying by
  // roster index lets React keep the already-loaded photo nodes across a step.
  const slots =
    total >= 3
      ? [
          { key: String(prevIndex), i: prevIndex, offset: -100 },
          { key: String(index), i: index, offset: 0 },
          { key: String(nextIndex), i: nextIndex, offset: 100 },
        ]
      : [
          { key: 'prev', i: prevIndex, offset: -100 },
          { key: 'cur', i: index, offset: 0 },
          { key: 'next', i: nextIndex, offset: 100 },
        ]

  return (
    <div
      ref={containerRef}
      // Relative, not fixed: the carousel fills the phone-width column it sits in
      // rather than the whole viewport, which is what makes the desktop framing work.
      style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#17130F' }}
    >
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        // Without this a cancelled touch would leave the story timer paused forever.
        onTouchCancel={onTouchEnd}
        onClick={onClick}
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateX(calc(${slide * 100}% + ${drag}px))`,
          transition: anim ? `transform ${SNAP_MS}ms ease-out` : 'none',
          touchAction: 'none',
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {slots.map(slot => (
          <div key={slot.key} style={{ position: 'absolute', inset: 0, transform: `translateX(${slot.offset}%)` }}>
            {slot.i === 0 ? (
              <IntroCard playerCount={playerCount} historyYears={historyYears} />
            ) : (
              <RosterCard
                entry={roster[slot.i - 1]}
                position={slot.i}
                total={playerCount}
                showHint={slot.i === 1 && !interacted}
              />
            )}
          </div>
        ))}
      </div>

      {/* Story timer. Keyed on the slide so it remounts and refills from zero. */}
      <StoryProgressBar key={index} paused={held} onComplete={() => go(1)} />

      {/* Sibling of the gesture track, so a tap here never advances the carousel.
          Clears the 3px story bar, which sits at the very top and ignores taps. */}
      <BackButton to="/invitational" label="Takaisin Invitationalin etusivulle" />

      {/* Dots ride at the top under the story bar rather than along the bottom, which
          gives the info panel back the height its longest cards were losing. */}
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: 0,
          right: 0,
          marginTop: 6,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 4,
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        {/* One dot per player; none lit on the intro card, which is slide 0. */}
        {roster.map((e, i) => (
          <span
            key={e.player.id}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: i === index - 1 ? AMBER : 'rgba(154,136,112,0.50)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
