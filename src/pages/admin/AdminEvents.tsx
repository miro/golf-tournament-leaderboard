import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getLeagueEvents, getEventParticipants, type EventRow } from '../../lib/eventQueries'

const statusMeta: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Luonnos', cls: 'bg-gray-700 text-gray-300' },
  betting_open: { label: 'Veikkaukset auki', cls: 'bg-emerald-500/20 text-emerald-300 animate-pulse' },
  betting_closed: { label: 'Veikkaukset suljettu', cls: 'bg-gc-gold/20 text-gc-gold' },
  scoring: { label: 'Tulosten syöttö', cls: 'bg-gc-gold/20 text-gc-gold' },
  results_ready: { label: 'Tulokset valmiit', cls: 'bg-blue-500/20 text-blue-300' },
  presented: { label: 'Esitetty', cls: 'bg-white/10 text-gray-400' },
}

export default function AdminEvents() {
  const [events, setEvents] = useState<Array<EventRow & { participantCount: number }>>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getLeagueEvents().then(async rows => {
      const withCounts = await Promise.all(rows.map(async event => ({ ...event, participantCount: (await getEventParticipants(event.id)).length })))
      setEvents(withCounts)
    }).finally(() => setLoading(false))
  }, [])
  if (loading) return <div className="text-gray-400">Ladataan...</div>
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Tapahtumat</h1>
        <Link to="/admin/events/new" className="btn-primary text-sm px-4 py-2">Luo uusi tapahtuma</Link>
      </div>
      <div className="card divide-y divide-white/5">
        {events.length === 0 && <div className="p-8 text-center text-gray-500 text-sm">Ei tapahtumia</div>}
        {events.map(event => {
          const status = statusMeta[event.status] ?? statusMeta.draft
          return <Link key={event.id} to={`/admin/events/${event.id}`} className="flex items-center gap-3 px-4 py-4 hover:bg-white/5 transition-colors">
            <div className="flex-1 min-w-0"><div className="font-medium text-white truncate">{event.name}</div><div className="text-xs text-gray-500 mt-1">{new Date(`${event.event_date}T00:00:00`).toLocaleDateString('fi-FI')}{event.course?.name && ` · ${event.course.name}`}</div></div>
            <span className={`text-[11px] px-2 py-1 rounded-full whitespace-nowrap ${status.cls}`}>{status.label}</span>
            <span className="text-xs text-gray-500 whitespace-nowrap">{event.participantCount} veikkaajaa</span>
            <span className="text-gray-500">→</span>
          </Link>
        })}
      </div>
    </div>
  )
}
