import { useEffect, useRef, useState } from 'react'
import type { Player } from '../../../lib/database.types'
import InitialsAvatar from '../../../components/shared/InitialsAvatar'
import type { SeasonStanding } from './types'

export type BetKey = 'best_total' | 'best_front' | 'best_back' | 'best_scratch'

export type CombinedAssignments = Record<BetKey, string | null>

const BET_TYPES: Array<{ key: BetKey; icon: string; label: string; totemLabel: string }> = [
  { key: 'best_total', icon: '🏆', label: 'Paras tulos', totemLabel: 'Paras' },
  { key: 'best_front', icon: '⛳', label: 'Paras etuyhdeksän', totemLabel: 'Etu9' },
  { key: 'best_back', icon: '🏌️', label: 'Paras takayhdeksän', totemLabel: 'Taka9' },
  { key: 'best_scratch', icon: '📊', label: 'Paras scratch', totemLabel: 'Scratch' },
]

// Reserved space above each card for the totem chip zone (absolutely positioned, max ~4 chips)
const CHIP_ZONE_RESERVE_PX = 145

function firstUnassigned(assignments: CombinedAssignments): BetKey | null {
  return BET_TYPES.find(b => !assignments[b.key])?.key ?? null
}

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
  standingsByPlayer: Map<string, SeasonStanding>
  assignments: CombinedAssignments
  onAssign: (key: BetKey, playerId: string | null) => void
  onLock: () => void
  transitioningOut: boolean
}

