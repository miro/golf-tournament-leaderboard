import { useRef, useState } from 'react'
import { CATEGORY_META, CATEGORY_ORDER, type CompositionAnswer, type HoleCategory, compositionCounts, compositionPoints, compositionTotal } from './types'

const TARGET = 18
const MAX_UNDO = 10
const EMPTY_CELL_BG = '#2a2520'

// Standard 4-4-3-5 layout per nine, summing to par 72
const HOLE_PARS: number[] = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]

interface Props {
  value: CompositionAnswer
  onChange: (value: CompositionAnswer) => void
}

function holeIndexFromPoint(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)
  const cell = el instanceof Element ? el.closest<HTMLElement>('[data-hole]') : null
  if (!cell) return null
  const idx = Number(cell.dataset.hole)
  return Number.isNaN(idx) ? null : idx
}

export default function CompositionQuestion({ value, onChange }: Props) {
  const [brush, setBrush] = useState<HoleCategory>('par')
  const [canUndo, setCanUndo] = useState(false)
  const historyRef = useRef<(HoleCategory | null)[][]>([])

  const total = compositionTotal(value)
  const counts = compositionCounts(value)
  const points = compositionPoints(value)
  const fillPct = Math.min(100, (total / TARGET) * 100)

  function undo() {
    const prev = historyRef.current.pop()
    setCanUndo(historyRef.current.length > 0)
    if (prev) onChange({ holes: prev })
  }

  function handlePointerDown(e: React.PointerEvent, startHole: number) {
    e.preventDefault()
    historyRef.current.push([...value.holes])
    if (historyRef.current.length > MAX_UNDO) historyRef.current.shift()
    setCanUndo(true)

    const working = [...value.holes]
    const touched = new Set<number>()
    let lastHole = startHole
    let moved = false

    function paint(hole: number) {
      if (touched.has(hole)) return
      touched.add(hole)
      working[hole] = brush
      onChange({ holes: [...working] })
    }

    function onMove(ev: PointerEvent) {
      const hole = holeIndexFromPoint(ev.clientX, ev.clientY)
      if (hole === null || hole === lastHole) return
      moved = true
      lastHole = hole
      paint(startHole)
      paint(hole)
    }

    function onUp() {
      if (!moved) {
        working[startHole] = working[startHole] === brush ? null : brush
        onChange({ holes: [...working] })
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div>
      <p className="text-gc-muted text-sm italic mb-4">Valitse tulos ja maalaa väylät</p>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-3 -mx-1 px-1">
        {CATEGORY_ORDER.map(key => {
          const meta = CATEGORY_META[key]
          const active = brush === key
          return (
            <button
              key={key}
              onClick={() => setBrush(key)}
              className="shrink-0 flex items-center gap-1.5 rounded-full transition-transform"
              style={{
                height: 44,
                padding: '8px 14px',
                borderRadius: 22,
                borderWidth: active ? 2 : 1,
                borderStyle: 'solid',
                borderColor: active ? meta.color : 'rgba(255,255,255,0.12)',
                background: active ? `${meta.color}4D` : EMPTY_CELL_BG,
                color: active ? 'white' : '#9A8870',
                transform: active ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              <span>{meta.emoji}</span>
              <span className="font-display font-semibold text-sm whitespace-nowrap">{meta.label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex justify-end mb-2">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="text-sm text-gc-muted disabled:opacity-30 px-1"
        >
          ↩ Kumoa
        </button>
      </div>

      <div className="space-y-3 select-none">
        {[0, 1].map(rowIdx => (
          <div key={rowIdx}>
            <div className="grid grid-cols-9 gap-[3px] mb-1">
              {HOLE_PARS.slice(rowIdx * 9, rowIdx * 9 + 9).map((par, i) => (
                <div key={i} className="text-center text-gc-muted" style={{ fontSize: 12, fontWeight: 600 }}>
                  {par}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-9 gap-[3px]">
              {Array.from({ length: 9 }).map((_, i) => {
                const holeIndex = rowIdx * 9 + i
                const category = value.holes[holeIndex]
                const color = category ? CATEGORY_META[category].color : undefined
                return (
                  <div
                    key={holeIndex}
                    data-hole={holeIndex}
                    onPointerDown={e => handlePointerDown(e, holeIndex)}
                    className="touch-none cursor-pointer"
                    style={{
                      height: 48,
                      borderRadius: 6,
                      background: color ?? EMPTY_CELL_BG,
                      border: color ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="flex justify-between mb-1">
          <span className="text-gc-muted" style={{ fontSize: 14 }}>{total} / {TARGET} väylää maalattu</span>
          {total === TARGET && <span className="text-green-500 font-bold">✓ Valmis!</span>}
        </div>
        <div className="rounded-full bg-white/10 overflow-hidden" style={{ height: 4 }}>
          <div
            className={`h-full rounded-full transition-all ${total === TARGET ? 'bg-green-500' : 'bg-gc-green'}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      <div className="mt-3">
        <div className="font-display font-bold text-gc-green" style={{ fontSize: 20 }}>
          Ennustettu tulos: {points}p
        </div>
        <div className="text-gc-muted mt-1" style={{ fontSize: 13 }}>
          {CATEGORY_ORDER.map(key => `${CATEGORY_META[key].emoji} ${counts[key]}`).join('  ')}
        </div>
      </div>
    </div>
  )
}
