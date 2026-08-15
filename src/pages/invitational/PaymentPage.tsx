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

/** Every field MobilePay asks for, each on its own clipboard button. */
const COPY_FIELDS = [
  { key: 'name', label: `Kopioi nimi: ${PAYMENT_NAME}`, value: PAYMENT_NAME },
  { key: 'amount', label: `Kopioi summa: ${PAYMENT_AMOUNT}`, value: String(PAYMENT_AMOUNT) },
  { key: 'comment', label: `Kopioi viesti: ${PAYMENT_COMMENT}`, value: PAYMENT_COMMENT },
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

const CARD = 'bg-gc-card rounded-2xl p-6 mb-4 border border-white/8'

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

export default function PaymentPage() {
  /** Which field was last copied, so only that button confirms. */
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copyField(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return
    }
    setCopiedKey(key)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopiedKey(null), 2000)
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

        <div className="flex flex-col gap-2 mt-2">
          {COPY_FIELDS.map(field => (
            <button
              key={field.key}
              type="button"
              onClick={() => copyField(field.key, field.value)}
              className="btn-ghost w-full"
              style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}
            >
              {copiedKey === field.key ? 'Kopioitu ✓' : field.label}
            </button>
          ))}
        </div>

        <p className="text-[13px] text-gc-muted italic mt-3">
          Avaa MobilePay → hae käyttäjä {PAYMENT_NAME} → lähetä {PAYMENT_AMOUNT} € viestillä{' '}
          {PAYMENT_COMMENT}
        </p>
      </div>

      <p className="text-[13px] text-gc-muted text-center mt-4">
        Maksa mahdollisimman pian — paikat vahvistuvat maksun jälkeen.
      </p>
    </div>
  )
}