export default function CombinedPlayerPickScreen({ players, standingsByPlayer, assignments, onAssign, onLock, transitioningOut }: Props) {
  const sorted = sortForCarousel(players)
  const playersById = new Map(players.map(p => [p.id, p]))
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const betChipRefs = useRef<(HTMLButtonElement | null)[]>([])
  const rafRef = useRef<number | null>(null)
  const [centeredIndex, setCenteredIndex] = useState(0)
  const [displayName, setDisplayName] = useState(sorted[0]?.full_name ?? '')
  const [nameVisible, setNameVisible] = useState(true)
  const [activeBet, setActiveBet] = useState<BetKey | null>(() => firstUnassigned(assignments))
  const [flash, setFlash] = useState(false)

  const prevAssignmentsRef = useRef(assignments)
  const [enteringChip, setEnteringChip] = useState<{ playerId: string; key: BetKey } | null>(null)
  const [exitingChip, setExitingChip] = useState<{ playerId: string; key: BetKey } | null>(null)
  const assignCounterRef = useRef(0)
  const [assignOrder, setAssignOrder] = useState<Partial<Record<BetKey, number>>>({})

  useEffect(() => {
    const prev = prevAssignmentsRef.current
    for (const bet of BET_TYPES) {
      if (prev[bet.key] !== assignments[bet.key]) {
        if (prev[bet.key]) {
          const removedFrom = prev[bet.key] as string
          setExitingChip({ playerId: removedFrom, key: bet.key })
          setTimeout(() => setExitingChip(null), 100)
        }
        if (assignments[bet.key]) {
          const addedTo = assignments[bet.key] as string
          setEnteringChip({ playerId: addedTo, key: bet.key })
          setTimeout(() => setEnteringChip(null), 150)
          assignCounterRef.current += 1
          const order = assignCounterRef.current
          setAssignOrder(o => ({ ...o, [bet.key]: order }))
        }
      }
    }
    prevAssignmentsRef.current = assignments
  }, [assignments])

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

  useEffect(() => {
    if (activeBet === null) return
    const idx = BET_TYPES.findIndex(b => b.key === activeBet)
    betChipRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeBet])

  function handleChipClick(key: BetKey) {
    if (assignments[key]) {
      onAssign(key, null)
      setActiveBet(key)
    } else if (key !== activeBet) {
      setActiveBet(key)
    }
  }

  function handleCenterTap(player: Player) {
    if (activeBet === null) {
      setFlash(true)
      setTimeout(() => setFlash(false), 200)
      return
    }
    if (assignments[activeBet] === player.id) {
      onAssign(activeBet, null)
      return
    }
    onAssign(activeBet, player.id)
    const nextAssignments = { ...assignments, [activeBet]: player.id }
    setActiveBet(firstUnassigned(nextAssignments))
  }

  function handleCardTap(i: number) {
    if (i === centeredIndex) {
      handleCenterTap(sorted[i])
    } else {
      cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }

  function removeViaTotem(key: BetKey) {
    onAssign(key, null)
    setActiveBet(key)
  }

  const assignedCount = BET_TYPES.filter(b => assignments[b.key]).length
  const allAssigned = assignedCount === 4
  const filledCount = 2 + assignedCount
  const centeredPlayer = sorted[centeredIndex]

  let instruction: { text: string; green?: boolean }
  if (allAssigned) {
    instruction = { text: 'Kaikki veikkaukset tehty ✓', green: true }
  } else if (activeBet !== null) {
    instruction = centeredPlayer
      ? { text: `Napauta korttia valitaksesi ${centeredPlayer.full_name}` }
      : { text: `Selaa pelaajia ja valitse ${BET_TYPES.find(b => b.key === activeBet)!.label}` }
  } else {
    instruction = { text: 'Valitse veikkaus yllä, sitten pelaaja alla' }
  }

  return (
    <div
      className={`transition-all duration-200 ${
        transitioningOut ? '-translate-x-8 opacity-0 scale-95' : 'translate-x-0 opacity-100 scale-100'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className={`h-2 flex-1 rounded-full ${
              i < filledCount ? 'bg-gc-green' : i === filledCount && !allAssigned ? 'bg-gc-green animate-pulse' : 'bg-white/10'
            }`}
          />
        ))}
        <span className="label ml-2 shrink-0">3–6/9</span>
      </div>

      <h2 className="font-display font-bold text-3xl text-white leading-tight mb-1">Valitse veikkauksesi</h2>
      <p className="text-gc-muted mb-6" style={{ fontSize: 15 }}>
        Jaa veikkaukset haluamillesi pelaajille
      </p>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1 mb-3">
        {BET_TYPES.map((bet, betIdx) => {
          const assignedPlayerId = assignments[bet.key]
          const assignedPlayer = assignedPlayerId ? playersById.get(assignedPlayerId) : null
          const isActive = activeBet === bet.key
          const isAssigned = !!assignedPlayerId
          return (
            <button
              key={bet.key}
              ref={el => {
                betChipRefs.current[betIdx] = el
              }}
              onClick={() => handleChipClick(bet.key)}
              className="relative shrink-0 flex flex-col items-center justify-center transition-transform"
              style={{
                minHeight: 44,
                padding: '8px 14px',
                borderRadius: 22,
                borderWidth: isActive ? 2 : 1,
                borderStyle: 'solid',
                borderColor: isActive ? '#E8A820' : isAssigned ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.12)',
                background: isActive ? 'rgba(232,168,32,0.2)' : '#2a2520',
                transform: isActive ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              <div className="flex items-center" style={{ gap: 8 }}>
                <span>{bet.icon}</span>
                <span className={`font-display font-semibold text-sm whitespace-nowrap ${isActive ? 'text-white' : 'text-gc-muted'}`}>
                  {bet.label}
                </span>
              </div>
              {isAssigned && assignedPlayer && (
                <span
                  className="text-gc-green font-semibold whitespace-nowrap animate-chip-name-fade-in"
                  style={{ fontSize: 10 }}
                >
                  {assignedPlayer.full_name.split(' ')[0]}
                </span>
              )}
              {isActive && (
                <span
                  className="absolute rounded-full bg-gc-green animate-pulse"
                  style={{ width: 8, height: 8, top: -2, right: -2 }}
                />
              )}
              {isAssigned && (
                <span
                  className="absolute flex items-center justify-center rounded-full bg-green-500 text-white"
                  style={{ width: 14, height: 14, top: -4, right: -4, fontSize: 9 }}
                >
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p
        className={`text-center italic mb-4 ${instruction.green ? 'text-green-500' : 'text-gc-muted'}`}
        style={{ fontSize: 13, transform: flash ? 'scale(1.08)' : 'scale(1)', transition: 'transform 150ms ease' }}
      >
        {instruction.text}
      </p>

      <div
        ref={containerRef}
        onScroll={onScroll}
        className="flex items-end overflow-x-auto snap-x snap-mandatory no-scrollbar gap-4 pl-[17.5%] pr-[17.5%]"
        style={{ paddingTop: CHIP_ZONE_RESERVE_PX }}
      >
        {sorted.map((p, i) => {
          const diff = Math.abs(i - centeredIndex)
          const opacity = diff === 0 ? 1 : diff === 1 ? 0.5 : 0.2
          const scale = diff === 0 ? 1 : diff === 1 ? 0.85 : 0.75
          const standing = standingsByPlayer.get(p.id)

          const assignedKeys = BET_TYPES.filter(b => assignments[b.key] === p.id).map(b => b.key)
          const chipKeys = [...assignedKeys]
          if (exitingChip && exitingChip.playerId === p.id && !chipKeys.includes(exitingChip.key)) {
            chipKeys.push(exitingChip.key)
          }
          const orderedChips = BET_TYPES.filter(b => chipKeys.includes(b.key)).sort(
            (a, b) => (assignOrder[b.key] ?? 0) - (assignOrder[a.key] ?? 0),
          )
          const hasChips = assignedKeys.length > 0
          const glow = assignedKeys.length === 4
          const isCentered = diff === 0

          return (
            <div
              key={p.id}
              ref={el => {
                cardRefs.current[i] = el
              }}
              onClick={() => handleCardTap(i)}
              className="shrink-0 snap-center relative flex flex-col items-center justify-center text-center w-[65%] aspect-[3/4] rounded-2xl p-6 cursor-pointer"
              style={{
                background: hasChips ? '#281F14' : '#221D17',
                border: `1px solid ${hasChips ? (isCentered ? 'rgba(232,168,32,0.40)' : 'rgba(232,168,32,0.20)') : 'rgba(255,255,255,0.10)'}`,
                boxShadow: glow ? '0 0 14px rgba(232,168,32,0.6)' : undefined,
                opacity,
                transform: `scale(${scale})`,
                transition: 'transform 200ms ease, opacity 200ms ease',
              }}
            >
              {orderedChips.length > 0 && (
                <div
                  className="absolute left-0 right-0 flex flex-col-reverse"
                  style={{
                    bottom: '100%',
                    background: '#1a1612',
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    padding: '8px 12px',
                    gap: 4,
                  }}
                >
                  {orderedChips.map(bet => {
                    const isEntering = enteringChip?.key === bet.key && enteringChip.playerId === p.id
                    const isExiting = exitingChip?.key === bet.key && exitingChip.playerId === p.id && !assignedKeys.includes(bet.key)
                    return (
                      <div
                        key={bet.key}
                        onClick={e => e.stopPropagation()}
                        className={`flex items-center justify-between w-full ${isEntering ? 'animate-totem-chip-in' : ''} ${
                          isExiting ? 'animate-totem-chip-out' : ''
                        }`}
                        style={{
                          height: 28,
                          padding: '0 8px',
                          borderRadius: 6,
                          background: 'rgba(232,168,32,0.15)',
                          border: '1px solid rgba(232,168,32,0.4)',
                        }}
                      >
                        <span className="text-white font-bold truncate" style={{ fontSize: 12 }}>
                          {bet.icon} {bet.totemLabel}
                        </span>
                        <button
                          onClick={() => removeViaTotem(bet.key)}
                          className="text-white/70 shrink-0"
                          style={{ fontSize: 12, marginLeft: 6 }}
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
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
        disabled={!allAssigned}
        onClick={onLock}
      >
        {allAssigned ? 'LUKITSE VEIKKAUKSET →' : `Veikkaa vielä ${4 - assignedCount} tulosta`}
      </button>
    </div>
  )
}
