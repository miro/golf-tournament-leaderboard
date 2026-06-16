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

function fmtToPar(n: number | null): string {
  if (n === null) return '–'
  if (n === 0) return '0'
  return n > 0 ? `+${n}` : `${n}`
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

function buildCaption(
  round: RoundWithDetails,
  rank: number | undefined,
  leaderboard: LeaderboardEntry[],
  seasonCourses: Course[],
): string {
  const entry = leaderboard.find(e => e.player.id === round.player_id)
  const leader = leaderboard[0]
  const name = round.player?.full_name ?? ''
  const course = round.course?.name ?? ''

  const emoji = round.is_backfill ? '📅'
    : round.total_points >= 35 ? '🔥'
    : round.total_points >= 28 ? '⛳' : '📊'
  const line1 = `${emoji} ${name} pelasi ${course}n — ${round.total_points} pistettä!`

  const total = entry?.total_points ?? round.total_points
  let line2 = ''
  if (rank === 1) {
    line2 = `Sarjan kärkeen ${total}p — muiden vuoro. 👀`
  } else if (rank && leader) {
    const gap = leader.total_points - total
    line2 = `Sijalla ${rank}. Eroa kärkeen ${gap}p.`
  }

  const played = entry?.courses_played.length ?? 1
  const total4 = seasonCourses.length || 4
  const playedIds = new Set(entry?.courses_played ?? [])
  const remaining = seasonCourses.filter(c => !playedIds.has(c.id))
  let line3 = `${played}/${total4} kenttää pelattu — `
  if (played >= total4) {
    line3 += 'kaikki kentät pelattu! 🏁'
  } else if (remaining.length > 0) {
    line3 += `${remaining.map(c => c.name).join(', ')} vielä pelaamatta.`
  } else {
    line3 += `${total4 - played} kenttää jäljellä.`
  }

  return [line1, line2, line3, 'Sarjataulukko → gc.fi'].filter(Boolean).join('\n')
}

const BG = '#1a1a18'

export default function RoundCard({
  round, rank, leaderboard, seasonCourses = [], showCaption = true,
  allRounds, holeResults, activePlayerCount,
}: Props) {
  const [copied, setCopied] = useState(false)

  const color = round.course?.color_hex ?? '#2D6A4F'
  const date = fmtDate(round.played_date)
  const captionText = buildCaption(round, rank, leaderboard, seasonCourses)

  // ── Player leaderboard entry ──
  const playerEntry = leaderboard.find(e => e.player.id === round.player_id)
  const isLeading = leaderboard.length > 0 && leaderboard[0].player.id === round.player_id
  const playersWithRounds = leaderboard.filter(e => e.rounds_played > 0)

  // ── Marquee ──
  let marquee: string | null = null
  if (isLeading) {
    marquee = '👑 JOHTAA SARJAA'
  } else if (allRounds) {
    const courseRounds = allRounds.filter(r => r.course_id === round.course_id)
    if (courseRounds.length > 0) {
      const best = courseRounds.reduce((b, r) => r.total_points > b.total_points ? r : b, courseRounds[0])
      if (best.player_id === round.player_id) {
        const slug = round.course?.slug ?? ''
        marquee = `🏅 JOHTAA ${COURSE_GENITIVE[slug] ?? round.course?.name?.toUpperCase() ?? ''}`
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
        {/* Header band */}
        <div className="flex items-center justify-between px-5" style={{ background: color, height: 64 }}>
          <div className="leading-none">
            <div className="text-white font-black text-xl tracking-tight">GC</div>
            <div className="text-white/70 text-[11px] mt-0.5 tracking-wide">Liekkipoika Kesäkisa 2026</div>
          </div>
          <div className="text-right leading-none">
            {round.is_backfill && (
              <div className="text-white/60 text-[10px] mb-1 tracking-wide">📅 Aiemmin pelattu</div>
            )}
            <div className="text-white font-black text-xl uppercase tracking-widest">
              {round.course?.name}
            </div>
          </div>
        </div>

        {/* Player + Date + Courses remaining */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="font-black uppercase text-white truncate mr-4" style={{ fontSize: 22, letterSpacing: '0.12em' }}>
              {round.player?.full_name}
            </div>
            <div className="text-gray-500 text-sm shrink-0 mt-0.5">{date}</div>
          </div>
          {remainingCount !== null && (
            <div className="text-[11px] text-gray-600 mt-1.5">
              {remainingCount === 0
                ? 'Kaikki kentät pelattu ✅'
                : `${remainingCount} kenttä${remainingCount !== 1 ? 'ä' : ''} jäljellä`}
            </div>
          )}
        </div>

        {/* Hero +/- par */}
        <div className="text-center pt-1 pb-5">
          <div className="font-black leading-none tabular-nums" style={{ color, fontSize: 88 }}>
            {fmtToPar(round.to_par)}
          </div>
          <div className="text-gray-600 text-xs uppercase tracking-widest mt-2">+/- par</div>
        </div>

        {/* Marquee banner */}
        {marquee && (
          <div className="flex items-center justify-center" style={{ background: color, height: 36 }}>
            <span className="text-white font-black text-sm tracking-widest">{marquee}</span>
          </div>
        )}

        {/* Stats row */}
        <div
          className="px-6 py-4"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderBottom: gapStat ? 'none' : '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="grid grid-cols-4">
            {stats.map(s => (
              <div key={s.label} className="text-center">
                <div className="text-gray-600 text-[9px] uppercase tracking-widest">{s.label}</div>
                <div className="text-white font-bold text-lg mt-1">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Gap stat */}
        {gapStat && (
          <div
            className="px-6 pt-1 pb-4 text-center"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="text-[10px] uppercase tracking-widest text-gray-600">{gapStat.label} </span>
            <span className="text-sm font-bold" style={{ color: gapStat.positive ? color : '#E05218' }}>
              {gapStat.value}
            </span>
          </div>
        )}

        {/* Best hole callout */}
        {bestHole && (
          <div className="px-6 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="text-gray-600 text-[10px] uppercase tracking-widest">Kierroksen paras </span>
            <span className="text-gray-400 text-[11px] font-medium">
              Reikä {bestHole.hole_number} — {bestHole.strokes_played ?? '?'} lyöntiä, {bestHole.points}p{holeEmoji ? ` ${holeEmoji}` : ''}
            </span>
          </div>
        )}

        {/* Section 1: Course leaderboard */}
        {courseRows.length > 0 && (
          <div className="px-6 pt-4 pb-2">
            <div className="text-gray-600 text-[10px] uppercase tracking-widest mb-2">
              {round.course?.name} Tulokset
            </div>
            {courseRows.map((e, _i) =>
              e === 'gap' ? <GapRow key="gap-c" bg={BG} /> : (
                <div key={e.player_id} className="flex items-center gap-2 mb-1.5">
                  <span className="w-4 text-right text-[11px] font-bold shrink-0"
                        style={{ color: e.player_id === round.player_id ? color : '#6b7280' }}>
                    {e.rank}
                  </span>
                  <span className="flex-1 text-[11px] truncate min-w-0"
                        style={{
                          color: e.player_id === round.player_id ? color : '#9ca3af',
                          fontWeight: e.player_id === round.player_id ? 700 : 400,
                        }}>
                    {e.player_name}
                  </span>
                  <div className="w-20 h-1.5 rounded-full overflow-hidden shrink-0"
                       style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full"
                         style={{ width: `${(e.points / maxCourse) * 100}%`, background: color }} />
                  </div>
                  <span className="w-10 text-right text-[11px] font-bold shrink-0"
                        style={{ color: e.player_id === round.player_id ? color : '#6b7280' }}>
                    {e.points}p
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {/* Divider between sections */}
        {courseRows.length > 0 && overallRows.length > 0 && (
          <div className="mx-6 my-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />
        )}

        {/* Section 2: Overall standings */}
        {overallRows.length > 0 && (
          <div className="px-6 pt-2 pb-3">
            <div className="text-gray-600 text-[10px] uppercase tracking-widest mb-2">Sarjataulukko</div>
            {overallRows.map((e, _i) =>
              e === 'gap' ? <GapRow key="gap-o" bg={BG} /> : (
                <div key={e.player.id} className="flex items-center gap-2 mb-1.5">
                  <span className="w-4 text-right text-[11px] font-bold shrink-0"
                        style={{ color: e.player.id === round.player_id ? color : '#6b7280' }}>
                    {e.rank}
                  </span>
                  <span className="flex-1 text-[11px] truncate min-w-0"
                        style={{
                          color: e.player.id === round.player_id ? color : '#9ca3af',
                          fontWeight: e.player.id === round.player_id ? 700 : 400,
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
                  <span className="w-10 text-right text-[11px] font-bold shrink-0"
                        style={{ color: e.player.id === round.player_id ? color : '#6b7280' }}>
                    {e.total_points}p
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {/* Footer */}
        <div
          className="px-6 py-3 flex items-center justify-center gap-2 flex-wrap"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span className="text-[11px] tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>
            gc.fi · Liekkipoika Kesäkisa 2026
          </span>
          {showDaysLeft && (
            <span className="text-[11px] font-medium" style={{ color: daysColor }}>
              · {daysLeft}p jäljellä
            </span>
          )}
        </div>
      </div>

      {/* ── PART 2: Caption ── */}
      {showCaption && (
        <div className="mt-4 px-1">
          <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">{captionText}</p>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(captionText)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="mt-2 text-xs text-gray-600 hover:text-gray-300 transition-colors"
          >
            {copied ? 'Kopioitu ✓' : 'Kopioi kuvateksti'}
          </button>
        </div>
      )}
    </div>
  )
}
