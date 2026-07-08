interface Props {
  value: 'yes' | 'no' | null
  onChange: (value: 'yes' | 'no' | null) => void
}

export default function YesNoQuestion({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => onChange(value === 'yes' ? null : 'yes')}
        className="font-display font-bold text-white transition-colors rounded-lg border"
        style={{
          height: 80,
          fontSize: 20,
          background: value === 'yes' ? 'rgba(34,197,94,0.2)' : '#221D17',
          borderColor: value === 'yes' ? 'rgb(34,197,94)' : 'rgba(255,255,255,0.1)',
        }}
      >
        🐦 KYLLÄ, TULEE
      </button>
      <button
        onClick={() => onChange(value === 'no' ? null : 'no')}
        className="font-display font-bold text-white transition-colors rounded-lg border"
        style={{
          height: 80,
          fontSize: 20,
          background: value === 'no' ? 'rgba(193,40,32,0.2)' : '#221D17',
          borderColor: value === 'no' ? '#C12820' : 'rgba(255,255,255,0.1)',
        }}
      >
        ❌ EI TULE
      </button>
    </div>
  )
}
