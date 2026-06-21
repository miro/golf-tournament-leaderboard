import { useState } from 'react'
import type { LeaderboardEntry, RoundWithDetails, Course, HoleResult } from '../lib/database.types'

const DOT_SLUGS = ['kajaani', 'nuas', 'tenetti', 'paltamo'] as const

const COURSE_GENITIVE: Record<string, string> = {
  kajaani: 'KAJAANIA',
  nuas: 'NUASTA',
  tenetti: 'TENETTIA',
  paltamo: 'PALTAMOA',
}

const DEADLINE = new Date('2026-08-31T23:59:59')

interface Props {
  round: RoundWithDetails
  rank?: number
  leaderboard: LeaderboardEntry[]
  seasonCourses?: Course[]
  showCaption?: boolean
  allRounds?: RoundWithDetails[]
  holeResults?: HoleResult[]
  activePlayerCount?: number
}

interface CourseStanding {
  player_id: string
  player_name: string
  points: number
  rank: number
}

function computeCourseStandings(rounds: RoundWithDetails[], courseId: string): CourseStanding[] {
  const map = new Map<string, CourseStanding>()
  for (const r of rounds) {
    if (r.course_id !== courseId) continue
    const existing = map.get(r.player_id)
    if (existing) {
      existing.points += r.total_points
    } else {
      map.set(r.player_id, {
        player_id: r.player_id,
        player_name: r.player?.full_name ?? '',
        points: r.total_points,
        rank: 0,
      })
    }
  }
  const sorted = [...map.values()].sort((a, b) => b.points - a.points)
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
  round, rank, leaderboard, seasonCourses = [], showCaption = true,
  allRounds, holeResults, activePlayerCount,
}: Props) {
  const [copied, setCopied] = useState(false)

  const color = round.course?.color_hex ?? '#2D6A4F'
  const date = fmtDate(round.played_date)

  // ── Player leaderboard entry ──
  const playerEntry = leaderboard.find(e => e.player.id === round.player_id)
  const isLeading = leaderboard.length > 0 && leaderboard[0].player.id === round.player_id
  const playersWithRounds = leaderboard.filter(e => e.rounds_played > 0)

  // ── Marquee ──
  let marquee: string | null = null
  if (isLeading) {
    marquee = '🎩 JOHTAA SARJAA'
  } else if (allRounds) {
    const courseRounds = allRounds.filter(r => r.course_id === round.course_id)
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
  const holeEmoji = !bestHole ? '' : bestHole.points >= 4 ? '🦅' : bestHole.points === 3 ? '🐦' : ''

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

  // ── Section 1: course standings ──
  const courseStandings = allRounds ? computeCourseStandings(allRounds, round.course_id) : []
  const courseRows = buildList(courseStandings, e => e.player_id === round.player_id)
  const maxCourse = courseStandings[0]?.points || 1

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
        className="overflow-hidden w-full"
        style={{ background: BG, border: `2px solid ${color}`, borderRadius: 12 }}
      >
        {/* Header band — 12px top/bottom */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: color }}>
          <div className="leading-none">
            <div className="text-white font-black text-xl uppercase tracking-widest">
              {round.player?.full_name}
            </div>
            <div className="text-white/70 text-[11px] mt-0.5 tracking-wide">Liekkipoika Kesäkisa 2026</div>
          </div>
          <div className="text-right leading-none shrink-0 ml-3">
            <div className="text-white/70 text-[11px] tracking-wide">{date}</div>
            {remainingCount !== null && (
              <div className="text-white/50 text-[10px] mt-0.5">
                {remainingCount === 0
                  ? 'Kaikki kentät pelattu ✅'
                  : `${remainingCount} kenttä${remainingCount !== 1 ? 'ä' : ''} jäljellä`}
              </div>
            )}
          </div>
        </div>

        {/* Course name — 16px top, 8px bottom */}
        <div className="px-6 pt-4 pb-2">
          <div className="font-black uppercase" style={{ color, fontSize: 34, letterSpacing: '0.06em' }}>
            {round.course?.name}
          </div>
          {round.is_backfill && (
            <div className="text-[11px] text-gray-600 mt-1">📅 Aiemmin pelattu</div>
          )}
        </div>

        {/* Hero STBL — 16px top, 8px bottom */}
        <div className="text-center pt-4 pb-2">
          <div className="font-black leading-none tabular-nums" style={{ color: stblColor, fontSize: 88 }}>
            {stblDisplay}
          </div>
        </div>

        {/* Gap stat — 8px top, 16px bottom */}
        {gapStat && (
          <div className="pt-2 pb-4 text-center">
            <span className="text-[10px] uppercase tracking-widest text-gray-600">{gapStat.label} </span>
            <span className="text-[20px] font-bold" style={{ color: gapStat.positive ? color : '#E05218' }}>
              {gapStat.value}
            </span>
          </div>
        )}

        {/* Marquee banner */}
        {marquee && (
          <div className="flex items-center justify-center" style={{ background: color, height: 36 }}>
            <span className="text-white font-black text-sm tracking-widest">{marquee}</span>
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
                <div className="text-gray-600 text-[9px] uppercase tracking-widest">{s.label}</div>
                <div className="text-white font-semibold mt-1" style={{ fontSize: 22 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Best hole callout — 8px top/bottom */}
        {bestHole && (
          <div className="px-6 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="text-gray-600 text-[10px] uppercase tracking-widest">Kierroksen paras </span>
            <span className="text-gray-400 text-[15px] font-medium">
              Reikä {bestHole.hole_number} — {bestHole.strokes_played ?? '?'} lyöntiä, {bestHole.points}p{holeEmoji ? ` ${holeEmoji}` : ''}
            </span>
          </div>
        )}

        {/* Section 1: Course leaderboard */}
        {courseRows.length > 0 && (
          <div className="px-6 pt-4 pb-0">
            <div className="text-gray-600 text-[10px] uppercase tracking-widest mb-2">
              {round.course?.name} Tulokset
            </div>
            {courseRows.map((e, _i) =>
              e === 'gap' ? <GapRow key="gap-c" bg={BG} /> : (
                <div key={e.player_id} className="flex items-center gap-2 py-1.5">
                  <span className="w-4 text-right text-[15px] font-semibold shrink-0"
                        style={{ color: e.player_id === round.player_id ? color : '#6b7280' }}>
                    {e.rank}
                  </span>
                  <span className="flex-1 text-[15px] truncate min-w-0"
                        style={{
                          color: e.player_id === round.player_id ? color : '#9ca3af',
                          fontWeight: e.player_id === round.player_id ? 700 : 500,
                        }}>
                    {e.player_name}
                  </span>
                  <div className="w-20 h-1.5 rounded-full overflow-hidden shrink-0"
                       style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full"
                         style={{ width: `${(e.points / maxCourse) * 100}%`, background: color }} />
                  </div>
                  <span className="w-10 text-right text-[15px] font-semibold shrink-0"
                        style={{ color: e.player_id === round.player_id ? color : '#6b7280' }}>
                    {e.points}p
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {/* Divider between sections — 12px gap */}
        {courseRows.length > 0 && overallRows.length > 0 && (
          <div className="mx-6 my-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />
        )}

        {/* Section 2: Overall standings */}
        {overallRows.length > 0 && (
          <div className="px-6 pt-0 pb-2">
            <div className="text-gray-600 text-[10px] uppercase tracking-widest mb-2">Sarjataulukko</div>
            {overallRows.map((e, _i) =>
              e === 'gap' ? <GapRow key="gap-o" bg={BG} /> : (
                <div key={e.player.id} className="flex items-center gap-2 py-1.5">
                  <span className="w-4 text-right text-[15px] font-semibold shrink-0"
                        style={{ color: e.player.id === round.player_id ? color : '#6b7280' }}>
                    {e.rank}
                  </span>
                  <span className="flex-1 text-[15px] truncate min-w-0"
                        style={{
                          color: e.player.id === round.player_id ? color : '#9ca3af',
                          fontWeight: e.player.id === round.player_id ? 700 : 500,
                        }}>
                    {e.player.full_name}
                  </span>
                  <div className="w-16 h-1.5 rounded-full overflow-hidden shrink-0"
                       style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full"
                         style={{ width: `${(e.total_points / maxOverall) * 100}%`, background: color }} />
                  </div>
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
                  <span className="w-10 text-right text-[15px] font-semibold shrink-0"
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
          <span className="text-[11px] tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>
            gc.fi · Liekkipoika Kesäkisa 2026
          </span>
          {showDaysLeft && (
            <span className="text-[11px] font-medium" style={{ color: daysColor }}>
              · {daysLeft}pv jäljellä
            </span>
          )}
        </div>
      </div>

      {/* ── Kuvateksti ── */}
      {round.summary_text && (
        <div className="mt-3 px-1">
          <p className="text-sm text-gray-400 italic leading-relaxed">{round.summary_text}</p>
          {showCaption && (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(round.summary_text!)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="mt-2 text-xs text-gray-600 hover:text-gray-300 transition-colors"
            >
              {copied ? 'Kopioitu ✓' : 'Kopioi kuvateksti'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
