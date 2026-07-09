import { useEffect, useRef, useState } from 'react'
import type { Player } from '../../../lib/database.types'
import InitialsAvatar from '../../../components/shared/InitialsAvatar'
import type { SeasonStanding } from './types'

const KAJAANI_GREEN = '#2D6A4F'
const QUESTION_INDEX = 6
const TOTAL_QUESTIONS = 9

function sortForCarousel(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    if (a.hcp_current !== null && b.hcp_current !== null) return a.hcp_current - b.hcp_current
    if (a.hcp_current !== null) return -1
    if (b.hcp_current !== null) return 1
    return a.full_name.localeCompare(b.full_name)
  })
}

interface Props {
  players: Player[]
  targetPlayer: Player
  standingsByPlayer: Map<string, SeasonStanding>
  selectedId: string | null
  onSelect: (id: string | null) => void
  lockDisabled: boolean
  onLock: () => void
  transitioningOut: boolean
}

export default function BeatTheLeaderQuestion({
  players,
  targetPlayer,
  standingsByPlayer,
  selectedId,
  onSelect,
  lockDisabled,
  onLock,
  transitioningOut,
}: Props) {
  const sorted = sortForCarousel(players.filter(p => p.id !== targetPlayer.id))
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number | null>(null)
  const [centeredIndex, setCenteredIndex] = useState(0)
  const [displayName, setDisplayName] = useState(sorted[0]?.full_name ?? '')
  const [nameVisible, setNameVisible] = useState(true)

  const targetStanding = standingsByPlayer.get(targetPlayer.id)

  function updateCentered() {
    const container = containerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const centerX = containerRect.left + containerRect.width / 2
    let closestIdx = 0
    let closestDist = Infinity
    cardRefs.current.forEach((el, i) => {
      if (!el) return
      const rect = el.getBoundingClientRect()
      const dist = Math.abs(rect.left + rect.width / 2 - centerX)
      if (dist < closestDist) {
        closestDist = dist
        closestIdx = i
      }
    })
    setCenteredIndex(closestIdx)
  }

  function onScroll() {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      updateCentered()
      rafRef.current = null
    })
  }

  useEffect(() => {
    updateCentered()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setNameVisible(false)
    const t = setTimeout(() => {
      setDisplayName(sorted[centeredIndex]?.full_name ?? '')
      setNameVisible(true)
    }, 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centeredIndex])

  function handleCardTap(i: number) {
    if (i === centeredIndex) {
      const player = sorted[i]
      onSelect(selectedId === player.id ? null : player.id)
    } else {
      cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }

  return (
    <div
      className={`transition-all duration-200 ${
        transitioningOut ? '-translate-x-8 opacity-0 scale-95' : 'translate-x-0 opacity-100 scale-100'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-6">
        {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
          <span
            key={i}
            className={`h-2 flex-1 rounded-full ${
              i === QUESTION_INDEX ? 'bg-gc-green animate-pulse' : i < QUESTION_INDEX ? 'bg-gc-green' : 'bg-white/10'
            }`}
          />
        ))}
        <span className="label ml-2 shrink-0">{QUESTION_INDEX + 1}/{TOTAL_QUESTIONS}</span>
      </div>

      <div className="label mb-2">VEIKKAUS {QUESTION_INDEX + 1}/{TOTAL_QUESTIONS}</div>

      <div className="label mb-2" style={{ color: '#E8A820' }}>
        HAASTETTAVA
      </div>
      <div
        className="flex items-center justify-between mb-6"
        style={{ background: '#221D17', border: '2px solid rgba(232,168,32,0.4)', borderRadius: 12, padding: 16, minHeight: 100 }}
      >
        <div className="flex items-center gap-3">
          <InitialsAvatar name={targetPlayer.full_name} size={48} color={KAJAANI_GREEN} />
          <div>
            <div className="font-display font-bold text-white" style={{ fontSize: 20 }}>
              {targetPlayer.full_name}
            </div>
            {targetStanding && (
              <>
                <div style={{ color: '#E8A820', fontSize: 14 }}>{targetStanding.rank}. sija</div>
                <div style={{ color: '#E8A820', fontSize: 16, fontWeight: 700 }}>{targetStanding.points}p</div>
              </>
            )}
          </div>
        </div>
        <span style={{ fontSize: 32 }}>👑</span>
      </div>

      <h2 className="font-display font-bold text-white leading-tight mb-1" style={{ fontSize: 24 }}>
        Kuka päihittää heidät tällä kierroksella?
      </h2>
      <p className="text-gc-muted mb-6" style={{ fontSize: 14 }}>
        Stableford-pisteet tällä kierroksella
      </p>

      <div
        ref={containerRef}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar gap-4 pl-[17.5%] pr-[17.5%]"
      >
        {sorted.map((p, i) => {
          const diff = Math.abs(i - centeredIndex)
          const selected = p.id === selectedId
          const opacity = diff === 0 ? 1 : diff === 1 ? 0.5 : 0.2
          const scale = diff === 0 ? 1 : diff === 1 ? 0.85 : 0.75
          const standing = standingsByPlayer.get(p.id)
          return (
            <div
              key={p.id}
              ref={el => {
                cardRefs.current[i] = el
              }}
              onClick={() => handleCardTap(i)}
              className="shrink-0 snap-center relative flex flex-col items-center justify-center text-center w-[65%] aspect-[3/4] rounded-2xl p-6 cursor-pointer"
              style={{
                background: selected ? 'rgba(232,168,32,0.08)' : '#221D17',
                border: selected ? '2px solid #E8A820' : '1px solid rgba(255,255,255,0.10)',
                opacity,
                transform: `scale(${scale})`,
                transition: 'transform 200ms ease, opacity 200ms ease',
              }}
            >
              {selected && (
                <span
                  className="absolute flex items-center justify-center text-white"
                  style={{ top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', background: '#E8A820', fontSize: 14 }}
                >
                  ✓
                </span>
              )}
              <InitialsAvatar name={p.full_name} size={72} color={KAJAANI_GREEN} />
              <div className="font-display font-bold text-white mt-4" style={{ fontSize: 22 }}>
                {p.full_name}
              </div>
              <div className="text-gc-muted mt-1" style={{ fontSize: 14 }}>
                HCP {p.hcp_current ?? '—'}
              </div>
              {standing && (
                <>
                  <div className="text-gc-green mt-1" style={{ fontSize: 14 }}>
                    {standing.rank}. sija
                  </div>
                  <div className="text-gc-green font-bold" style={{ fontSize: 20 }}>
                    {standing.points}p
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="text-center mt-4">
        <div
          className="font-display font-semibold text-white transition-opacity duration-150"
          style={{ fontSize: 18, opacity: nameVisible ? 1 : 0 }}
        >
          {displayName}
        </div>
      </div>

      <div className="flex justify-center items-center gap-1.5 max-[380px]:gap-1 mt-3 mb-5">
        {sorted.map((_, i) => (
          <span
            key={i}
            className={`rounded-full shrink-0 max-[380px]:w-1 max-[380px]:h-1 ${
              i === centeredIndex ? 'w-2 h-2 bg-gc-green' : 'w-1.5 h-1.5 bg-gc-muted/50'
            }`}
          />
        ))}
      </div>

      <button
        className="btn-primary w-full text-lg py-3 disabled:opacity-30 disabled:cursor-not-allowed"
        disabled={lockDisabled}
        onClick={onLock}
      >
        {lockDisabled ? 'Valitse haastaja' : 'LUKITSE VEIKKAUS →'}
      </button>
    </div>
  )
}
