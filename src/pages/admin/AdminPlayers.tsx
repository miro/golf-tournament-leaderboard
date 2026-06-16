import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Player } from '../../lib/database.types'

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[äå]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

const inputClass =
  'w-full bg-gc-dark border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-gc-green'

export default function AdminPlayers() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newHcp, setNewHcp] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hcpInputRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  async function fetchPlayers() {
    const { data } = await db.from('players').select('*').order('full_name')
    setPlayers((data ?? []) as Player[])
    setLoading(false)
  }

  useEffect(() => { fetchPlayers() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await db.from('players').insert({
      full_name: newName.trim(),
      slug: slugify(newName.trim()),
      hcp_current: newHcp ? parseFloat(newHcp) : null,
      hcp_history: [],
      titles: [],
      active: true,
    })
    if (error) {
      setError(error.message)
    } else {
      setAdding(false)
      setNewName('')
      setNewHcp('')
      fetchPlayers()
    }
    setSaving(false)
  }

  async function handleToggleActive(player: Player) {
    await db.from('players').update({ active: !player.active }).eq('id', player.id)
    fetchPlayers()
  }

  async function handleSaveHcp(playerId: string) {
    const val = hcpInputRef.current?.value ?? ''
    await db.from('players').update({ hcp_current: val ? parseFloat(val) : null }).eq('id', playerId)
    setEditingId(null)
    fetchPlayers()
  }

  if (loading) return <div className="text-gray-400">Ladataan...</div>

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Pelaajat</h1>
        <button onClick={() => setAdding(true)} className="btn-primary text-sm px-4 py-2">
          + Lisää pelaaja
        </button>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {adding && (
        <form onSubmit={handleAdd} className="card p-4 space-y-3">
          <h2 className="font-bold text-white text-sm">Uusi pelaaja</h2>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Koko nimi"
            required
            className={inputClass}
            autoFocus
          />
          <input
            type="number"
            step="0.1"
            value={newHcp}
            onChange={e => setNewHcp(e.target.value)}
            placeholder="HCP (valinnainen)"
            className={inputClass}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary text-sm px-4 py-2">
              Tallenna
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setNewName(''); setNewHcp('') }}
              className="btn-ghost text-sm px-4 py-2"
            >
              Peruuta
            </button>
          </div>
        </form>
      )}

      <div className="card divide-y divide-white/5">
        {players.length === 0 && (
          <div className="p-6 text-center text-gray-500 text-sm">Ei pelaajia</div>
        )}
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-4 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className={`font-medium text-sm ${p.active ? 'text-white' : 'text-gray-500'}`}>
                {p.full_name}
              </div>
              <div className="text-xs text-gray-600">{p.slug}</div>
            </div>

            {editingId === p.id ? (
              <div className="flex items-center gap-2">
                <input
                  ref={hcpInputRef}
                  type="number"
                  step="0.1"
                  defaultValue={p.hcp_current ?? ''}
                  className="w-20 bg-gc-dark border border-white/10 rounded px-2 py-1 text-white text-sm"
                  autoFocus
                />
                <button onClick={() => handleSaveHcp(p.id)} className="text-gc-green text-sm">OK</button>
                <button onClick={() => setEditingId(null)} className="text-gray-500 text-sm">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setEditingId(p.id)}
                className="text-sm text-gray-400 hover:text-white whitespace-nowrap"
              >
                HCP {p.hcp_current ?? '–'}
              </button>
            )}

            <button
              onClick={() => handleToggleActive(p)}
              className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                p.active ? 'bg-gc-green/20 text-gc-green' : 'bg-gray-700 text-gray-400'
              }`}
            >
              {p.active ? 'aktiivinen' : 'pois'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
