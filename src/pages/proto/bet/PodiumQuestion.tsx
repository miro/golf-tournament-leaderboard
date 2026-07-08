import { useEffect, useRef, useState } from 'react'
import type { Player } from '../../../lib/database.types'
import InitialsAvatar from '../../../components/shared/InitialsAvatar'

const MEDALS = ['🥇', '🥈', '🥉']
const SLOT_TINTS = ['#E8A820', '#C7C7C7', '#C6763D']
const HOLD_MS = 300
const MOVE_CANCEL_PX = 10

interface Props {
  players: Player[]
  podium: (string | null)[]
  onChange: (podium: (string | null)[]) => void
}

export default function PodiumQuestion({ players, podium, onChange }: Props) {
  const slotRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const [dragPlayerId, setDragPlayerId] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [hoverSlot, setHoverSlot] = useState<number | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const movedTooFar = useRef(false)

  const byId = new Map(players.map(p => [p.id, p]))
  const available = players.filter(p => !podium.includes(p.id))

  function placeInNextEmptySlot(playerId: string) {
    const idx = podium.findIndex(s => s === null)
    if (idx === -1) return
    const next = [...podium]
    next[idx] = playerId
    onChange(next)
  }

  function removeFromSlot(slotIdx: number) {
    const next = [...podium]
    next[slotIdx] = null
    onChange(next)
  }

  function placeInSlot(playerId: string, slotIdx: number) {
    const next = [...podium]
    next[slotIdx] = playerId
    onChange(next)
  }

  function cancelHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  function slotIndexAtPoint(x: number, y: number): number | null {
    for (let i = 0; i < slotRefs.length; i++) {
      const el = slotRefs[i].current
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return i
    }
    return null
  }

  function handlePointerDown(e: React.PointerEvent, playerId: string) {
    startPos.current = { x: e.clientX, y: e.clientY }
    movedTooFar.current = false
    cancelHold()
    holdTimer.current = setTimeout(() => {
      if (!movedTooFar.current) {
        setDragPlayerId(playerId)
        setDragPos({ x: e.clientX, y: e.clientY })
      }
    }, HOLD_MS)
  }

  function handlePointerMoveOnCard(e: React.PointerEvent) {
    if (dragPlayerId || !startPos.current) return
    const dx = e.clientX - startPos.current.x
    const dy = e.clientY - startPos.current.y
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
      movedTooFar.current = true
      cancelHold()
    }
  }

  function handlePointerUpOnCard(playerId: string) {
    const wasDragging = dragPlayerId === playerId
    cancelHold()
    if (!wasDragging && !movedTooFar.current) {
      placeInNextEmptySlot(playerId)
    }
  }

  useEffect(() => {
    if (!dragPlayerId) return
    const draggedId = dragPlayerId

    function onMove(e: PointerEvent) {
      setDragPos({ x: e.clientX, y: e.clientY })
      setHoverSlot(slotIndexAtPoint(e.clientX, e.clientY))
    }

    function onUp(e: PointerEvent) {
      const dropSlot = slotIndexAtPoint(e.clientX, e.clientY)
      if (dropSlot !== null) placeInSlot(draggedId, dropSlot)
      setDragPlayerId(null)
      setDragPos(null)
      setHoverSlot(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragPlayerId])

  const dragPlayer = dragPlayerId ? byId.get(dragPlayerId) : null

  return (
    <div>
      <div className="flex gap-2 mb-5">
        {[0, 1, 2].map(i => {
          const playerId = podium[i]
          const player = playerId ? byId.get(playerId) : null
          const isHover = hoverSlot === i
          return (
            <div
              key={i}
              ref={slotRefs[i]}
              className="flex-1 card p-2 flex flex-col items-center gap-1 relative min-h-[104px] justify-center"
              style={{
                borderColor: isHover ? '#E8A820' : undefined,
                borderWidth: isHover ? 2 : 1,
                background: player ? `${SLOT_TINTS[i]}22` : undefined,
              }}
            >
              <span style={{ fontSize: 26 }}>{MEDALS[i]}</span>
              <span className="label text-[10px]">{i + 1}. sija</span>
              {player ? (
                <>
                  <button
                    className="absolute top-1 right-1 text-gc-muted flex items-center justify-center"
                    style={{ width: 20, height: 20 }}
                    onClick={() => removeFromSlot(i)}
                  >
                    ✕
                  </button>
                  <InitialsAvatar name={player.full_name} size={28} />
                  <span className="text-white text-xs font-semibold text-center truncate w-full px-1">
                    {player.full_name}
                  </span>
                </>
              ) : (
                <span className="text-gc-muted text-xs">Tyhjä</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="label mb-2">Valitse pelaajat</div>
      <div className="grid grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto pr-1">
        {available.map(p => (
          <div
            key={p.id}
            onPointerDown={e => handlePointerDown(e, p.id)}
            onPointerMove={handlePointerMoveOnCard}
            onPointerUp={() => handlePointerUpOnCard(p.id)}
            onPointerCancel={cancelHold}
            className="card p-3 flex items-center gap-2 select-none touch-none cursor-pointer"
            style={{ opacity: dragPlayerId === p.id ? 0.3 : 1 }}
          >
            <InitialsAvatar name={p.full_name} size={32} />
            <div className="min-w-0">
              <div className="font-display font-semibold text-white text-sm leading-tight truncate">{p.full_name}</div>
              <div className="text-xs text-gc-muted">HCP {p.hcp_current ?? '–'}</div>
            </div>
          </div>
        ))}
      </div>

      {dragPlayer && dragPos && (
        <div
          className="fixed z-50 pointer-events-none card px-3 py-2 flex items-center gap-2 shadow-2xl"
          style={{ left: dragPos.x - 60, top: dragPos.y - 28, width: 120, borderColor: '#E8A820', borderWidth: 2 }}
        >
          <InitialsAvatar name={dragPlayer.full_name} size={24} />
          <span className="text-white text-xs font-semibold truncate">{dragPlayer.full_name}</span>
        </div>
      )}
    </div>
  )
}
