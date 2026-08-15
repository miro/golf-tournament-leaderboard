import { useEffect, useState } from 'react'
import type { InvitationalScheduleEvent } from '../../lib/database.types'
import { getInvitationalSchedule } from '../../lib/queries'
import ScheduleEventCard from './ScheduleEventCard'
import {
  AMBER,
  GREEN,
  INVITATIONAL_YEAR,
  countdownText,
  formatDayHeading,
  groupByDay,
  schedulePhase,
} from './schedule'

export default function SchedulePage() {
  const [events, setEvents] = useState<InvitationalScheduleEvent[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  // Captured once per mount: the countdown does not need to tick live.
  const [now] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false
    getInvitationalSchedule(INVITATIONAL_YEAR)
      .then(rows => {
        if (!cancelled) setEvents(rows)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loadError) {
    return <div className="text-[13px] text-gc-muted text-center py-16">Ohjelmaa ei saatu ladattua</div>
  }

  if (!events) {
    return (
      <div className="flex justify-center py-16">
        <img src="/gc-logo.png" alt="GC" className="animate-pulse" style={{ height: 48, width: 'auto', filter: 'invert(1)' }} />
      </div>
    )
  }

  if (events.length === 0) {
    return <div className="text-[13px] text-gc-muted text-center py-16">Ohjelma julkaistaan pian</div>
  }

  const days = groupByDay(events)
  const phase = schedulePhase(days, now)

  return (
    <div>
      {phase?.status === 'before' && (
        <div className="font-display text-4xl font-black text-center mb-8" style={{ color: AMBER }}>
          {countdownText(phase.days)}
        </div>
      )}
      {phase?.status === 'ongoing' && (
        <div className="font-display text-4xl font-black text-center mb-8" style={{ color: GREEN }}>
          Invitational käynnissä! 🔥
        </div>
      )}
      {phase?.status === 'past' && (
        <div className="font-display text-xl font-bold text-gc-muted text-center mb-8">
          Invitational {INVITATIONAL_YEAR} — pelattu
        </div>
      )}

      {days.map((day, i) => (
        <div key={day.date} className={i > 0 ? 'mt-8' : undefined}>
          <h2
            className="font-display text-2xl font-extrabold text-white mb-4 pl-3"
            style={{ borderLeft: `3px solid ${AMBER}` }}
          >
            {formatDayHeading(day.date)}
          </h2>

          {day.events.map(event => (
            <ScheduleEventCard key={event.id} event={event} />
          ))}
        </div>
      ))}
    </div>
  )
}
