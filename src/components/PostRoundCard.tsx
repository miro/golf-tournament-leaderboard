import type { Course, LeaderboardEntry, RoundWithDetails } from '../lib/database.types'
import { buildStandingsFromRounds, buildRelevantStandingsList, findBracketTarget } from '../lib/standings'
import PointsBar, { type SegmentData } from './shared/PointsBar'

const DOT_SLUGS = ['kajaani', 'nuas', 'tenetti', 'paltamo'] as const
const BG = '#1a1a18'
const AMBER = '#E8A820'
const GREEN = '#2D6A4F'
const RED = '#E8453C'
const MUTED_RED = 'rgba(232,69,60,0.65)'
const MUTED_WHITE = 'rgba(255,255,255,0.4)'

const COURSE_HERO: Record<string, string> = {
  kajaani: '/course-hero-kag.jpg',
  nuas:    '/course-hero-nuas.jpg',
  tenetti: '/course-hero-tenetti.jpg',
  paltamo: '/course-hero-paltamo.jpg',
}

interface Props {
  selectedRounds: RoundWithDetails[]
  cutoffTimestamp: string | null
  allSeasonRounds: RoundWithDetails[]
  leaderboard: LeaderboardEntry[]
  seasonCourses: Course[]
  date: string
}

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-')
  return `${parseInt(d)}.${parseInt(m)}.${y}`
}

function fmtStbl(delta: number): string {
  if (delta < 0) return `${delta}`
  if (delta === 0) return 'E'
  return `+${delta}`
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ color: '#9A8870', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>
      {text}
    </div>
  )
}

function GapRow() {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 20, margin: '2px 0' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px solid rgba(255,255,255,0.05)' }} />
      <span style={{ position: 'relative', padding: '0 8px', fontSize: 9, letterSpacing: '0.2em', color: '#374151', background: BG }}>···</span>
    </div>
  )
}

type RankChange =
  | { kind: 'new' }
  | { kind: 'up' | 'down' | 'same'; before: number; after: number }

