const MIN = 18
const MAX = 54
const START = 36

interface Props {
  value: number | null
  onChange: (value: number) => void
}

export default function SliderQuestion({ value, onChange }: Props) {
  const current = value ?? START
  const diff = START - current
  const diffLabel = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
  const diffColor = diff === 0 ? 'text-white' : diff < 0 ? 'text-green-500' : 'text-gc-red'

  return (
    <div>
      <div className="text-center mb-4">
        <span className="font-display font-black text-gc-green" style={{ fontSize: 72, lineHeight: 1 }}>
          {current}
        </span>
        <div className={`font-display font-bold ${diffColor}`} style={{ fontSize: 22 }}>
          {diffLabel}
        </div>
      </div>

      <input
        type="range"
        min={MIN}
        max={MAX}
        step={1}
        value={current}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-white/10 accent-gc-green
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
          [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg
          [&::-moz-range-thumb]:cursor-pointer"
        style={{
          background: `linear-gradient(to right, #E8A820 0%, #E8A820 ${((current - MIN) / (MAX - MIN)) * 100}%, rgba(255,255,255,0.1) ${((current - MIN) / (MAX - MIN)) * 100}%, rgba(255,255,255,0.1) 100%)`,
        }}
      />

      <div className="flex justify-between mt-2 text-sm text-gc-muted">
        <span>{MIN}</span>
        <span>{MAX}</span>
      </div>
    </div>
  )
}
