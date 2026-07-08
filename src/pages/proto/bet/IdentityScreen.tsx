import { useState } from 'react'

const EMOJI_GRID = [
  ['⛳', '🔥', '🏌️', '🍺', '🎯'],
  ['🦅', '👑', '💀', '🎩', '🍭'],
  ['⭐', '🤙', '💪', '🎪', '🌊'],
  ['🏆', '👊', '🎱', '🔱', '⚡'],
  ['🐦', '💥', '🎭', '🌀', '🎳'],
]

interface Props {
  onStart: (name: string, emojis: string[]) => void
}

export default function IdentityScreen({ onStart }: Props) {
  const [name, setName] = useState('')
  const [emojis, setEmojis] = useState<string[]>([])

  const today = new Date()
  const dateLabel = `${today.getDate()}.${today.getMonth() + 1}.${today.getFullYear()}`

  function toggleEmoji(emoji: string) {
    setEmojis(prev => {
      if (prev.includes(emoji)) return prev.filter(e => e !== emoji)
      if (prev.length >= 3) return prev
      return [...prev, emoji]
    })
  }

  const ready = name.trim().length > 0 && emojis.length === 3

  return (
    <div>
      <div className="label mb-2">GC EVENTS</div>
      <h1 className="font-display font-extrabold text-3xl text-white mb-1">Kajaani · {dateLabel}</h1>
      <p className="text-gc-muted mb-6">Kuka sinä olet?</p>

      <input
        type="text"
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Kirjoita nimesi"
        className="w-full bg-gc-card border border-white/10 rounded-lg px-4 py-3 mb-6 text-white placeholder-gc-muted focus:outline-none focus:border-gc-green font-display"
        style={{ fontSize: 24 }}
      />

      <div className="label mb-2">Valitse tunnuksesi — 3 emojia</div>
      <div className="grid grid-cols-5 gap-2 mb-2">
        {EMOJI_GRID.flat().map(emoji => {
          const selected = emojis.includes(emoji)
          return (
            <button
              key={emoji}
              onClick={() => toggleEmoji(emoji)}
              className="flex items-center justify-center rounded-lg border-2 transition-colors text-2xl"
              style={{
                width: 52,
                height: 52,
                borderColor: selected ? '#E8A820' : 'rgba(255,255,255,0.1)',
                background: selected ? 'rgba(232,168,32,0.2)' : '#221D17',
              }}
            >
              {emoji}
            </button>
          )
        })}
      </div>
      <div className={`text-sm mb-6 ${emojis.length === 3 ? 'text-green-500' : 'text-gc-muted'}`}>
        {emojis.length}/3 valittu
      </div>

      {emojis.length === 3 && (
        <div className="text-center mb-6">
          <div className="label mb-1">Tunnuksesi</div>
          <div className="font-display font-black text-white" style={{ fontSize: 40 }}>
            {emojis.join('')}
          </div>
        </div>
      )}

      <button
        className="btn-primary w-full text-lg py-3 disabled:opacity-30 disabled:cursor-not-allowed"
        disabled={!ready}
        onClick={() => onStart(name.trim(), emojis)}
      >
        ALOITA VEIKKAAMINEN →
      </button>
    </div>
  )
}
