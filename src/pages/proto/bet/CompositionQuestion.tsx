import { useRef, useState, type PointerEvent } from 'react'
import { CATEGORY_META, CATEGORY_ORDER, type CompositionAnswer, type HoleCategory, compositionPoints, strokeCountForHole, COMPOSITION_HOLE_PARS } from './types'

const LABELS = ['Birdie', 'Par', 'Bogey', 'Tupla', 'Tripla', 'Worse']
const position = (category: HoleCategory) => (CATEGORY_ORDER.indexOf(category) + 0.5) / 6 * 100
const color = (category: HoleCategory) => category === 'par' ? 'rgba(255,255,255,0.30)' : CATEGORY_META[category].brushColor
const clamp = (x: number) => Math.max(100 / 12, Math.min(100 - 100 / 12, x))
const categoryAt = (x: number) => CATEGORY_ORDER[Math.max(0, Math.min(5, Math.floor(x / 100 * 6)))]

function Symbol({ category }: { category: HoleCategory }) {
  const squares = category === 'triple' ? [26, 18, 10] : category === 'double' ? [26, 16] : [22]
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      {category === 'birdie' ? <circle cx="14" cy="14" r="13" fill="none" stroke={color(category)} strokeWidth="2" />
        : category !== 'par' && squares.map(size => <rect key={size} x={(28 - size) / 2} y={(28 - size) / 2} width={size} height={size} fill={category === 'worse' ? '#555555' : 'none'} stroke={color(category)} strokeWidth="1.5" />)}
      <circle cx="14" cy="14" r="6" fill={color(category)} />
    </svg>
  )
}

interface Props {
  value: CompositionAnswer
  onChange: (value: CompositionAnswer) => void
}

