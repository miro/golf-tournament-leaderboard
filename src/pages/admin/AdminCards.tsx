import { useEffect, useState } from 'react'
import { getCurrentSeason, getRecentRounds, getLeaderboard, generateWhatsAppText } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import type { RoundWithDetails, LeaderboardEntry } from '../../lib/database.types'
import RoundCard from '../../components/RoundCard'

export default function AdminCards() {
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [selected, setSelected] = useState<RoundWithDetails | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const season = await getCurrentSeason()
      const [allRounds, lb] = await Promise.all([
        getRecentRounds(season.id, 50),
        getLeaderboard(season.id),
      ])
      setRounds(allRounds)
      setLeaderboard(lb)
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  function getEntry(round: RoundWithDetails) {
    return leaderboard.find(e => e.player.id === round.player_id)
  }

  async function handleCopyAndSave(round: RoundWithDetails) {
    const entry = getEntry(round)
    if (!entry) return
    const shareText = generateWhatsAppText(
      round.player?.full_name ?? '',
      round.course?.name ?? '',
      round.total_points,
      entry.rank,
      leaderboard.length,
      round.is_backfill,
      round.played_date,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('round_cards').upsert({ round_id: round.id, card_type: 'round', share_text: shareText })
    navigator.clipboard.writeText(shareText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="text-gray-400">Ladataan...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Kortit</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div>
          <h2 className="font-bold text-white mb-3 text-sm uppercase tracking-wider text-gray-400">
            Valitse kierros
          </h2>
          <div className="card divide-y divide-white/5 max-h-[65vh] overflow-y-auto">
            {rounds.length === 0 && (
              <div className="p-4 text-center text-gray-500 text-sm">Ei kierroksia</div>
            )}
            {rounds.map(r => (
              <button
                key={r.id}
                onClick={() => { setSelected(r); setCopied(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                  selected?.id === r.id ? 'bg-gc-green/10 border-l-2 border-gc-green' : 'hover:bg-white/5'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{r.player?.full_name}</div>
                  <div className="text-gray-500 text-xs">
                    {r.course?.name} · {new Date(r.played_date).toLocaleDateString('fi-FI')}
                  </div>
                </div>
                <div className="text-gc-green font-bold shrink-0">{r.total_points}p</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          {selected ? (
            <div className="space-y-4">
              <h2 className="font-bold text-gray-400 text-sm uppercase tracking-wider">Esikatselu</h2>
              <RoundCard
                round={selected}
                rank={getEntry(selected)?.rank}
                totalPlayers={leaderboard.length}
              />
              <button
                onClick={() => handleCopyAndSave(selected)}
                className="btn-primary w-full"
              >
                {copied ? '✓ Kopioitu leikepöydälle!' : '📋 Kopioi WhatsApp-teksti'}
              </button>
            </div>
          ) : (
            <div className="card p-12 text-center text-gray-600">
              Valitse kierros vasemmalta
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
