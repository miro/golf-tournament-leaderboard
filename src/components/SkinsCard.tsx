import { useState } from 'react'
import type { Course, RoundWithDetails } from '../lib/database.types'
import HoleOwnerGrid from './shared/HoleOwnerGrid'

const BG = '#1a1a18'
const MUTED = 'rgba(255,255,255,0.4)'

interface Props {
  course: Course
  seasonId: string
  courseRounds: RoundWithDetails[]
}

function fmtDelta(delta: number): { text: string; color: string } {
  if (delta < 0) return { text: `${delta}`, color: '#E8453C' }
  if (delta === 0) return { text: 'E', color: 'white' }
  return { text: `+${delta}`, color: 'white' }
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ color: '#9A8870', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>
      {text}
    </div>
  )
}

export default function SkinsCard({ course, seasonId, courseRounds }: Props) {
  const [skinCounts, setSkinCounts] = useState<{ ownedCount: number; emptyCount: number } | null>(null)
  const color = course.color_hex ?? '#2D6A4F'
  const hasResults = courseRounds.length > 0

  // getCourseRounds sorts DESC by total_points, so the first entry is the pistebogey leader
  const pistebogeyLeader = hasResults ? courseRounds[0] : null
  const scratchCandidates = courseRounds.filter(r => r.total_strokes != null)
  const scratchLeader = scratchCandidates.length > 0
    ? scratchCandidates.reduce((best, r) => (r.total_strokes! < best.total_strokes! ? r : best))
    : null

  const stbl = pistebogeyLeader ? fmtDelta(36 - pistebogeyLeader.total_points) : null
  const toPar = scratchLeader ? fmtDelta(scratchLeader.total_strokes! - course.par_total) : null

  return (
    <div
      className="font-display overflow-hidden"
      style={{ background: BG, border: `2px solid ${color}`, borderRadius: 12, maxWidth: 480, margin: '0 auto' }}
    >
      {/* Header band */}
      <div style={{ background: color, height: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px', width: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'white', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>GC</span>
          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
          <span style={{ color: 'rgba(255,255,255,0.80)', fontSize: 13, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Liekkipoika Kesäkisa 2026
          </span>
        </div>
        <div style={{ color: 'white', fontWeight: 800, fontSize: 'clamp(18px, 5vw, 28px)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {course.name}
        </div>
      </div>

      {hasResults ? (
        <>
          {/* Kenttäjohtajat */}
          <div style={{ padding: '16px 24px' }}>
            <SectionLabel text="KENTTÄJOHTAJAT" />
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>
                  PISTEBOGEY
                </div>
                <div style={{ color, fontWeight: 700, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pistebogeyLeader?.player?.full_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                  <span style={{ color: 'white', fontWeight: 800, fontSize: 24 }}>{pistebogeyLeader?.total_points}p</span>
                  {stbl && <span style={{ color: stbl.color, fontWeight: 800, fontSize: 16 }}>{stbl.text}</span>}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>
                  SCRATCH
                </div>
                <div style={{ color, fontWeight: 700, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {scratchLeader?.player?.full_name ?? '–'}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                  <span style={{ color: 'white', fontWeight: 800, fontSize: 24 }}>
                    {scratchLeader ? `${scratchLeader.total_strokes} lyöntiä` : '–'}
                  </span>
                  {toPar && <span style={{ color: toPar.color, fontWeight: 800, fontSize: 16 }}>{toPar.text}</span>}
                </div>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />

          {/* Skins grid */}
          <div style={{ padding: '16px 24px' }}>
            <SectionLabel text="SKINS" />
            <HoleOwnerGrid
              courseId={course.id}
              seasonId={seasonId}
              courseColor={color}
              highlightPlayerIds={[]}
              emptyStateText="18 skiniä jaossa 🍭"
              onDataLoaded={setSkinCounts}
              layout="two-row"
            />
            {skinCounts !== null && (
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 400, color: MUTED }}>
                {skinCounts.ownedCount} skiniä jaettu · {skinCounts.emptyCount} jakamatta
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 24 }}>18 skiniä jaossa</div>
          <div style={{ marginTop: 8, color: MUTED, fontSize: 14 }}>
            🍭 Ensimmäinen kierros ratkaisee alustavat mestariudet
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '8px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
        <span className="font-sans" style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 400 }}>
          liekkipoika.com · Liekkipoika Kesäkisa 2026
        </span>
      </div>
    </div>
  )
}
