import type { RoundWithDetails } from '../lib/database.types'
import { generateWhatsAppText } from '../lib/queries'

interface Props {
  round: RoundWithDetails
  rank?: number
  totalPlayers?: number
  compact?: boolean
}

export default function RoundCard({ round, rank, totalPlayers, compact }: Props) {
  const date = new Date(round.played_date).toLocaleDateString('fi-FI')
  const courseColor = round.course?.color_hex ?? '#2D6A4F'
  const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null

  const shareText =
    rank && totalPlayers
      ? generateWhatsAppText(
          round.player?.full_name ?? '',
          round.course?.name ?? '',
          round.total_points,
          rank,
          totalPlayers,
          round.is_backfill,
          round.played_date,
        )
      : null

  if (compact) {
    return (
      <div className="card flex items-center gap-4 p-3">
        <div className="w-2 h-10 rounded-full shrink-0" style={{ background: courseColor }} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">{round.player?.full_name}</div>
          <div className="text-sm text-gray-400">{round.course?.name} · {date}</div>
        </div>
        <div className="text-gc-green font-bold text-xl">{round.total_points}</div>
        {rankEmoji && <div className="text-xl">{rankEmoji}</div>}
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="h-2" style={{ background: courseColor }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-white font-bold text-lg">{round.player?.full_name}</div>
            <div className="text-gray-400 text-sm mt-0.5">{round.course?.name} · {date}</div>
            {round.is_backfill && (
              <span className="text-xs text-gc-gold/70 mt-1 block">Backfill</span>
            )}
          </div>
          {rankEmoji && <div className="text-3xl">{rankEmoji}</div>}
        </div>

        <div className="flex items-end gap-6 flex-wrap">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Pisteet</div>
            <div className="text-gc-green font-bold text-4xl">{round.total_points}</div>
          </div>
          {rank && totalPlayers && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Sijoitus</div>
              <div className="text-white font-semibold text-2xl">{rank}/{totalPlayers}</div>
            </div>
          )}
          {round.total_strokes != null && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Lyönnit</div>
              <div className="text-white font-semibold text-2xl">{round.total_strokes}</div>
            </div>
          )}
          {round.hcp_at_time != null && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">HCP</div>
              <div className="text-white font-semibold text-xl">{round.hcp_at_time}</div>
            </div>
          )}
        </div>

        {round.summary_text && (
          <p className="mt-3 text-gray-400 text-sm italic">"{round.summary_text}"</p>
        )}

        {shareText && (
          <button
            onClick={() => navigator.clipboard.writeText(shareText)}
            className="mt-4 btn-ghost text-sm w-full text-left"
          >
            📋 Kopioi WhatsApp-teksti
          </button>
        )}
      </div>
    </div>
  )
}
