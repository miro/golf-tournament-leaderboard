import type { ReactNode } from 'react'

const TOTAL_QUESTIONS = 9

interface Props {
  index: number // 0-based
  questionText: string
  context?: string
  lockDisabled: boolean
  lockLabel?: string
  onLock: () => void
  transitioningOut: boolean
  children: ReactNode
}

export default function QuestionShell({
  index,
  questionText,
  context,
  lockDisabled,
  lockLabel = 'LUKITSE VEIKKAUS →',
  onLock,
  transitioningOut,
  children,
}: Props) {
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
              i === index
                ? 'bg-gc-green animate-pulse'
                : i < index
                  ? 'bg-gc-green'
                  : 'bg-white/10'
            }`}
          />
        ))}
        <span className="label ml-2 shrink-0">{index + 1}/{TOTAL_QUESTIONS}</span>
      </div>

      <div className="label mb-2">VEIKKAUS {index + 1}/{TOTAL_QUESTIONS}</div>
      <h2 className="font-display font-bold text-3xl text-white leading-tight mb-1">{questionText}</h2>
      {context && <p className="text-gc-muted text-sm mb-6">{context}</p>}

      <div className="mb-8">{children}</div>

      <button
        className="btn-primary w-full text-lg py-3 disabled:opacity-30 disabled:cursor-not-allowed"
        disabled={lockDisabled}
        onClick={onLock}
      >
        {lockLabel}
      </button>
    </div>
  )
}