export default function CompositionQuestion({ value, onChange }: Props) {
  const gesture = useRef<{ id: number; hole: number; x: number; y: number; mode: 'pending' | 'horizontal' | 'vertical' } | null>(null)
  const [drag, setDrag] = useState<{ hole: number; x: number } | null>(null)
  const points = compositionPoints(value)
  const scratch = value.holes.reduce<number>((sum, category, hole) => sum + (category ? strokeCountForHole(COMPOSITION_HOLE_PARS[hole], category) : 0), 0)
  const delta = 36 - points

  function select(hole: number, category: HoleCategory) {
    onChange({ holes: value.holes.map((current, index) => index === hole ? category : current) })
  }

  function trackX(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return clamp((e.clientX - rect.left) / rect.width * 100)
  }

  function start(e: PointerEvent<HTMLDivElement>, hole: number) {
    if (!e.isPrimary || e.button !== 0) return
    gesture.current = { id: e.pointerId, hole, x: e.clientX, y: e.clientY, mode: 'pending' }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const dx = Math.abs(e.clientX - g.x)
    const dy = Math.abs(e.clientY - g.y)
    if (g.mode === 'pending' && Math.max(dx, dy) > 6) g.mode = dx > dy ? 'horizontal' : 'vertical'
    if (g.mode === 'horizontal') {
      if (e.cancelable) e.preventDefault()
      setDrag({ hole: g.hole, x: trackX(e) })
    }
  }

  function end(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    if (g.mode !== 'vertical') select(g.hole, categoryAt(trackX(e)))
    gesture.current = null
    setDrag(null)
  }

  const linePoints = value.holes.flatMap((category, hole) => {
    const x = drag?.hole === hole ? drag.x : category ? position(category) : null
    return x === null ? [] : [`${x},${hole * 72 + 36}`]
  }).join(' ')

  return (
    <div className="w-full min-w-0">
      <p className="text-gc-muted text-sm italic mb-4">Valitse tulos jokaiselle väylälle. Viimeinen väylä avaa lukituksen.</p>
      <div className="sticky top-0 z-10 border-b border-white/10" style={{ background: '#17130F' }}>
        <div className="flex items-center justify-between gap-2 py-3">
          <div className="text-gc-muted text-[13px]"><span className="block text-white font-display font-bold text-xl">{scratch} lyöntiä</span>Scratch</div>
          <span className={`font-display font-black text-[28px] ${delta < 0 ? 'text-gc-red' : 'text-white'}`}>{delta === 0 ? 'E' : delta > 0 ? `+${delta}` : delta}</span>
          <span className="text-gc-muted text-[13px]">{points}p stableford</span>
        </div>
        <div className="flex items-center text-[11px] font-display font-semibold">
          <span className="w-9 shrink-0 text-center text-white/60">Väylä</span>
          <span className="ml-1 w-8 shrink-0 text-center text-[#E8A820]">Par</span>
          <div className="ml-2 flex-1 min-w-0 grid grid-cols-6 text-center text-white/50">{LABELS.map((label, index) => (
            <span key={label} className={`py-2 ${index === 1 ? 'bg-white/[0.05] border-x border-white/[0.12] text-white/80' : ''}`}>{label}</span>
          ))}</div>
        </div>
      </div>
      <div className="relative w-full select-none">
        <div aria-hidden="true" className="absolute inset-y-0 right-0 grid grid-cols-6 pointer-events-none" style={{ left: 80 }}>
          {CATEGORY_ORDER.map((category, index) => (
            <div key={category} className={category === 'par'
              ? 'bg-white/[0.05] border-x border-white/[0.12]'
              : index > 2 ? 'border-l border-white/[0.04]' : ''} />
          ))}
        </div>
        <svg className="absolute top-0 pointer-events-none" style={{ left: 80, width: 'calc(100% - 80px)', height: 1296 }} viewBox="0 0 100 1296" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={linePoints} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {value.holes.map((category, hole) => {
          const x = drag?.hole === hole ? drag.x : category ? position(category) : null
          const shownCategory = drag?.hole === hole ? categoryAt(drag.x) : category
          return (
            <div key={hole} className="flex items-center h-[72px]">
              <span className="w-9 shrink-0 text-center font-display text-xl font-semibold text-white/70">{hole + 1}</span>
              <span className="ml-1 w-8 shrink-0 text-center font-display text-xl font-bold text-[#E8A820]">{COMPOSITION_HOLE_PARS[hole]}</span>
              <div
                className="relative ml-2 flex-1 min-w-0 h-full cursor-ew-resize focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E8A820]"
                style={{ touchAction: 'pan-y pinch-zoom' }}
                role="slider" tabIndex={0} aria-label={`Väylä ${hole + 1}, par ${COMPOSITION_HOLE_PARS[hole]}`}
                aria-valuemin={0} aria-valuemax={5} aria-valuenow={category ? CATEGORY_ORDER.indexOf(category) : 1}
                aria-valuetext={category ? CATEGORY_META[category].fullLabel : 'Aseta viimeinen väylä'}
                onPointerDown={e => start(e, hole)} onPointerMove={move} onPointerUp={end}
                onPointerCancel={() => { gesture.current = null; setDrag(null) }}
                onLostPointerCapture={() => { gesture.current = null; setDrag(null) }}
                onKeyDown={e => {
                  const index = category ? CATEGORY_ORDER.indexOf(category) : 1
                  const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(5, index + 1) : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(0, index - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? 5 : e.key === 'Enter' || e.key === ' ' ? index : null
                  if (next !== null) { e.preventDefault(); select(hole, CATEGORY_ORDER[next]) }
                }}
              >
                <div className="absolute top-1/2 inset-x-0 h-px bg-white/[0.12]" />
                {x !== null && shownCategory ? <div className="absolute top-1/2 pointer-events-none -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%` }}><Symbol category={shownCategory} /></div>
                  : <span className="composition-pending absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-dashed border-white/20" style={{ left: '25%' }} />}
              </div>
            </div>
          )
        })}
      </div>
      {value.holes[17] === null && <p className="text-center text-xs italic text-gc-muted mt-2">Aseta viimeinen väylä</p>}
    </div>
  )
}
