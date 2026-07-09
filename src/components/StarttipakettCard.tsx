import React, { useRef } from 'react'
import type { Player, Course, LeaderboardEntry } from '../lib/database.types'
import PointsBar, { type SegmentData } from './shared/PointsBar'

const DOT_SLUGS = ['kajaani', 'nuas', 'tenetti', 'paltamo'] as const
const BG = '#1a1a18'

const COURSE_HERO: Record<string, string> = {
  kajaani: '/course-hero-kag.jpg',
  nuas:    '/course-hero-nuas.jpg',
  tenetti: '/course-hero-tenetti.jpg',
  paltamo: '/course-hero-paltamo.jpg',
}

interface Props {
  course: Course
  selectedPlayers: Player[]
  date: string
  leaderboard: LeaderboardEntry[]
  seasonCourses: Course[]
}

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-')
  return `${parseInt(d)}.${parseInt(m)}.${y}`
}

function GapRow() {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 20, margin: '2px 0' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px solid rgba(255,255,255,0.05)' }} />
      <span style={{ position: 'relative', padding: '0 8px', fontSize: 9, letterSpacing: '0.2em', color: '#374151', background: BG }}>···</span>
    </div>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ color: '#9A8870', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>
      {text}
    </div>
  )
}

function computeBracketTarget(
  entry: LeaderboardEntry | undefined,
  leaderboard: LeaderboardEntry[],
  groupIds: Set<string>,
): { comparisonEntry: LeaderboardEntry | null; bracketUsed: number; usedFallback: boolean; coursesAfterToday: number } {
  const coursesAfterToday = (entry?.rounds_played ?? 0) + 1

  const poolForBracket = (bracket: number) =>
    leaderboard.filter(e => e.player.active && !groupIds.has(e.player.id) && e.rounds_played === bracket)

  let pool = poolForBracket(coursesAfterToday)
  let bracketUsed = coursesAfterToday
  let usedFallback = false

  if (pool.length === 0) {
    const lower = poolForBracket(coursesAfterToday - 1)
    if (lower.length > 0) {
      pool = lower
      bracketUsed = coursesAfterToday - 1
      usedFallback = true
    } else {
      const higher = poolForBracket(coursesAfterToday + 1)
      if (higher.length > 0) {
        pool = higher
        bracketUsed = coursesAfterToday + 1
        usedFallback = true
      }
    }
  }

  const comparisonEntry = pool.reduce<LeaderboardEntry | null>(
    (best, e) => (!best || e.total_points > best.total_points ? e : best),
    null,
  )

  return { comparisonEntry, bracketUsed, usedFallback, coursesAfterToday }
}

function buildRelevantList(
  leaderboard: LeaderboardEntry[],
  groupIds: Set<string>,
  chasingTargetIds: Set<string>,
): (LeaderboardEntry | 'gap')[] {
  if (leaderboard.length === 0) return []

  const requiredIds = new Set<string>(groupIds)
  requiredIds.add(leaderboard[0].player.id)
  chasingTargetIds.forEach(id => requiredIds.add(id))

  const relevant = leaderboard
    .filter(e => requiredIds.has(e.player.id))
    .sort((a, b) => a.rank - b.rank)

  const result: (LeaderboardEntry | 'gap')[] = []
  relevant.forEach((e, i) => {
    if (i > 0 && e.rank - relevant[i - 1].rank > 1) result.push('gap')
    result.push(e)
  })
  return result
}

