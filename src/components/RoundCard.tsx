import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { LeaderboardEntry, Player, RoundWithDetails, Course, HoleResult } from '../lib/database.types'
import PointsBar, { type SegmentData } from './shared/PointsBar'

const DOT_SLUGS = ['kajaani', 'nuas', 'tenetti', 'paltamo'] as const

const COURSE_HERO: Record<string, string> = {
  kajaani: '/course-hero-kag.jpg',
  nuas:    '/course-hero-nuas.jpg',
  tenetti: '/course-hero-tenetti.jpg',
  paltamo: '/course-hero-paltamo.jpg',
}

const COURSE_GENITIVE: Record<string, string> = {
  kajaani: 'KAJAANIA',
  nuas: 'NUASTA',
  tenetti: 'TENETTIA',
  paltamo: 'PALTAMOA',
}

const DEADLINE = new Date('2026-08-31T23:59:59')

interface Props {
  round: RoundWithDetails
  seasonCourses?: Course[]
  showCaption?: boolean
  allRounds?: RoundWithDetails[]
  holeResults?: HoleResult[]
  activePlayerCount?: number
}

function computeLeaderboardFromRounds(rounds: RoundWithDetails[]): LeaderboardEntry[] {
  const map = new Map<string, LeaderboardEntry>()
  for (const r of rounds) {
    const player = r.player as Player | undefined
    if (!player) continue
    const existing = map.get(r.player_id)
    if (existing) {
      existing.total_points += r.total_points
      existing.rounds_played += 1
      existing.courses_played.push(r.course_id)
      existing.points_by_course[r.course_id] = (existing.points_by_course[r.course_id] ?? 0) + r.total_points
    } else {
      map.set(r.player_id, {
        player,
        total_points: r.total_points,
        rounds_played: 1,
        rank: 0,
        courses_played: [r.course_id],
        points_by_course: { [r.course_id]: r.total_points },
      })
    }
  }
  const sorted = [...map.values()].sort((a, b) => b.total_points - a.total_points)
  sorted.forEach((e, i) => { e.rank = i + 1 })
  return sorted
}

function buildList<T>(all: T[], isCurrent: (e: T) => boolean, limit = 5): (T | 'gap')[] {
  if (all.length === 0) return []
  const top = all.slice(0, limit)
  const currentEntry = all.find(isCurrent)
  if (!currentEntry) return top
  if (top.some(isCurrent)) return top
  return [...all.slice(0, limit - 1), 'gap', currentEntry]
}

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-')
  return `${parseInt(d)}.${parseInt(m)}.${y}`
}


function GapRow({ bg }: { bg: string }) {
  return (
    <div className="relative flex items-center justify-center h-5 my-0.5">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} />
      <span className="relative px-2 text-[9px] tracking-widest text-gray-700" style={{ background: bg }}>
        ···
      </span>
    </div>
  )
}


const BG = '#1a1a18'

