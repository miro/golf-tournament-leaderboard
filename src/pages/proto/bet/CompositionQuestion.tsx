import { type CompositionAnswer, compositionPoints, compositionTotal } from './types'

const TARGET = 18

const CATEGORIES: Array<{ key: keyof CompositionAnswer; emoji: string; label: string; points: string }> = [
  { key: 'birdie', emoji: '🐦', label: 'Birdie tai parempi', points: '3p/väylä' },
  { key: 'par', emoji: '⭕', label: 'Par', points: '2p/väylä' },
  { key: 'bogey', emoji: '📊', label: 'Bogey', points: '1p/väylä' },
  { key: 'double', emoji: '🟦', label: 'Tuplabogey', points: '0p' },
  { key: 'triple', emoji: '🟥', label: 'Triplabogey', points: '0p' },
  { key: 'worse', emoji: '💀', label: 'Worse', points: '0p' },
]

interface Props {
  value: CompositionAnswer
  onChange: (value: CompositionAnswer) => void
}

export default function CompositionQuestion({ value, onChange }: Props) {
  const total = compositionTotal(value)
  const points = compositionPoints(value)
  const fillPct = Math.min(100, (total / TARGET) * 100)
  const barColor = total === TARGET ? 'bg-green-500' : total > TARGET ? 'bg-gc-red' : 'bg-gc-green'

  function bump(key: keyof CompositionAnswer, delta: number) {
    const next = Math.max(0, value[key] + delta)
    onChange({ ...value, [key]: next })
  }

  return (
    <div>
      <div className="space-y-2">
        {CATEGORIES.map(cat => {
          const count = value[cat.key]
          return (
            <div key={cat.key} className="flex items-center gap-2 card px-3 py-2">
              <span className="text-xl shrink-0">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold text-white leading-tight truncate">{cat.label}</div>
                <div className="text-xs text-gc-muted">{cat.points}</div>
              </div>
              <button
                className="shrink-0 flex items-center justify-center rounded-full border border-white/15 text-white active:scale-95 transition-transform disabled:opacity-30"
                style={{ width: 44, height: 44 }}
                disabled={count === 0}
                onClick={() => bump(cat.key, -1)}
              >
                −
              </button>
              <span
                className={`font-display font-bold w-10 text-center shrink-0 ${count > 0 ? 'text-gc-green' : 'text-white'}`}
                style={{ fontSize: 28 }}
              >
                {count}
              </span>
              <button
                className="shrink-0 flex items-center justify-center rounded-full border border-white/15 text-white active:scale-95 transition-transform"
                style={{ width: 44, height: 44 }}
                onClick={() => bump(cat.key, 1)}
              >
                +
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gc-muted">{total} / {TARGET} väylää</span>
          {total === TARGET && <span className="text-green-500 font-semibold">✓ Täynnä!</span>}
          {total > TARGET && <span className="text-gc-red font-semibold">⚠ Liikaa!</span>}
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${fillPct}%` }} />
        </div>
        <div className="font-display font-semibold text-white mt-3" style={{ fontSize: 20 }}>
          Ennustettu tulos: {points}p
        </div>
      </div>
    </div>
  )
}
