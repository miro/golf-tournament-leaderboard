import { useRef, useState } from 'react'
import { CATEGORY_META, CATEGORY_ORDER, POINTS_PER_HOLE, type CellSymbolShape, type CompositionAnswer, type HoleCategory, compositionCounts, compositionPoints, compositionTotal, strokeCountForHole } from './types'

const STBL_PAR = 36

const TARGET = 18
const MAX_UNDO = 10
const EMPTY_CELL_BG = '#2a2520'
const CELL_SIZE = 48

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

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Traditional scorecard notation: circle=birdie+, square=bogey, nested squares=double/triple, filled=worse
function CellSymbol({ shape, sizePx, color }: { shape: CellSymbolShape; sizePx: number; color: string }) {
  if (shape === 'none') return null
  if (shape === 'circle') {
    return (
      <svg width={sizePx} height={sizePx} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8" />
      </svg>
    )
  }
  if (shape === 'square') {
    return (
      <svg width={sizePx} height={sizePx} viewBox="0 0 100 100">
        <rect x="8" y="8" width="84" height="84" fill="none" stroke={color} strokeWidth="8" />
      </svg>
    )
  }
  if (shape === 'double-square') {
    return (
      <svg width={sizePx} height={sizePx} viewBox="0 0 100 100">
        <rect x="4" y="4" width="92" height="92" fill="none" stroke={color} strokeWidth="7" />
        <rect x="22" y="22" width="56" height="56" fill="none" stroke={color} strokeWidth="7" />
      </svg>
    )
  }
  if (shape === 'triple-square') {
    return (
      <svg width={sizePx} height={sizePx} viewBox="0 0 100 100">
        <rect x="2" y="2" width="96" height="96" fill="none" stroke={color} strokeWidth="6" />
        <rect x="18" y="18" width="64" height="64" fill="none" stroke={color} strokeWidth="6" />
        <rect x="34" y="34" width="32" height="32" fill="none" stroke={color} strokeWidth="6" />
      </svg>
    )
  }
  return (
    <svg width={sizePx} height={sizePx} viewBox="0 0 100 100">
      <rect x="4" y="4" width="92" height="92" fill={color} />
    </svg>
  )
}

// Brush-button version: fixed 28x28 canvas with the exact pixel sizes/strokes specified for the selector
function BrushSymbol({ shape, color }: { shape: CellSymbolShape; color: string }) {
  const c = 14 // canvas center (28x28)
  const centered = (size: number) => c - size / 2
  if (shape === 'circle') {
    return (
      <svg width={28} height={28} viewBox="0 0 28 28">
        <circle cx={c} cy={c} r={13} fill="none" stroke={color} strokeWidth={2.5} />
      </svg>
    )
  }
  if (shape === 'square') {
    return (
      <svg width={28} height={28} viewBox="0 0 28 28">
        <rect x={centered(22)} y={centered(22)} width={22} height={22} fill="none" stroke={color} strokeWidth={2} />
      </svg>
    )
  }
  if (shape === 'double-square') {
    return (
      <svg width={28} height={28} viewBox="0 0 28 28">
        <rect x={centered(26)} y={centered(26)} width={26} height={26} fill="none" stroke={color} strokeWidth={1.5} />
        <rect x={centered(16)} y={centered(16)} width={16} height={16} fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
    )
  }
  if (shape === 'triple-square') {
    return (
      <svg width={28} height={28} viewBox="0 0 28 28">
        <rect x={centered(26)} y={centered(26)} width={26} height={26} fill="none" stroke={color} strokeWidth={1.5} />
        <rect x={centered(18)} y={centered(18)} width={18} height={18} fill="none" stroke={color} strokeWidth={1.5} />
        <rect x={centered(10)} y={centered(10)} width={10} height={10} fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
    )
  }
  if (shape === 'filled-square') {
    return (
      <svg width={28} height={28} viewBox="0 0 28 28">
        <rect x={centered(22)} y={centered(22)} width={22} height={22} fill={color} />
      </svg>
    )
  }
  // 'none' (par): rounded square outline signals "no marking / baseline"
  return (
    <svg width={28} height={28} viewBox="0 0 28 28">
      <rect x={centered(22)} y={centered(22)} width={22} height={22} rx={2} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  )
}

