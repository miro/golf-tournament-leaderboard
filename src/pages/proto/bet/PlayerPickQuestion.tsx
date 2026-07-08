import type { Player } from '../../../lib/database.types'
import InitialsAvatar from '../../../components/shared/InitialsAvatar'

interface Props {
  players: Player[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function PlayerPickQuestion({ players, selectedId, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
      {players.map(p => {
        const selected = p.id === selectedId
        return (
          <button
            key={p.id}
            onClick={() => onSelect(selected ? null : p.id)}
            className={`relative text-left card p-3 flex items-center gap-2 transition-colors ${
              selected ? 'border-gc-green bg-gc-green/15' : 'border-white/10'
            }`}
            style={{ borderWidth: selected ? 2 : 1 }}
          >
            {selected && <span className="absolute top-1.5 right-1.5 text-gc-green text-sm">✓</span>}
            <InitialsAvatar name={p.full_name} size={32} color="#4b5563" />
            <div className="min-w-0">
              <div className="font-display font-semibold text-white text-sm leading-tight truncate">{p.full_name}</div>
              <div className="text-xs text-gc-muted">HCP {p.hcp_current ?? '–'}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
