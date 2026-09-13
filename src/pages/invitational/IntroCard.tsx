import { AMBER } from './roster'
import LeagueLogo from '../../components/LeagueLogo'
import { getLeagueBrand } from '../../lib/branding'

interface Props {
  /** Size of this year's field, shown in the stats row. */
  playerCount: number
  /** How many years of invitational_results exist. */
  historyYears: number
}

/** Same 45 degree grain as the player info panels, a touch fainter. */
const NOISE =
  'repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)'

function StatRow({ number, text }: { number: string; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 900, color: AMBER, lineHeight: 1 }}>
        {number}
      </span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>
        {text}
      </span>
    </div>
  )
}

export default function IntroCard({ playerCount, historyYears }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderRadius: 12,
        border: `4px solid ${AMBER}`,
        // Inset for the same reason as the player cards: the card fills the viewport,
        // so an outer glow would fall off-screen entirely.
        boxShadow: 'inset 0 0 24px rgba(var(--league-primary-rgb),0.25)',
        backgroundColor: 'var(--bg-dark)',
        backgroundImage: NOISE,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        textAlign: 'center',
      }}
    >
      <LeagueLogo
        alt="League logo"
        style={{
          height: 80,
          width: 'auto',
          filter: 'invert(1) drop-shadow(0 4px 16px rgba(var(--league-primary-rgb),0.20))',
          marginBottom: 24,
        }}
      />

      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.45)',
          letterSpacing: '0.25em',
        }}
      >
        GOLF COMPANY
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 36,
          fontWeight: 900,
          color: AMBER,
          letterSpacing: '0.06em',
          lineHeight: 1,
          textShadow: '0 4px 20px rgba(var(--league-primary-rgb),0.35)',
        }}
      >
        INVITATIONAL
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 72,
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '0.02em',
          lineHeight: 0.95,
        }}
      >
        2026
      </div>

      <div style={{ width: 60, height: 2, background: AMBER, margin: '24px auto' }} />

      <div
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.70)',
          letterSpacing: '0.08em',
          marginBottom: 4,
        }}
      >
        25.–27.9.2026
      </div>
      <div style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.50)', marginBottom: 0 }}>
        Tahko
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, marginBottom: 0, padding: '0 8px', textAlign: 'left', width: '100%', boxSizing: 'border-box' }}>
        <StatRow number={String(historyYears)} text="aikaisempaa mestaria" />
        <StatRow number={String(playerCount)} text="kutsuttua. Yksi liigapaita." />
        <StatRow number="IX" text={`${getLeagueBrand().name} Invitational`} />
      </div>

      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          fontWeight: 700,
          fontStyle: 'italic',
          color: '#fff',
          marginTop: 24,
          marginBottom: 0,
        }}
      >
        Liigapaita jaossa.
      </div>

      <div
        style={{
          marginTop: 32,
          fontSize: 11,
          color: 'rgba(255,255,255,0.30)',
          letterSpacing: '0.10em',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        pyyhkäise aloittaaksesi
        <span className="animate-story-arrow" style={{ display: 'inline-block' }}>
          →
        </span>
      </div>
    </div>
  )
}