export default function CompositionQuestion({ value, onChange }: Props) {
  const [brush, setBrush] = useState<HoleCategory>('par')
  const [canUndo, setCanUndo] = useState(false)
  const [justCleared, setJustCleared] = useState(false)
  const historyRef = useRef<(HoleCategory | null)[][]>([])

  const total = compositionTotal(value)
  const counts = compositionCounts(value)
  const points = compositionPoints(value)
  const fillPct = Math.min(100, (total / TARGET) * 100)
  const stblDelta = STBL_PAR - points
  const deltaLabel = stblDelta === 0 ? 'E' : stblDelta > 0 ? `+${stblDelta}` : `${stblDelta}`
  const deltaColor = stblDelta < 0 ? '#E8453C' : 'white'

  function undo() {
    const prev = historyRef.current.pop()
    setCanUndo(historyRef.current.length > 0)
    if (prev) onChange({ holes: prev })
  }

  function reset() {
    historyRef.current = []
    setCanUndo(false)
    onChange({ holes: Array(18).fill(null) })
    setJustCleared(true)
    setTimeout(() => setJustCleared(false), 1500)
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

      <div className="grid grid-cols-6 gap-[6px] mb-2">
        {CATEGORY_ORDER.map(key => {
          const meta = CATEGORY_META[key]
          const active = brush === key
          const count = counts[key]
          return (
            <button
              key={key}
              onClick={() => setBrush(key)}
              className="relative flex items-center justify-center transition-transform"
              style={{
                height: 44,
                borderRadius: 8,
                borderWidth: active ? 2 : 1,
                borderStyle: 'solid',
                borderColor: active ? meta.brushColor : 'rgba(255,255,255,0.12)',
                background: active ? hexToRgba(meta.brushColor, 0.2) : EMPTY_CELL_BG,
              }}
            >
              <BrushSymbol shape={meta.symbol} color={meta.brushSymbolColor} />
              <span
                className="absolute flex items-center justify-center font-bold text-white"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: meta.brushColor,
                  fontSize: 10,
                  bottom: 2,
                  right: 2,
                  display: count > 0 ? 'flex' : 'none',
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-gc-muted italic mb-3" style={{ fontSize: 13 }}>
        {CATEGORY_META[brush].fullLabel} — {POINTS_PER_HOLE[brush]}p{POINTS_PER_HOLE[brush] > 0 ? '/väylä' : ''}
      </p>

      <div className="flex justify-end gap-3 mb-2">
        {justCleared ? (
          <span className="text-sm text-green-500 font-semibold px-1">Tyhjennetty ✓</span>
        ) : (
          <button onClick={reset} className="text-sm text-gc-muted px-1">
            ✕ Tyhjennä
          </button>
        )}
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
                const meta = category ? CATEGORY_META[category] : null
                const strokeCount = category ? strokeCountForHole(HOLE_PARS[holeIndex], category) : null
                return (
                  <div
                    key={holeIndex}
                    data-hole={holeIndex}
                    onPointerDown={e => handlePointerDown(e, holeIndex)}
                    className="touch-none cursor-pointer relative"
                    style={{
                      height: CELL_SIZE,
                      borderRadius: 6,
                      background: meta ? hexToRgba(meta.cellColor, meta.cellBgOpacity) : EMPTY_CELL_BG,
                      border: meta ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {meta && meta.symbol !== 'none' && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0.6 }}>
                        <CellSymbol shape={meta.symbol} sizePx={Math.round((CELL_SIZE * meta.symbolSizePct) / 100)} color={meta.cellColor} />
                      </div>
                    )}
                    {meta && (
                      <div
                        className="absolute inset-0 flex items-center justify-center font-display font-extrabold"
                        style={{ fontSize: 18, color: meta.numberColor }}
                      >
                        {strokeCount}
                      </div>
                    )}
                  </div>
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

      <div className="mt-3 text-center">
        <div
          className="text-gc-muted font-semibold"
          style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}
        >
          Ennustettu tulos
        </div>
        <div className="font-display font-black" style={{ fontSize: 48, color: deltaColor }}>
          {deltaLabel}
        </div>
        <div className="text-gc-muted" style={{ fontSize: 13 }}>
          {points}p stableford
        </div>
      </div>
    </div>
  )
}
