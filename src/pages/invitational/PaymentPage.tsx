import { useEffect, useRef, useState } from 'react'
import Icon from './icons'
import { AMBER, GREEN } from './schedule'

const MOBILEPAY_BLUE = '#5A78FF'
const PAYMENT_NAME = 'Miro'
const PAYMENT_AMOUNT = 260
const PAYMENT_COMMENT = 'GC Invitational 2026'
/** Bare scheme: it opens the app at its home screen and nothing more. Prefilling the
 * fields needs parameters MobilePay does not publicly document, which is why the
 * values below are offered on the clipboard instead. */
const MOBILEPAY_LINK = 'mobilepay://'

/** Read-only: short enough to retype, and both are already on the page above. Only
 * the message is worth a clipboard button. */
const INFO_FIELDS = [
  { label: 'Nimi', value: PAYMENT_NAME },
  { label: 'Summa', value: `${PAYMENT_AMOUNT} €` },
]

interface IncludedItem {
  text: string
  /** Optional second line, indented to sit under the text rather than the icon. */
  detail?: string
}

const INCLUDED: IncludedItem[] = [
  { text: 'Majoitus viikonlopun ajaksi' },
  { text: 'Friday Warmup — green fee (Old Course)' },
  { text: 'Liekki-Major — green fee (Lake & Forest Course)' },
  {
    text: 'Ruokailu koko viikonlopun ajan',
    detail: 'Aamiainen · lounas · illallinen',
  },
  { text: 'Kuljetukset kentälle ja takaisin' },
  { text: 'Palkintogaala' },
]

const PACK = ['Omat juomat', 'Omat pyyhkeet', 'Omat lakanat']

interface GolfCarDay {
  day: string
  detail: string
  players: string[]
}

const GOLF_CAR_DAYS: GolfCarDay[] = [
  { day: 'Perjantai', detail: '3 golfautoa varattu — varaukset Miron nimissä.', players: ['Jussi', 'Pekka', 'Tommi'] },
  { day: 'Lauantai', detail: '4 golfautoa varattu — varaukset Miron nimissä.', players: ['Brukke', 'Nyyssönen', 'Tommi', 'Pekka', 'Jussi', 'VP', 'Tero'] },
]

const CARD = 'bg-gc-card rounded-2xl p-6 mb-4 border border-white/8'
const GOLF_CARS_CARD = 'bg-gc-card rounded-2xl p-5 mb-4 border border-white/8'

function IncludedList({ items }: { items: IncludedItem[] }) {
  return (
    <div className="mt-3">
      {items.map((item, i) => (
        <div key={item.text} className={`py-2.5 ${i > 0 ? 'border-t border-white/6' : ''}`}>
          <div className="flex items-center gap-3">
            <Icon name="check" size={16} color={GREEN} />
            <span className="text-[15px] text-white">{item.text}</span>
          </div>
          {item.detail && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2, marginLeft: 28 }}>
              {item.detail}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Reminders rather than features, so no icons and deliberately quieter than the
 * included list. */
function PackList({ items }: { items: string[] }) {
  return (
    <div className="mt-3">
      {items.map((item, i) => (
        <div
          key={item}
          style={{
            padding: '10px 0',
            fontSize: 15,
            color: 'rgba(255,255,255,0.65)',
            borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined,
          }}
        >
          🧳 {item}
        </div>
      ))}
    </div>
  )
}

function GolfCarSection({ day, detail, players }: GolfCarDay) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'white', marginBottom: 6 }}>
        {day}
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)', marginBottom: 8 }}>
        {detail}
      </div>
      <div className="flex flex-wrap gap-2">
        {players.map(name => (
          <span
            key={name}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 13,
              fontWeight: 600,
              color: 'white',
            }}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function PaymentPage() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copyComment() {
    try {
      await navigator.clipboard.writeText(PAYMENT_COMMENT)
    } catch {
      return
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  function openMobilePay() {
    window.location.href = MOBILEPAY_LINK
  }

  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-white leading-tight">Ilmoittautuminen</h1>
      <div className="text-[15px] text-gc-muted mb-6">Golf Company Invitational 2026</div>

      <div className={`${CARD} p-8 text-center`}>
        <div className="font-display text-7xl font-black leading-none" style={{ color: AMBER }}>
          260 €
        </div>
        <div className="text-base text-gc-muted mt-2">per pelaaja</div>
      </div>

      <div className={CARD}>
        <div className="label" style={{ color: AMBER, opacity: 0.75 }}>
          Mitä sisältyy
        </div>
        <IncludedList items={INCLUDED} />
      </div>

      <div className={CARD}>
        <div className="label" style={{ color: 'rgba(255,255,255,0.50)' }}>
          Muista pakata mukaan
        </div>
        <PackList items={PACK} />
      </div>

      <div className={GOLF_CARS_CARD}>
        <div className="label" style={{ color: AMBER, opacity: 0.75 }}>
          Golfautot
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)', fontStyle: 'italic', marginBottom: 16 }}>
          Ei sisälly osallistumismaksuun.
        </p>

        <GolfCarSection {...GOLF_CAR_DAYS[0]} />

        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '16px 0' }} />

        <GolfCarSection {...GOLF_CAR_DAYS[1]} />

        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic', marginTop: 16, lineHeight: 1.5 }}>
          Golfautot jaetaan lähtöryhmien mukaan perjantai- ja lauantaiaamuina. Jos olet listalla — olet sitoutunut maksamaan auton.
        </p>
      </div>

      <div className={CARD}>
        <div className="label" style={{ color: AMBER, opacity: 0.75 }}>
          Maksa MobilePaylla
        </div>

        {/* Opens the app; the buttons below carry what has to be typed into it. */}
        <button
          type="button"
          onClick={openMobilePay}
          className="w-full flex items-center justify-center rounded-xl mt-3"
          style={{ height: 52, gap: 10, background: MOBILEPAY_BLUE }}
        >
          {/* Their real mark needs permission, so this is a plain monogram. */}
          <span
            className="flex items-center justify-center rounded-full shrink-0"
            style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.20)' }}
          >
            <span className="font-display text-white" style={{ fontSize: 12, fontWeight: 800 }}>
              MP
            </span>
          </span>
          <span className="font-display text-white" style={{ fontSize: 17, fontWeight: 700 }}>
            Avaa MobilePay
          </span>
          <span className="text-white/70 shrink-0">
            <Icon name="arrow-right" size={16} />
          </span>
        </button>

        <div className="mt-3">
          {INFO_FIELDS.map(field => (
            <div
              key={field.label}
              className="flex items-center justify-between py-2.5 border-t border-white/6"
            >
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)' }}>{field.label}</span>
              <span className="font-display text-white" style={{ fontSize: 16, fontWeight: 700 }}>
                {field.value}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={copyComment}
          className="btn-ghost w-full mt-2"
          style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}
        >
          {copied ? 'Kopioitu ✓' : `Kopioi viesti: ${PAYMENT_COMMENT}`}
        </button>

        <p className="text-[13px] text-gc-muted italic mt-3">
          Avaa MobilePay → hae käyttäjä {PAYMENT_NAME} → lähetä {PAYMENT_AMOUNT} € viestillä{' '}
          {PAYMENT_COMMENT}
        </p>
      </div>

      <p className="text-[13px] text-gc-muted text-center mt-4">
        Maksa mahdollisimman pian — ilmoittautuminen on sitova eikä sitä voi perua.
      </p>
    </div>
  )
}
