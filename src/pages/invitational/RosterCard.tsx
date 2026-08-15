import { useState } from 'react'
import InitialsAvatar from '../../components/shared/InitialsAvatar'
import { playerImagePath } from '../../lib/playerImage'
import { AMBER, type RosterEntry } from './roster'

interface Props {
  entry: RosterEntry
  /** 1-based card number shown top-right. */
  position: number
  total: number
  showHint: boolean
}

/** Barely-there 45° grain so the info panel reads as printed stock. */
const NOISE =
  'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 3px)'

const titleLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.10em',
}

export default function RosterCard({ entry, position, total, showHint }: Props) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const { player, liekkipoikaYears, scratchWins } = entry
  // Points-per-hole needs both a points total and holes to divide by.
  const showKesakisa = (entry.totalPoints ?? 0) > 0 && entry.avgPerHole !== null
  const pad = (n: number) => String(n).padStart(3, '0')

  // Ordering logic keeps these newest-first; titles read better chronologically.
  const liekkipoikaAsc = [...liekkipoikaYears].reverse()
  const scratchAsc = [...scratchWins].reverse()
  // Shots line mirrors the years line positionally, so a win with no recorded shot
  // count holds its slot with a dash rather than silently shifting the others.
  const scratchShots = scratchAsc.some(w => w.shots !== null)
    ? scratchAsc.map(w => w.shots ?? '—').join(' · ')
    : null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 12,
        border: `${entry.borderWidth}px solid ${entry.borderColor}`,
        // Inset rather than outer: the card fills the viewport, so an outer glow
        // would fall entirely outside the screen and never be seen.
        boxShadow: entry.glow ? 'inset 0 0 24px rgba(232,168,32,0.25)' : undefined,
        background: entry.panelBase,
      }}
    >
      {/* ZONE 1 — photo frame */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '58%',
          flexShrink: 0,
          overflow: 'hidden',
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          background: 'linear-gradient(160deg, #221D17 0%, #17130F 100%)',
        }}
      >
        {photoFailed ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <InitialsAvatar name={player.full_name} size={140} color="#2D6A4F" />
          </div>
        ) : (
          <img
            src={playerImagePath(player.full_name)}
            alt={player.full_name}
            onError={() => setPhotoFailed(true)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              display: 'block',
            }}
          />
        )}

        {/* Softens the hard cut at the bottom of the photo */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            boxShadow: 'inset 0 -8px 16px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        />

        {/* Breathing room before the hard break, as an overlay on the photo rather
            than padding — padding here left a visible strip of card background. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 12,
            background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 100%)',
            pointerEvents: 'none',
          }}
        />

        <img
          src="/gc-logo.png"
          alt="GC"
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            height: 52,
            width: 'auto',
            filter: 'invert(1) drop-shadow(0 2px 8px rgba(0,0,0,0.6))',
          }}
        />

        <span
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            fontFamily: "'Courier New', monospace",
            fontSize: 12,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.60)',
          }}
        >
          {pad(position)} / {pad(total)}
        </span>

        {showHint && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 11,
              color: 'rgba(255,255,255,0.40)',
            }}
          >
            ← pyyhkäise →
          </div>
        )}
      </div>

      {/* The card cut — a hairline rule with the series pill masking its centre */}
      <div style={{ position: 'relative', flexShrink: 0, borderTop: `1px solid ${entry.borderColor}` }}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '0.10em',
            color: entry.borderColor,
            background: '#17130F',
            border: `1px solid ${entry.borderColor}`,
            borderRadius: 12,
            padding: '5px 14px',
            whiteSpace: 'nowrap',
          }}
        >
          GC INVITATIONAL 2026
        </div>
      </div>

      {/* ZONE 2 — info panel */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: '16px 20px 48px 20px',
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          backgroundColor: entry.panelBase,
          backgroundImage: `${NOISE}, linear-gradient(${entry.panelTint}, ${entry.panelTint})`,
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 56,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '0.02em',
            lineHeight: 1,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          {player.full_name}
        </h1>

        {player.invitational_tagline && (
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 19,
              fontWeight: 400,
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.65)',
              lineHeight: 1.35,
              marginBottom: 16,
            }}
          >
            {player.invitational_tagline}
          </div>
        )}

        {showKesakisa && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 0',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: 11,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.50)',
              }}
            >
              Kesäkisa 2026
            </span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 700,
                color: AMBER,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>{entry.avgPerHole?.toFixed(1)}p/väylä</span>
              <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.20)' }} />
              <span>{entry.skins} skiniä</span>
            </span>
          </div>
        )}

        {liekkipoikaYears.length > 0 && (
          <div
            style={{
              // Negative margins cancel the panel's 20px side padding so the banner
              // runs edge to edge.
              marginLeft: -20,
              marginRight: -20,
              marginTop: 12,
              marginBottom: 12,
              padding: '10px 20px',
              background:
                'linear-gradient(135deg, rgba(232,168,32,0.25) 0%, rgba(232,168,32,0.15) 50%, rgba(232,168,32,0.25) 100%)',
              borderTop: '1px solid rgba(232,168,32,0.40)',
              borderBottom: '1px solid rgba(232,168,32,0.40)',
              // Label sits left; the first year shares its row, further years stack
              // beneath it flush right.
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ ...titleLabel, color: AMBER, letterSpacing: '0.12em' }}>🔥👦 LIEKKIPOIKA</div>
            <div style={{ textAlign: 'right' }}>
              {liekkipoikaAsc.map(year => (
                <div
                  key={year}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 36,
                    fontWeight: 900,
                    color: AMBER,
                    lineHeight: 1,
                    textShadow: '0 2px 12px rgba(232,168,32,0.30)',
                  }}
                >
                  {year}
                </div>
              ))}
            </div>
          </div>
        )}

        {scratchWins.length > 0 && (
          <div>
            <div style={{ ...titleLabel, color: '#fff', marginBottom: 6 }}>🏆⛳ SCRATCH</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
              {scratchAsc.map(w => w.year).join(' · ')}
            </div>
            {scratchShots && (
              <div style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.55)', lineHeight: 1.2 }}>
                {scratchShots} lyöntiä
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