export default function StarttipakettCard({ course, selectedPlayers, date, leaderboard, seasonCourses }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)

  const color = course.color_hex ?? '#2D6A4F'
  const groupIds = new Set(selectedPlayers.map(p => p.id))

  const chasingTargetIds = new Set<string>()
  selectedPlayers.forEach(p => {
    const entry = leaderboard.find(e => e.player.id === p.id)
    const { comparisonEntry } = computeBracketTarget(entry, leaderboard, groupIds)
    if (comparisonEntry) chasingTargetIds.add(comparisonEntry.player.id)
  })

  const overallRows = buildRelevantList(leaderboard, groupIds, chasingTargetIds)
  const maxPoints = leaderboard[0]?.total_points || 1

  const slugToCourse = new Map(seasonCourses.map(c => [c.slug, c]))
  const dotCourses = DOT_SLUGS.map(slug => slugToCourse.get(slug) ?? null)

  const coverPhotoUrl = COURSE_HERO[course.slug] ?? course.cover_photo_url

  const NAME_STYLE: React.CSSProperties = {
    color: 'white',
    fontWeight: 900,
    fontSize: 32,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    lineHeight: 1.15,
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
  }

  function renderPlayerNames() {
    if (selectedPlayers.length === 1) {
      return <div style={NAME_STYLE}>{selectedPlayers[0].full_name}</div>
    }
    if (selectedPlayers.length === 2) {
      return (
        <div style={NAME_STYLE}>
          {selectedPlayers[0].full_name}
          {' '}
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: 500 }}>vs</span>
          {' '}
          {selectedPlayers[1].full_name}
        </div>
      )
    }
    return (
      <div style={{ ...NAME_STYLE, fontWeight: 800 }}>
        {selectedPlayers.map(p => p.full_name).join(' · ')}
      </div>
    )
  }

  function renderMitaTarvitaan(player: Player) {
    const entry = leaderboard.find(e => e.player.id === player.id)
    const playerCurrentTotal = entry?.total_points ?? 0
    const { comparisonEntry, bracketUsed, usedFallback, coursesAfterToday } = computeBracketTarget(entry, leaderboard, groupIds)
    const gap = comparisonEntry ? comparisonEntry.total_points - playerCurrentTotal : 0

    let content
    if (comparisonEntry && gap > 0) {
      const stblDelta = 36 - gap
      const stblText = stblDelta < 0 ? `${stblDelta}` : stblDelta === 0 ? 'E' : `+${stblDelta}`
      const stblColor = stblDelta < 0 ? '#E8453C' : 'white'
      content = (
        <>
          <span style={{ color, fontWeight: 700 }}>{player.full_name}</span>
          <span style={{ fontWeight: 400 }}>{' → '}</span>
          <span style={{ fontWeight: 400 }}>{`${coursesAfterToday}. kierroksen kärkeen: `}</span>
          <span style={{ color: stblColor, fontWeight: 800, fontSize: 18 }}>{stblText}</span>
          <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.7)' }}>{' tai parempi '}</span>
          <span style={{ fontWeight: 400, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
            {`(${comparisonEntry.player.full_name} ${comparisonEntry.total_points}p)`}
          </span>
        </>
      )
    } else {
      content = (
        <>
          <span style={{ color, fontWeight: 700 }}>{player.full_name}</span>
          <span style={{ fontWeight: 400 }}>{' johtaa '}</span>
          <span style={{ fontWeight: 400 }}>{`${coursesAfterToday}. kierroksen sarjaa`}</span>
          {gap < 0 && (
            <span style={{ color: '#2D6A4F', fontWeight: 700 }}>{` — ${Math.abs(gap)}p etumatka`}</span>
          )}
        </>
      )
    }

    return (
      <div key={player.id} style={{ fontSize: 16, color: 'white', lineHeight: 1.6, padding: '2px 0' }}>
        {content}
        {usedFallback && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
            {`(vertailu: ${bracketUsed} kierroksen pelaajiin)`}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={cardRef}
      className="font-display overflow-hidden"
      style={{ background: BG, border: `2px solid ${color}`, borderRadius: 12, maxWidth: 480, margin: '0 auto' }}
    >
      {/* Header band */}
      <div style={{ background: color, padding: '0 20px', height: 40, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'white', fontWeight: 800, fontSize: 16 }}>GC</span>
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
        <span style={{ color: 'rgba(255,255,255,0.80)', fontSize: 13, fontWeight: 400 }}>Liekkipoika Kesäkisa 2026</span>
      </div>

      {/* Photo hero */}
      <div style={{
        position: 'relative',
        height: 200,
        backgroundImage: `url(${coverPhotoUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.70) 100%)',
        }} />
        {/* Top row: course name + date */}
        <div style={{ position: 'absolute', top: 16, left: 20, right: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ color: color, fontWeight: 900, fontSize: 28, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1, fontFamily: 'var(--font-display)' }}>
            {course.name}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.80)', fontSize: 14, fontWeight: 500, lineHeight: 1, paddingTop: 4 }}>
            {fmtDate(date)}
          </div>
        </div>
        {/* Player names — vertically centered */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 20px' }}>
          {renderPlayerNames()}
        </div>
      </div>

      {/* Sarjatilanne */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <SectionLabel text="SARJATILANNE" />
        {overallRows.map((e, i) => {
          if (e === 'gap') return <GapRow key={`gap-${i}`} />
          const isGroup = groupIds.has(e.player.id)
          const isTarget = !isGroup && chasingTargetIds.has(e.player.id)
          const rowColor = isGroup ? color : 'white'
          return (
            <div key={e.player.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 6px 8px', borderLeft: isGroup ? `2px solid ${color}` : '2px solid transparent' }}>
              <span style={{ width: 16, textAlign: 'right', fontSize: 15, fontWeight: 600, flexShrink: 0, color: rowColor }}>
                {e.rank}
              </span>
              <span style={{ flex: 1, fontSize: 17, fontWeight: isGroup ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: rowColor }}>
                {e.player.full_name}
              </span>
              {isTarget && (
                <span className="hidden min-[480px]:inline" style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>← tavoite</span>
              )}
              <PointsBar
                segments={dotCourses.flatMap((c): SegmentData[] => {
                  if (!c) return []
                  const pts = e.points_by_course[c.id] ?? 0
                  return pts > 0 ? [{ courseSlug: c.slug, points: pts, color: c.color_hex ?? undefined }] : []
                })}
                maxPoints={maxPoints}
                className="w-14"
              />
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {dotCourses.map((c, di) => {
                  const played = c ? e.courses_played.includes(c.id) : false
                  return (
                    <div key={di} style={{ width: 8, height: 8, borderRadius: '50%', background: played ? (c?.color_hex ?? '#555') : 'transparent', border: played ? 'none' : '1px solid rgba(255,255,255,0.15)' }} />
                  )
                })}
              </div>
              <span style={{ width: 40, textAlign: 'right', fontSize: 17, fontWeight: 700, flexShrink: 0, color: rowColor }}>
                {e.total_points}p
              </span>
            </div>
          )
        })}
      </div>

      {/* Mitä tarvitaan? */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <SectionLabel text="MITÄ TARVITAAN?" />
        {selectedPlayers.map(player => renderMitaTarvitaan(player))}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
        <span className="font-sans" style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 400 }}>
          liekkipoika.com · Liekkipoika Kesäkisa 2026
        </span>
      </div>
    </div>
  )
}
