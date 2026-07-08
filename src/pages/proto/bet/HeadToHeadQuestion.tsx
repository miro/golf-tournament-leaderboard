import type { Player } from '../../../lib/database.types'
import InitialsAvatar from '../../../components/shared/InitialsAvatar'

const KAJAANI_GREEN = '#2D6A4F'

interface Props {
  playerA: Player
  playerB: Player
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function PlayerCard({ player, selected, onSelect }: { player: Player; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="card flex flex-col items-center gap-2 py-6 px-2 transition-colors"
      style={{
        width: '48%',
        borderWidth: selected ? 3 : 1,
        borderColor: selected ? KAJAANI_GREEN : undefined,
        background: selected ? `${KAJAANI_GREEN}33` : undefined,
      }}
    >
      <InitialsAvatar name={player.full_name} size={48} color="#4b5563" />
      <div className="font-display font-extrabold text-white text-center" style={{ fontSize: 24 }}>
        {player.full_name}
      </div>
      <div className="text-xs text-gc-muted">HCP {player.hcp_current ?? '–'}</div>
    </button>
  )
}

export default function HeadToHeadQuestion({ playerA, playerB, selectedId, onSelect }: Props) {
  return (
    <div className="flex items-center" style={{ gap: '4%' }}>
      <PlayerCard
        player={playerA}
        selected={selectedId === playerA.id}
        onSelect={() => onSelect(selectedId === playerA.id ? null : playerA.id)}
      />
      <span className="font-display font-black text-gc-muted shrink-0" style={{ fontSize: 20 }}>
        VS
      </span>
      <PlayerCard
        player={playerB}
        selected={selectedId === playerB.id}
        onSelect={() => onSelect(selectedId === playerB.id ? null : playerB.id)}
      />
    </div>
  )
}