export default function PostRoundCard({ selectedRounds, cutoffTimestamp, allSeasonRounds, leaderboard, seasonCourses, date }: Props) {
  const playerMap = new Map<string, RoundWithDetails['player']>()
  selectedRounds.forEach(r => { if (r.player && !playerMap.has(r.player_id)) playerMap.set(r.player_id, r.player) })
  const selectedPlayers = [...playerMap.values()]
  const selectedPlayerIds = new Set(playerMap.keys())

  const courseMap = new Map<string, Course>()
  selectedRounds.forEach(r => { if (r.course && !courseMap.has(r.course_id)) courseMap.set(r.course_id, r.course) })
  const selectedCourses = [...courseMap.values()]
  const isMulti = selectedCourses.length > 1
  const themeColor = isMulti ? AMBER : (selectedCourses[0]?.color_hex ?? '#2D6A4F')

  const beforeRounds = cutoffTimestamp === null ? [] : allSeasonRounds.filter(r => r.submitted_at < cutoffTimestamp)
  const beforeStandings = buildStandingsFromRounds(beforeRounds)
  const afterStandings = leaderboard
  const maxPoints = afterStandings[0]?.total_points || 1

  const slugToCourse = new Map(seasonCourses.map(c => [c.slug, c]))
  const dotCourses = DOT_SLUGS.map(slug => slugToCourse.get(slug) ?? null)

  function rankChangeFor(playerId: string): RankChange {
    const before = beforeStandings.find(e => e.player.id === playerId)
    const after = afterStandings.find(e => e.player.id === playerId)
    if (!before) return { kind: 'new' }
    const afterRank = after?.rank ?? 0
    if (afterRank < before.rank) return { kind: 'up', before: before.rank, after: afterRank }
    if (afterRank > before.rank) return { kind: 'down', before: before.rank, after: afterRank }
    return { kind: 'same', before: before.rank, after: afterRank }
  }

  function actualPointsFor(playerId: string): number {
    return selectedRounds.filter(r => r.player_id === playerId).reduce((sum, r) => sum + r.total_points, 0)
  }

  const coverPhotoUrl = !isMulti ? (COURSE_HERO[selectedCourses[0]?.slug ?? ''] ?? selectedCourses[0]?.cover_photo_url) : null

  function renderPlayerNames() {
    const names = selectedPlayers.map(p => p.full_name)
    const NAME_STYLE = {
      color: 'white', fontWeight: 900, fontSize: 28, textTransform: 'uppercase' as const,
      letterSpacing: '0.04em', lineHeight: 1.15, textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    }
    if (names.length === 1) return <div style={NAME_STYLE}>{names[0]}</div>
    if (names.length === 2) {
      return (
        <div style={NAME_STYLE}>
          {names[0]} <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: 500 }}>vs</span> {names[1]}
        </div>
      )
    }
    return <div style={{ ...NAME_STYLE, fontWeight: 800 }}>{names.join(' · ')}</div>
  }

  function renderResultRow(r: RoundWithDetails) {
    const stblDelta = 36 - r.total_points
    const stblColor = stblDelta < 0 ? RED : 'white'
    const rc = rankChangeFor(r.player_id)
    return (
      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.player?.full_name}
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{r.total_points}p</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: stblColor, minWidth: 24, textAlign: 'right' }}>{fmtStbl(stblDelta)}</span>
        {rc.kind === 'new' ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: AMBER }}>UUSI</span>
        ) : (
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: rc.kind === 'up' ? GREEN : rc.kind === 'down' ? MUTED_RED : MUTED_WHITE,
          }}>
            {`${rc.kind === 'up' ? '↑' : rc.kind === 'down' ? '↓' : '═'} ${rc.after}. sija`}
          </span>
        )}
      </div>
    )
  }

  const relevantRows = buildRelevantStandingsList(afterStandings, selectedPlayerIds)

  function renderStandingsRow(e: LeaderboardEntry) {
    const isTracked = selectedPlayerIds.has(e.player.id)
    const rowColor = isTracked ? themeColor : 'white'
    const rc = rankChangeFor(e.player.id)
    let deltaNode = null
    if (rc.kind === 'new') {
      deltaNode = <span style={{ fontSize: 11, fontWeight: 700, color: AMBER }}>NEW</span>
    } else if (rc.kind === 'up') {
      deltaNode = <span style={{ fontSize: 12, fontWeight: 600, color: GREEN }}>{`(↑${rc.before - rc.after})`}</span>
    } else if (rc.kind === 'down') {
      deltaNode = <span style={{ fontSize: 12, fontWeight: 600, color: MUTED_RED }}>{`(↓${rc.after - rc.before})`}</span>
    }
    return (
      <div key={e.player.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 6px 8px', borderLeft: isTracked ? `2px solid ${themeColor}` : '2px solid transparent' }}>
        <span style={{ width: 16, textAlign: 'right', fontSize: 15, fontWeight: 600, flexShrink: 0, color: rowColor }}>{e.rank}</span>
        <span style={{ flex: 1, fontSize: 17, fontWeight: isTracked ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: rowColor }}>
          {e.player.full_name}
        </span>
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
        <span style={{ width: 40, textAlign: 'right', fontSize: 17, fontWeight: 700, flexShrink: 0, color: rowColor }}>{e.total_points}p</span>
        <div style={{ width: 44, textAlign: 'right', flexShrink: 0 }}>{deltaNode}</div>
      </div>
    )
  }

  const tavoiteRows = selectedPlayers
    .map(p => {
      const beforeEntry = beforeStandings.find(e => e.player.id === p.id)
      const roundsPlayedBefore = beforeEntry?.rounds_played ?? 0
      const target = findBracketTarget(roundsPlayedBefore, beforeStandings, selectedPlayerIds)
      if (!target) return null
      const beforeTotal = beforeEntry?.total_points ?? 0
      const stblNeeded = 36 - (target.total_points - beforeTotal)
      const actualStbl = 36 - actualPointsFor(p.id)
      const achieved = actualStbl <= stblNeeded
      return { player: p, stblNeeded, actualStbl, achieved, diff: actualStbl - stblNeeded }
    })
    .filter((t): t is NonNullable<typeof t> => !!t)

  return (
    <div className="font-display overflow-hidden" style={{ background: BG, border: `2px solid ${themeColor}`, borderRadius: 12, maxWidth: 480, margin: '0 auto' }}>
      {/* Header band */}
      <div style={{ background: themeColor, height: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px', width: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ color: 'white', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>GC</span>
          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
          <span style={{ color: 'rgba(255,255,255,0.80)', fontSize: 13, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Liekkipoika Kesäkisa 2026
          </span>
        </div>
        <div style={{
          color: 'white', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
          fontSize: isMulti ? 'clamp(14px, 4vw, 22px)' : 18,
        }}>
          {isMulti ? selectedCourses.map(c => c.name).join(' · ') : selectedCourses[0]?.name}
        </div>
      </div>

      {/* Photo hero */}
      <div style={{
        position: 'relative', height: 180,
        background: isMulti ? BG : undefined,
        backgroundImage: !isMulti && coverPhotoUrl ? `url(${coverPhotoUrl})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
        {!isMulti && coverPhotoUrl && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.70) 100%)' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 20px' }}>
          {renderPlayerNames()}
          <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{fmtDate(date)}</div>
        </div>
      </div>

      {/* Kierroksen tulokset */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <SectionLabel text="KIERROKSEN TULOKSET" />
        {isMulti
          ? selectedCourses.map(c => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <div style={{ color: c.color_hex ?? '#2D6A4F', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                {c.name}
              </div>
              {selectedRounds.filter(r => r.course_id === c.id).map(renderResultRow)}
            </div>
          ))
          : selectedRounds.map(renderResultRow)}
      </div>

      {/* Sarjataulukko */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <SectionLabel text="SARJATAULUKKO" />
        {relevantRows.map((e, i) => e === 'gap' ? <GapRow key={`gap-${i}`} /> : renderStandingsRow(e))}
      </div>

      {/* Tavoite */}
      {tavoiteRows.length > 0 && (
        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <SectionLabel text="TAVOITE" />
          {tavoiteRows.map(t => (
            <div key={t.player.id} style={{ fontSize: 14, lineHeight: 1.6, padding: '4px 0' }}>
              <div>
                <span style={{ fontWeight: 700, color: themeColor }}>{t.player.full_name}</span>
                <span style={{ color: 'white' }}>{` tavoitteli ${fmtStbl(t.stblNeeded)} tai parempi`}</span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)' }}>{`Tulos: ${fmtStbl(t.actualStbl)}`}</div>
              {t.achieved ? (
                <div style={{ color: GREEN, fontWeight: 700 }}>✓ Tavoite saavutettu!</div>
              ) : (
                <div style={{ color: MUTED_RED, fontWeight: 700 }}>{`✗ Jäi ${t.diff} päähän`}</div>
              )}
            </div>
          ))}
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
