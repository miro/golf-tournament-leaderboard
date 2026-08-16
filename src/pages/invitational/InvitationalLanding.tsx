import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getInvitationalSchedule } from '../../lib/queries'
import BackButton from './BackButton'
import Icon from './icons'
import { INVITATIONAL_ROSTER_2026 } from './roster'
import {
  AMBER,
  GREEN,
  INVITATIONAL_DATE_RANGE,
  INVITATIONAL_YEAR,
  daysRemainingText,
  groupByDay,
  schedulePhase,
  type SchedulePhase,
} from './schedule'

interface Card {
  to: string
  icon: 'users' | 'calendar' | 'credit-card'
  title: string
  subtitle: string
}

const cards: Card[] = [
  {
    to: '/invitational/roster',
    icon: 'users',
    title: 'Pelaajat',
    subtitle: `${INVITATIONAL_ROSTER_2026.length} pelaajaa · Tutustu pelaajiin`,
  },
  {
    to: '/invitational/schedule',
    icon: 'calendar',
    title: 'Ohjelma',
    subtitle: `Perjantai–Sunnuntai · ${INVITATIONAL_DATE_RANGE}`,
  },
  {
    to: '/invitational/payment',
    icon: 'credit-card',
    title: 'Ilmoittautuminen',
    subtitle: '260 € · MobilePay · Miro',
  },
]

function Countdown({ phase }: { phase: SchedulePhase }) {
  if (phase.status === 'ongoing') {
    return (
      <div className="font-display text-xl font-bold" style={{ color: GREEN }}>
        Invitational käynnissä 🔥
      </div>
    )
  }
  if (phase.status === 'past') {
    return <div className="font-display text-xl font-bold text-white/50">Invitational {INVITATIONAL_YEAR} — pelattu</div>
  }
  return (
    <div className="font-display text-xl font-bold" style={{ color: AMBER }}>
      {daysRemainingText(phase.days)}
    </div>
  )
}

export default function InvitationalLanding() {
  const [phase, setPhase] = useState<SchedulePhase | null>(null)
  // Captured once per mount: the countdown does not need to tick live.
  const [now] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false
    getInvitationalSchedule(INVITATIONAL_YEAR)
      .then(rows => {
        if (!cancelled) setPhase(schedulePhase(groupByDay(rows), now))
      })
      // The hero stands on its own without a countdown, so a failure stays silent.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [now])

  return (
    <div className="min-h-screen bg-gc-dark">
      {/* Pattern and vignette layers live in .invitational-hero as ::before/::after. */}
      <div
        className="invitational-hero flex flex-col items-center justify-center text-center px-6"
        style={{ minHeight: '45vh' }}
      >
        <BackButton to="/" label="Takaisin etusivulle" />

        <div className="relative py-12" style={{ zIndex: 2 }}>
          <img
            src="/gc-logo.png"
            alt="Golf Company"
            className="mx-auto"
            style={{
              height: 64,
              width: 'auto',
              marginBottom: 20,
              filter: 'invert(1) drop-shadow(0 4px 16px rgba(0,0,0,0.5))',
            }}
          />

          <div
            className="font-display text-white/60"
            style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.25em', marginBottom: 4 }}
          >
            GOLF COMPANY
          </div>

          <div
            className="font-display text-white"
            style={{ fontSize: 40, fontWeight: 900, letterSpacing: '0.06em', lineHeight: 1, marginBottom: 4 }}
          >
            INVITATIONAL
          </div>

          <div
            className="font-display"
            style={{ fontSize: 56, fontWeight: 900, color: AMBER, lineHeight: 1, marginBottom: 16 }}
          >
            {INVITATIONAL_YEAR}
          </div>

          <div className="text-white/65" style={{ fontSize: 15, marginBottom: 8 }}>
            {INVITATIONAL_DATE_RANGE}
          </div>

          {phase && <Countdown phase={phase} />}
        </div>
      </div>

      <div className="bg-gc-dark" style={{ padding: '24px 16px 40px 16px' }}>
        <div className="max-w-[680px] mx-auto flex flex-col gap-3">
          {cards.map(card => (
            <Link
              key={card.to}
              to={card.to}
              className="group flex items-center rounded-2xl transition-colors duration-150 border border-white/6 hover:border-white/14 bg-gc-card hover:bg-[#271F18]"
              style={{ padding: 20 }}
            >
              <span
                className="flex items-center justify-center rounded-full shrink-0 text-white/70"
                style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.06)' }}
              >
                <Icon name={card.icon} size={22} />
              </span>

              <span className="flex-1 min-w-0" style={{ margin: '0 16px' }}>
                <span className="block font-display text-white" style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
                  {card.title}
                </span>
                <span className="block text-white/50" style={{ fontSize: 13 }}>
                  {card.subtitle}
                </span>
              </span>

              <span className="text-white/30 shrink-0">
                <Icon name="chevron-right" size={16} />
              </span>
            </Link>
          ))}
        </div>

        <div className="max-w-[680px] mx-auto text-center" style={{ marginTop: 16 }}>
          <a
            href="https://karaokelistat.fi/7269"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20 transition-colors"
            style={{ padding: '8px 16px', fontSize: 13 }}
          >
            🎤 Karhu Pub Setlist
          </a>
        </div>
      </div>
    </div>
  )
}
