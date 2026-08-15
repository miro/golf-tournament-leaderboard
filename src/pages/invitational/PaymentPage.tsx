import { useEffect, useRef, useState } from 'react'
import Icon from './icons'
import { AMBER, GREEN } from './schedule'

const MUTED_RED = '#8A3A3A'
const PAYMENT_NAME = 'Miro'

const INCLUDED = [
  'Majoitus viikonlopun ajaksi',
  'Friday Warmup — green fee (Old Course)',
  'Liekki-Major — green fee (Lake & Forest Course)',
  'Aamiainen lauantaina',
  'Lounas lauantaina (Golden Resort Club)',
  'Kuljetukset kentälle ja takaisin',
  'Italialainen illallinen (Ravintola Pölli)',
  'Palkintogaala',
]

const EXCLUDED = ['Omat juomat', 'Omat pyyhkeet', 'Omat lakanat']

const CARD = 'bg-gc-card rounded-2xl p-6 mb-4 border border-white/8'

function ItemList({ items, included }: { items: string[]; included: boolean }) {
  return (
    <div className="mt-3">
      {items.map((item, i) => (
        <div
          key={item}
          className={`flex items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-white/6' : ''}`}
        >
          <Icon name={included ? 'check' : 'x'} size={16} color={included ? GREEN : MUTED_RED} />
          <span className={`text-[15px] ${included ? 'text-white' : 'text-gc-muted'}`}>{item}</span>
        </div>
      ))}
    </div>
  )
}

export default function PaymentPage() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copyName() {
    try {
      await navigator.clipboard.writeText(PAYMENT_NAME)
    } catch {
      return
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-white leading-tight">Maksaminen</h1>
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
        <ItemList items={INCLUDED} included />
      </div>

      <div className={CARD}>
        <div className="label">Omat hankinnat</div>
        <ItemList items={EXCLUDED} included={false} />
      </div>

      <div className={CARD}>
        <div className="label" style={{ color: AMBER, opacity: 0.75 }}>
          Maksuohjeet
        </div>

        <p className="text-[15px] text-white mt-3">Maksa MobilePaylla mahdollisimman pian.</p>

        <div className="font-display text-4xl font-black text-white mt-4 leading-none">{PAYMENT_NAME}</div>
        <div className="text-sm text-gc-muted mt-1">MobilePay</div>

        <button type="button" onClick={copyName} className="btn-ghost text-sm mt-4 py-1.5">
          {copied ? 'Kopioitu ✓' : 'Kopioi nimi'}
        </button>

        <p className="text-[13px] text-gc-muted italic mt-3">
          Lisää viestiksi: GC Invitational 2026 + oma nimesi
        </p>
      </div>

      <p className="text-[13px] text-gc-muted text-center mt-4">
        Maksa mahdollisimman pian — paikat vahvistuvat maksun jälkeen.
      </p>
    </div>
  )
}
