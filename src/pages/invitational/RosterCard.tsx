import { useState } from 'react'
import InitialsAvatar from '../../components/shared/InitialsAvatar'
import { playerImagePath } from '../../lib/playerImage'
import { AMBER, type RosterEntry } from './roster'

interface Props {
  entry: RosterEntry
  /** 1-based card number shown top-right. */
  position: number
  total: number
  /** Number of courses in the season, for the KENTÄT stat box. */
  courseCount: number
  showHint: boolean
}

/** Barely-there 45° grain so the info panel reads as printed stock. */
const NOISE =
  'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 3px)'

const statBox: React.CSSProperties = {
  flex: 1,
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 8,
  padding: '8px 6px',
  textAlign: 'center',
}

const statLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.12em',
  color: 'rgba(255,255,255,0.50)',
  textTransform: 'uppercase',
}

const statValue: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 20,
  fontWeight: 800,
  color: '#fff',
}

const titleLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
}

export default function RosterCard({ entry, position, total, courseCount, showHint }: Props) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const { player, liekkipoikaYears, scratchWins } = entry
  const hasTitles = liekkipoikaYears.length > 0 || scratchWins.length > 0
  const bothTitleTypes = liekkipoikaYears.length > 0 && scratchWins.length > 0
  const pad = (n: number) => String(n).padStart(3, '0')

  // Ordering logic keeps these newest-first; titles read better chronologically.
  const liekkipoikaAsc = [...liekkipoikaYears].reverse()
  const scratchAsc = [...scratchWins].reverse()

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
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
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

      {/* The card cut */}
      <div style={{ height: 3, flexShrink: 0, background: entry.borderColor }} />

      {/* ZONE 2 — info panel */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: '16px 20px 24px 20px',
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          backgroundColor: entry.panelBase,
          backgroundImage: `${NOISE}, linear-gradient(${entry.panelTint}, ${entry.panelTint})`,
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(32px, 9vw, 48px)',
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '0.02em',
            lineHeight: 1,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {player.full_name}
        </h1>

        {player.invitational_tagline && (
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              fontWeight: 400,
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.65)',
              lineHeight: 1.3,
              marginBottom: 12,
            }}
          >
            {player.invitational_tagline}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={statBox}>
            <div style={statLabel}>HCP</div>
            <div style={statValue}>{player.hcp_current ?? '—'}</div>
          </div>
          <div style={statBox}>
            <div style={statLabel}>SIJA</div>
            <div style={statValue}>{entry.rank !== null ? `${entry.rank}.` : '—'}</div>
          </div>
          <div style={statBox}>
            <div style={statLabel}>KENTÄT</div>
            <div style={statValue}>
              {entry.roundsPlayed}/{courseCount}
            </div>
          </div>
        </div>

        {hasTitles && (
          <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
            {liekkipoikaYears.length > 0 && (
              <div style={{ flex: bothTitleTypes ? 1 : undefined }}>
                <div style={{ ...titleLabel, color: AMBER }}>🔥👦 LIEKKIPOIKA</div>
                {liekkipoikaAsc.map(year => (
                  <div
                    key={year}
                    style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: AMBER, lineHeight: 1.2 }}
                  >
                    {year}
                  </div>
                ))}
              </div>
            )}
            {scratchWins.length > 0 && (
              <div style={{ flex: bothTitleTypes ? 1 : undefined }}>
                <div style={{ ...titleLabel, color: '#fff' }}>🏆⛳ SCRATCH</div>
                {scratchAsc.map(win => (
                  <div
                    key={win.year}
                    style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.25 }}
                  >
                    {win.shots !== null ? `${win.year} · ${win.shots} lyöntiä` : win.year}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
