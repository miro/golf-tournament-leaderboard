import type { InvitationalScheduleEvent } from '../../lib/database.types'
import Icon from './icons'
import { AMBER, formatTime } from './schedule'

/** Golf keeps the emoji the rest of the app uses for it; the others are line icons. */
const CATEGORY_ICON: Record<InvitationalScheduleEvent['category'], 'golf' | 'car' | 'kitchen' | 'users' | 'trophy' | 'home'> = {
  golf: 'golf',
  transport: 'car',
  food: 'kitchen',
  social: 'users',
  ceremony: 'trophy',
  logistics: 'home',
}

function CategoryIcon({ category, size, color }: { category: InvitationalScheduleEvent['category']; size: number; color: string }) {
  const icon = CATEGORY_ICON[category]
  if (icon === 'golf') return <span style={{ fontSize: size, lineHeight: 1 }}>⛳</span>
  return <Icon name={icon} size={size} color={color} />
}

function LocationRow({ location, large }: { location: string; large?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 mt-1 text-gc-muted ${large ? 'text-sm' : 'text-[13px]'}`}>
      <Icon name="map-pin" size={large ? 15 : 14} />
      <span>{location}</span>
    </div>
  )
}

function HighlightCard({ event }: { event: InvitationalScheduleEvent }) {
  const teeTimes = event.tee_times ?? []
  return (
    <div className="rounded-xl mb-2 overflow-hidden bg-gc-card" style={{ border: `2px solid ${AMBER}` }}>
      {/* Colour band reads as the card's top stripe, so it sits outside the padding. */}
      <div className="h-2 w-full" style={{ background: AMBER }} />

      <div className="p-5">
        <div className="flex items-center gap-2">
          <CategoryIcon category={event.category} size={20} color={AMBER} />
          <h3
            className="font-display text-[22px] font-black uppercase leading-tight"
            style={{ color: AMBER, letterSpacing: '0.02em' }}
          >
            {event.title}
          </h3>
          {/* Tee times repeat the start time, so it is only worth showing without them. */}
          {event.start_time && teeTimes.length === 0 && (
            <span className="font-display text-[20px] font-bold ml-auto" style={{ color: AMBER }}>
              {formatTime(event.start_time)}
            </span>
          )}
        </div>

        {event.subtitle && <div className="text-sm text-gc-muted mt-1.5">{event.subtitle}</div>}
        {event.location && <LocationRow location={event.location} large />}

        {teeTimes.length > 0 && (
          <div className="mt-4">
            <div className="label text-center" style={{ color: AMBER, opacity: 0.75 }}>
              Lähtöajat
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {teeTimes.map(time => (
                <div
                  key={time}
                  className="rounded-lg px-4 py-2.5"
                  style={{ background: 'rgba(232,168,32,0.20)', border: '1px solid rgba(232,168,32,0.50)' }}
                >
                  <span className="font-display text-2xl font-black" style={{ color: AMBER }}>
                    {formatTime(time)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StandardCard({ event }: { event: InvitationalScheduleEvent }) {
  const teeTimes = event.tee_times ?? []
  return (
    <div className="bg-gc-card rounded-xl p-4 mb-2 flex gap-3">
      {/* Untimed events show no placeholder, but the column keeps its width so that
          titles stay aligned down a day that mixes timed and untimed entries. */}
      <div className="font-display text-[20px] font-bold shrink-0 w-[52px] leading-tight" style={{ color: AMBER }}>
        {event.start_time ? formatTime(event.start_time) : ''}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <CategoryIcon category={event.category} size={16} color="#9A8870" />
          <h3 className="font-display text-[17px] font-bold text-white leading-tight">{event.title}</h3>
        </div>

        {event.subtitle && <div className="text-[13px] text-gc-muted mt-1">{event.subtitle}</div>}
        {event.location && <LocationRow location={event.location} />}

        {teeTimes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {teeTimes.map(time => (
              <span
                key={time}
                className="font-display text-[13px] font-bold rounded-md px-2 py-0.5"
                style={{ color: AMBER, background: 'rgba(232,168,32,0.14)', border: '1px solid rgba(232,168,32,0.35)' }}
              >
                {formatTime(time)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ScheduleEventCard({ event }: { event: InvitationalScheduleEvent }) {
  return event.is_highlight ? <HighlightCard event={event} /> : <StandardCard event={event} />
}
