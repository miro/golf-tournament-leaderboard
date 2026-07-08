import { useEffect, useRef, useState } from 'react'
import type { Player } from '../../../lib/database.types'
import InitialsAvatar from '../../../components/shared/InitialsAvatar'

export interface SeasonStanding {
  rank: number
  points: number
}

interface Props {
  players: Player[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  standingsByPlayer: Map<string, SeasonStanding>
}

function sortForCarousel(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    if (a.hcp_current !== null && b.hcp_current !== null) return a.hcp_current - b.hcp_current
    if (a.hcp_current !== null) return -1
    if (b.hcp_current !== null) return 1
    return a.full_name.localeCompare(b.full_name)
  })
}

export default function PlayerPickQuestion({ players, selectedId, onSelect, standingsByPlayer }: Props) {
  const sorted = sortForCarousel(players)
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number | null>(null)
  const [centeredIndex, setCenteredIndex] = useState(0)
  const [displayName, setDisplayName] = useState(sorted[0]?.full_name ?? '')
  const [nameVisible, setNameVisible] = useState(true)

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

  const centeredPlayer = sorted[centeredIndex]
  const isCenteredSelected = !!centeredPlayer && selectedId === centeredPlayer.id

  return (
    <div>
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
              <InitialsAvatar name={p.full_name} size={72} color="#2D6A4F" />
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
        {isCenteredSelected ? (
          <span className="font-display font-semibold text-gc-green" style={{ fontSize: 14 }}>
            ✓ Valittu
          </span>
        ) : (
          <div
            className="font-display font-semibold text-white transition-opacity duration-150"
            style={{ fontSize: 18, opacity: nameVisible ? 1 : 0 }}
          >
            {displayName}
          </div>
        )}
      </div>

      <div className="flex justify-center items-center gap-1.5 max-[380px]:gap-1 mt-3">
        {sorted.map((_, i) => (
          <span
            key={i}
            className={`rounded-full shrink-0 max-[380px]:w-1 max-[380px]:h-1 ${
              i === centeredIndex ? 'w-2 h-2 bg-gc-green' : 'w-1.5 h-1.5 bg-gc-muted/50'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
