import { useEffect, useRef, useState } from 'react'
import Icon from './icons'
import { AMBER, GREEN } from './schedule'

// MUTED_RED went with the red x icons — the pack list uses no icons.
const MOBILEPAY_BLUE = '#5A78FF'
const PAYMENT_NAME = 'Miro'
const PAYMENT_AMOUNT = 260
/** Also offered on the clipboard, for anyone who opens the app by hand. */
const PAYMENT_COMMENT = 'GC Invitational 2026'
const MOBILEPAY_LINK = `mobilepay://send?amount=${PAYMENT_AMOUNT}&comment=${encodeURIComponent(PAYMENT_COMMENT)}`

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
    detail: 'Aamiainen · lounas · illallinen (Ravintola Pölli)',
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

      <div className={CARD}>
        <div className="label" style={{ color: AMBER, opacity: 0.75 }}>
          Maksuohjeet
        </div>

        <p className="text-[15px] text-white mt-3">Maksa MobilePaylla mahdollisimman pian.</p>

        <div className="font-display text-4xl font-black text-white mt-4 leading-none">{PAYMENT_NAME}</div>
        <div className="text-sm text-gc-muted mt-1">MobilePay</div>

        <button
          type="button"
          onClick={openMobilePay}
          className="w-full flex items-center justify-center rounded-xl mt-4"
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

        {/* The deep link fails silently when MobilePay is missing, so the manual
            route has to be written out rather than left to the button. */}
        <p className="text-xs text-center mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Avaa MobilePay → lähetä 260 € → etsi käyttäjä: {PAYMENT_NAME}
        </p>

        <div className="text-center">
          <button type="button" onClick={copyComment} className="btn-ghost text-xs mt-2 py-1">
            {copied ? 'Kopioitu ✓' : 'Kopioi viestikenttä'}
          </button>
        </div>

        <p className="text-[13px] text-gc-muted italic mt-3">
          Lisää viestiksi: {PAYMENT_COMMENT} + oma nimesi
        </p>
      </div>

      <p className="text-[13px] text-gc-muted text-center mt-4">
        Maksa mahdollisimman pian — paikat vahvistuvat maksun jälkeen.
      </p>
    </div>
  )
}
