import { useState } from 'react'
import type { LeaderboardEntry, RoundWithDetails, Course } from '../lib/database.types'

// Fixed dot order for course progress dots in overall standings
const DOT_SLUGS = ['kajaani', 'nuas', 'tenetti', 'paltamo']

interface Props {
  round: RoundWithDetails
  rank?: number
  leaderboard: LeaderboardEntry[]
  seasonCourses?: Course[]
  showCaption?: boolean
  allRounds?: RoundWithDetails[]  // enables course-specific leaderboard (Section 1)
}

interface CourseStanding {
  player_id: string
  player_name: string
  points: number
  rank: number
}

// Compute per-course standings from a flat list of rounds
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

// Build a display list of up to `limit` rows, always including the current player.
// If outside top `limit`, inserts a 'gap' sentinel after the top (limit-1) rows.
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
  if (n === 0) return 'E'
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

function caption(
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
  round, rank, leaderboard, seasonCourses = [], showCaption = true, allRounds,
}: Props) {
  const [copied, setCopied] = useState(false)

  const color = round.course?.color_hex ?? '#2D6A4F'
  const date = fmtDate(round.played_date)
  const captionText = caption(round, rank, leaderboard, seasonCourses)

  // ── Section 1: course standings ──
  const courseStandings = allRounds ? computeCourseStandings(allRounds, round.course_id) : []
  const courseRows = buildList(courseStandings, e => e.player_id === round.player_id)
  const maxCourse = courseStandings[0]?.points || 1

  // ── Section 2: overall standings ──
  const overallRows = buildList(leaderboard, e => e.player.id === round.player_id)
  const maxOverall = leaderboard[0]?.total_points || 1

  // Map slug → Course for dot rendering
  const slugToCourse = new Map(seasonCourses.map(c => [c.slug, c]))
  const dotCourses = DOT_SLUGS.map(slug => slugToCourse.get(slug) ?? null)

  const stblDiff = 36 - round.total_points
  const stats = [
    { label: 'SIJOITUS', value: rank != null ? `${rank}.` : '–' },
    { label: 'LYÖNNIT',  value: round.total_strokes ?? '–' },
    { label: 'HCP',      value: round.hcp_at_time ?? '–' },
    { label: 'STBL',     value: fmtToPar(stblDiff) },
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

        {/* Player + Date */}
        <div className="flex items-center justify-between px-6 py-5">
          <div className="font-black uppercase text-white truncate mr-4" style={{ fontSize: 22, letterSpacing: '0.12em' }}>
            {round.player?.full_name}
          </div>
          <div className="text-gray-500 text-sm shrink-0">{date}</div>
        </div>

        {/* Hero points */}
        <div className="text-center pt-1 pb-5">
          <div className="font-black leading-none tabular-nums" style={{ color, fontSize: 88 }}>
            {round.total_points}
          </div>
          <div className="text-gray-600 text-xs uppercase tracking-widest mt-2">pistettä</div>
        </div>

        {/* Stats row */}
        <div className="px-6 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="grid grid-cols-4">
            {stats.map(s => (
              <div key={s.label} className="text-center">
                <div className="text-gray-600 text-[10px] uppercase tracking-widest">{s.label}</div>
                <div className="text-white font-bold text-lg mt-1">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 1: Course leaderboard ── */}
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
                    <div className="h-full rounded-full" style={{ width: `${(e.points / maxCourse) * 100}%`, background: color }} />
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

        {/* ── SECTION 2: Overall standings ── */}
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
                    <div className="h-full rounded-full" style={{ width: `${(e.total_points / maxOverall) * 100}%`, background: color }} />
                  </div>
                  {/* Course dots */}
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
        <div className="px-6 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-gray-600 text-[11px] text-center tracking-widest">
            gc.fi · Liekkipoika Kesäkisa 2026
          </div>
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