export default function RoundCard({
  round, seasonCourses = [], showCaption = true,
  allRounds, holeResults, activePlayerCount,
}: Props) {
  const [copied, setCopied] = useState(false)

  const color = round.course?.color_hex ?? '#2D6A4F'
  const date = fmtDate(round.played_date)

  // ── Historical snapshot: only rounds played on or before this round's date ──
  const snapshot = (allRounds ?? []).filter(r => r.played_date <= round.played_date)
  const leaderboard = computeLeaderboardFromRounds(snapshot)

  // ── Player leaderboard entry ──
  const playerEntry = leaderboard.find(e => e.player.id === round.player_id)
  const isLeading = leaderboard.length > 0 && leaderboard[0].player.id === round.player_id
  const playersWithRounds = leaderboard.filter(e => e.rounds_played > 0)
  const rank = playerEntry?.rank

  // ── Marquee ──
  let marquee: string | null = null
  if (isLeading) {
    marquee = '🎩 JOHTAA SARJAA'
  } else if (snapshot.length > 0) {
    const courseRounds = snapshot.filter(r => r.course_id === round.course_id)
    if (courseRounds.length > 0) {
      const best = courseRounds.reduce((b, r) => r.total_points > b.total_points ? r : b, courseRounds[0])
      if (best.player_id === round.player_id) {
        const slug = round.course?.slug ?? ''
        marquee = `🎩 JOHTAA ${COURSE_GENITIVE[slug] ?? round.course?.name?.toUpperCase() ?? ''}`
      }
    }
  }

  // ── Gap stat ──
  const gapStat = playersWithRounds.length <= 1 ? null
    : isLeading
      ? { label: 'JOHTOERO', value: `+${leaderboard[0].total_points - (leaderboard[1]?.total_points ?? 0)}p`, positive: true }
      : { label: 'EROA KÄRKEEN', value: `-${(leaderboard[0]?.total_points ?? 0) - (playerEntry?.total_points ?? 0)}p`, positive: false }

  // ── Best hole ──
  const bestHole = holeResults && holeResults.length > 0
    ? holeResults.reduce((b, h) =>
        h.points > b.points || (h.points === b.points && h.hole_number < b.hole_number) ? h : b
      , holeResults[0])
    : null
  const strokesVsPar = bestHole && bestHole.strokes_played != null
    ? bestHole.strokes_played - bestHole.par
    : null
  const holeResultName = strokesVsPar == null || bestHole?.strokes_played == null ? null
    : bestHole.strokes_played === 1 ? 'Hole-in-one'
    : strokesVsPar <= -3 ? 'Albatross'
    : strokesVsPar === -2 ? 'Eagle'
    : strokesVsPar === -1 ? 'Birdie'
    : strokesVsPar === 0  ? 'Par'
    : strokesVsPar === 1  ? 'Bogey'
    : strokesVsPar === 2  ? 'Double bogey'
    : 'Triple bogey'
  const holeEmoji = strokesVsPar == null ? ''
    : strokesVsPar <= -2 ? '🦅'
    : strokesVsPar === -1 ? '🐦'
    : ''

  // ── Courses remaining ──
  const slugToCourse = new Map(seasonCourses.map(c => [c.slug, c]))
  const dotCourses = DOT_SLUGS.map(slug => slugToCourse.get(slug) ?? null)
  const hasDotData = dotCourses.some(Boolean)
  const playedIds = new Set(playerEntry?.courses_played ?? [])
  const remainingCount = hasDotData
    ? dotCourses.filter(c => c && !playedIds.has(c.id)).length
    : null

  // ── Days remaining ──
  const daysLeft = Math.ceil((DEADLINE.getTime() - Date.now()) / 86400000)
  const showDaysLeft = daysLeft > 0
  const daysColor = daysLeft < 7 ? '#C12820' : daysLeft < 14 ? '#E05218' : 'rgba(255,255,255,0.25)'

  // ── Section 2: overall standings ──
  const overallRows = buildList(leaderboard, e => e.player.id === round.player_id)
  const maxOverall = leaderboard[0]?.total_points || 1

  // ── Stats ──
  const stblNet = 36 - round.total_points
  const stblDisplay = stblNet === 0 ? 'E' : stblNet > 0 ? `+${stblNet}` : `${stblNet}`
  const stblColor = stblNet < 0 ? '#E8453C' : '#ffffff'

  const sijoitusValue = rank != null
    ? (activePlayerCount ? `${rank}/${activePlayerCount}` : `${rank}.`)
    : '–'
  const stats = [
    { label: 'SIJOITUS', value: sijoitusValue },
    { label: 'LYÖNNIT',  value: round.total_strokes ?? '–' },
    { label: 'HCP',      value: round.hcp_at_time ?? '–' },
    { label: 'PISTETTÄ', value: round.total_points },
  ]

  return (
    <div>
      {/* ── PART 1: Visual card ── */}
      <div
        className="overflow-hidden w-full font-display"
        style={{ background: BG, border: `2px solid ${color}`, borderRadius: 12 }}
      >
        {/* Header band — 12px top/bottom */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: color }}>
          <div className="leading-none">
            <Link
              to={`/player/${round.player?.slug}`}
              className="text-white font-extrabold text-[22px] uppercase"
              style={{ letterSpacing: '0.04em' }}
            >
              {round.player?.full_name}
            </Link>
            <div className="text-white/70 text-[13px] mt-0.5 font-sans">Liekkipoika Kesäkisa 2026</div>
          </div>
          <div className="text-right leading-none shrink-0 ml-3">
            <div className="text-white/70 text-[14px] font-sans font-medium">{date}</div>
            {remainingCount !== null && (
              <div className="text-white/50 text-[12px] mt-0.5 font-sans">
                {remainingCount === 0
                  ? 'Kaikki kentät pelattu ✅'
                  : `${remainingCount} kenttä${remainingCount !== 1 ? 'ä' : ''} jäljellä`}
              </div>
            )}
          </div>
        </div>

        {/* Course photo hero */}
        <div style={{
          position: 'relative',
          minHeight: 220,
          backgroundImage: COURSE_HERO[round.course?.slug ?? ''] ? `url(${COURSE_HERO[round.course?.slug ?? '']})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: BG,
        }}>
          {/* 3-stop gradient overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.80) 100%)',
          }} />

          {/* Course name — top-left */}
          <div className="font-display uppercase" style={{
            position: 'absolute', top: 16, left: 16,
            color: 'white', fontWeight: 900, fontSize: 32,
            letterSpacing: '0.06em', lineHeight: 1,
            textShadow: '0 2px 12px rgba(0,0,0,0.8)',
          }}>
            {round.course?.name}
          </div>

          {/* Date — top-right */}
          <div className="font-display" style={{
            position: 'absolute', top: 16, right: 16,
            color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 500, lineHeight: 1,
            textShadow: '0 1px 6px rgba(0,0,0,0.8)',
          }}>
            {date}
          </div>

          {/* Hero STBL — bottom-center */}
          <div className="font-display" style={{
            position: 'absolute', bottom: gapStat ? 48 : 16,
            left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center', whiteSpace: 'nowrap',
          }}>
            <div className="font-black tabular-nums" style={{
              color: stblColor, fontSize: 88, letterSpacing: '-0.02em', lineHeight: 1,
              textShadow: '0 2px 16px rgba(0,0,0,0.6)',
            }}>
              {stblDisplay}
            </div>
          </div>

          {/* Gap stat — bottom-center */}
          {gapStat && (
            <div className="font-display" style={{
              position: 'absolute', bottom: 16,
              left: '50%', transform: 'translateX(-50%)',
              textAlign: 'center', whiteSpace: 'nowrap',
            }}>
              <span style={{ fontSize: 13, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
                {gapStat.label}{' '}
              </span>
              <span style={{ fontSize: 28, fontWeight: 800, color: gapStat.positive ? color : '#E05218', textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
                {gapStat.value}
              </span>
            </div>
          )}
        </div>

        {/* Marquee banner */}
        {marquee && (
          <div className="flex items-center justify-center" style={{ background: color, height: 36 }}>
            <span className="text-white font-extrabold text-[22px]" style={{ letterSpacing: '0.08em' }}>{marquee}</span>
          </div>
        )}

        {/* Stats row — 12px top/bottom */}
        <div
          className="px-6 py-3"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="grid grid-cols-4">
            {stats.map(s => (
              <div key={s.label} className="text-center">
                <div className="text-gray-600 text-[11px] uppercase font-semibold" style={{ letterSpacing: '0.1em' }}>{s.label}</div>
                <div className="text-white font-bold mt-1" style={{ fontSize: 28 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Best hole callout — 8px top/bottom */}
        {bestHole && (
          <div className="px-6 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="text-gray-600 text-[11px] uppercase font-semibold" style={{ letterSpacing: '0.1em' }}>Kierroksen paras </span>
            <span className="text-gray-400 text-[16px] font-bold">
              Reikä {bestHole.hole_number} — {holeResultName ?? '?'}, {bestHole.points}p{holeEmoji ? ` ${holeEmoji}` : ''}
            </span>
          </div>
        )}

        {/* Section 2: Overall standings */}
        {overallRows.length > 0 && (
          <div className="px-6 pb-2 pt-3">
            <div className="text-gray-600 text-[11px] uppercase font-semibold mb-2" style={{ letterSpacing: '0.12em' }}>Sarjataulukko</div>
            {overallRows.map((e, _i) =>
              e === 'gap' ? <GapRow key="gap-o" bg={BG} /> : (
                <div key={e.player.id} className="flex items-center gap-2 py-1.5">
                  <span className="w-4 text-right text-[15px] font-semibold shrink-0"
                        style={{ color: e.player.id === round.player_id ? color : '#6b7280' }}>
                    {e.rank}
                  </span>
                  <span className="flex-1 text-[17px] truncate min-w-0"
                        style={{
                          color: e.player.id === round.player_id ? color : '#9ca3af',
                          fontWeight: 600,
                        }}>
                    {e.player.full_name}
                  </span>
                  <PointsBar
                    segments={dotCourses.flatMap((c): SegmentData[] => {
                      if (!c) return []
                      const pts = e.points_by_course[c.id] ?? 0
                      return pts > 0 ? [{ courseSlug: c.slug, points: pts, color: c.color_hex ?? undefined }] : []
                    })}
                    maxPoints={maxOverall}
                    className="w-16"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    {dotCourses.map((c, di) => {
                      const played = c ? e.courses_played.includes(c.id) : false
                      return (
                        <div
                          key={di}
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: played ? (c?.color_hex ?? '#555') : 'transparent',
                            border: played ? 'none' : '1px solid rgba(255,255,255,0.15)',
                          }}
                        />
                      )
                    })}
                  </div>
                  <span className="w-10 text-right text-[17px] font-bold shrink-0"
                        style={{ color: e.player.id === round.player_id ? color : '#6b7280' }}>
                    {e.total_points}p
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {/* Footer — 8px top/bottom */}
        <div
          className="px-6 py-2 flex items-center justify-center gap-2 flex-wrap"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span className="text-[12px] font-sans" style={{ color: 'rgba(255,255,255,0.2)' }}>
            liekkipoika.com · Liekkipoika Kesäkisa 2026
          </span>
          {showDaysLeft && (
            <span className="text-[12px] font-sans" style={{ color: daysColor }}>
              · {daysLeft}pv jäljellä
            </span>
          )}
        </div>
      </div>

      {/* ── Kuvateksti ── */}
      {round.summary_text && (
        <div className="mt-2 relative" style={{ borderLeft: `2px solid ${color}66`, paddingLeft: 12 }}>
          <p className="text-sm text-gray-400 italic leading-relaxed pr-5 font-sans">
            {round.summary_text}
          </p>
          {showCaption && (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(round.summary_text!)
                setCopied(true)
                setTimeout(() => setCopied(false), 800)
              }}
              aria-label="Kopioi kuvateksti"
              style={{
                position: 'absolute', bottom: 0, right: 0,
                opacity: copied ? 1 : 0.3,
                transition: 'opacity 200ms',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
