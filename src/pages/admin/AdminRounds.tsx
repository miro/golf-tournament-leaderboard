import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getCurrentSeason } from '../../lib/queries'
import type { RoundWithDetails } from '../../lib/database.types'

export default function AdminRounds() {
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPoints, setEditPoints] = useState('')
  const [correctionNote, setCorrectionNote] = useState('')

  async function fetchRounds() {
    const season = await getCurrentSeason()
    const { data } = await supabase
      .from('rounds')
      .select('*, player:players(*), course:courses(*)')
      .eq('season_id', season.id)
      .order('submitted_at', { ascending: false })
    setRounds(
      ((data ?? []) as unknown as RoundWithDetails[]).map(r => ({
        ...r,
        player: Array.isArray(r.player) ? r.player[0] : r.player,
        course: Array.isArray(r.course) ? r.course[0] : r.course,
      })),
    )
    setLoading(false)
  }

  useEffect(() => { fetchRounds() }, [])

  async function handleCorrect(roundId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('rounds') as any)
      .update({
        total_points: parseInt(editPoints),
        status: 'corrected',
        correction_note: correctionNote || null,
      })
      .eq('id', roundId)
    setEditingId(null)
    fetchRounds()
  }

  async function handleToggleStatus(round: RoundWithDetails) {
    const newStatus = round.status === 'published' ? 'draft' : 'published'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('rounds') as any).update({ status: newStatus }).eq('id', round.id)
    fetchRounds()
  }

  if (loading) return <div className="text-gray-400">Ladataan...</div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Kierrokset</h1>
      <div className="card divide-y divide-white/5">
        {rounds.length === 0 && (
          <div className="p-6 text-center text-gray-500 text-sm">Ei kierroksia</div>
        )}
        {rounds.map(r => (
          <div key={r.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium text-sm">
                  {r.player?.full_name} — {r.course?.name}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(r.played_date).toLocaleDateString('fi-FI')}
                  {r.is_backfill && ' · backfill'}
                  {r.correction_note && ` · ${r.correction_note}`}
                </div>
              </div>
              <div className="text-gc-gold font-bold shrink-0">{r.total_points}p</div>
              <button
                onClick={() => handleToggleStatus(r)}
                className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                  r.status === 'published'
                    ? 'bg-gc-green/20 text-gc-green'
                    : r.status === 'corrected'
                    ? 'bg-gc-gold/20 text-gc-gold'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {r.status}
              </button>
              <button
                onClick={() => {
                  setEditingId(r.id)
                  setEditPoints(r.total_points.toString())
                  setCorrectionNote('')
                }}
                className="text-xs text-gray-400 hover:text-white shrink-0"
              >
                Muokkaa
              </button>
            </div>

            {editingId === r.id && (
              <div className="mt-3 flex items-end gap-3">
                <div>
                  <label className="label block mb-1 text-xs">Uudet pisteet</label>
                  <input
                    type="number"
                    value={editPoints}
                    onChange={e => setEditPoints(e.target.value)}
                    className="w-24 bg-gc-dark border border-white/10 rounded px-2 py-1 text-white text-sm"
                    autoFocus
                  />
                </div>
                <div className="flex-1">
                  <label className="label block mb-1 text-xs">Korjaushuomio</label>
                  <input
                    type="text"
                    value={correctionNote}
                    onChange={e => setCorrectionNote(e.target.value)}
                    className="w-full bg-gc-dark border border-white/10 rounded px-2 py-1 text-white text-sm"
                  />
                </div>
                <button onClick={() => handleCorrect(r.id)} className="btn-primary text-sm px-3 py-1.5">
                  OK
                </button>
                <button onClick={() => setEditingId(null)} className="btn-ghost text-sm px-3 py-1.5">
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
