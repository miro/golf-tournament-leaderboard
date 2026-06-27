import { useState, useRef } from 'react'
import type { Player, Course, LeaderboardEntry, RoundWithDetails } from '../lib/database.types'
import HoleOwnerGrid from './shared/HoleOwnerGrid'

const DOT_SLUGS = ['kajaani', 'nuas', 'tenetti', 'paltamo'] as const
const BG = '#1a1a18'

const COURSE_HERO: Record<string, string> = {
  kajaani: '/course-hero-kag.jpg',
  nuas:    '/course-hero-nuas.jpg',
  tenetti: '/course-hero-tenetti.jpg',
  paltamo: '/course-hero-paltamo.jpg',
}

const COURSE_LOCATIVE: Record<string, string> = {
  kajaani: 'Kajaanille',
  nuas: 'Nuasille',
  tenetti: 'Tenetille',
  paltamo: 'Paltamolle',
}

interface Props {
  course: Course
  seasonId: string
  selectedPlayers: Player[]
  date: string
  leaderboard: LeaderboardEntry[]
  seasonCourses: Course[]
  courseRounds: RoundWithDetails[]
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

function buildGroupList(all: LeaderboardEntry[], groupIds: Set<string>, limit = 5): (LeaderboardEntry | 'gap')[] {
  if (all.length === 0) return []
  const top = all.slice(0, limit)
  const outside = all.slice(limit).filter(e => groupIds.has(e.player.id))
  if (outside.length === 0) return top
  return [...top, 'gap' as const, ...outside]
}

function generateCaption(
  selectedPlayers: Player[],
  course: Course,
  leaderboard: LeaderboardEntry[],
  courseRounds: RoundWithDetails[],
): string {
  const names = selectedPlayers.map(p => p.full_name)
  const locative = COURSE_LOCATIVE[course.slug] ?? `${course.name}lle`

  let intro: string
  if (names.length === 1) {
    intro = `⛳ ${names[0]} lähtee ${locative}.`
  } else if (names.length === 2) {
    intro = `⛳ ${names[0]} ja ${names[1]} lähtevät ${locative}.`
  } else {
    intro = `⛳ ${names.slice(0, -1).join(', ')} ja ${names[names.length - 1]} lähtevät ${locative}.`
  }

  let standingsContext: string
  if (names.length === 1) {
    const entry = leaderboard.find(e => e.player.id === selectedPlayers[0].id)
    const leader = leaderboard[0]
    if (!entry) {
      standingsContext = 'Ei vielä tuloksia sarjassa.'
    } else if (entry.rank === 1) {
      const gap = entry.total_points - (leaderboard[1]?.total_points ?? 0)
      const rival = leaderboard[1]?.player.full_name
      standingsContext = rival
        ? `Johtaa sarjaa ${entry.total_points}p:llä — ${rival} ${gap}p perässä.`
        : `Johtaa sarjaa ${entry.total_points}p:llä.`
    } else {
      const gap = (leader?.total_points ?? 0) - entry.total_points
      standingsContext = `Sarjassa ${entry.rank}. sijalla ${entry.total_points}p — ${leader?.player.full_name ?? '?'} johtaa ${gap}p:n erolla.`
    }
  } else if (names.length === 2) {
    const leader = leaderboard[0]
    const parts = selectedPlayers.map(p => {
      const e = leaderboard.find(le => le.player.id === p.id)
      if (!e) return `${p.full_name} ei vielä tuloksia`
      if (e.rank === 1) return `${p.full_name} johtaa ${e.total_points}p:llä`
      const gap = (leader?.total_points ?? 0) - e.total_points
      return `${p.full_name} on ${e.rank}. (${e.total_points}p, ${gap}p eroa kärkeen)`
    })
    standingsContext = parts.join(' — ') + '.'
  } else {
    const parts = selectedPlayers.map(p => {
      const e = leaderboard.find(le => le.player.id === p.id)
      if (!e) return `${p.full_name} (ei tuloksia)`
      return `${p.full_name} ${e.rank}. (${e.total_points}p)`
    })
    standingsContext = parts.join(', ') + '.'
  }

  const anyNotPlayed = selectedPlayers.some(p => !courseRounds.find(r => r.player_id === p.id))
  const courseLeader = courseRounds[0]
  let courseContext = ''
  if (anyNotPlayed) {
    courseContext = 'Tikkarit jaossa 🍭'
  } else if (courseLeader) {
    courseContext = `Kenttäjohtaja: ${courseLeader.player?.full_name} ${courseLeader.total_points}p.`
  }

  return [intro, standingsContext, courseContext, 'Seuraa tilannetta: liekkipoika.com'].filter(Boolean).join('\n')
}

export default function StarttipakettCard({ course, seasonId, selectedPlayers, date, leaderboard, seasonCourses, courseRounds }: Props) {
  const [captionCopied, setCaptionCopied] = useState(false)
  const [skinCounts, setSkinCounts] = useState<{ ownedCount: number; emptyCount: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const color = course.color_hex ?? '#2D6A4F'
  const groupIds = new Set(selectedPlayers.map(p => p.id))
  const overallRows = buildGroupList(leaderboard, groupIds)
  const maxPoints = leaderboard[0]?.total_points || 1

  const slugToCourse = new Map(seasonCourses.map(c => [c.slug, c]))
  const dotCourses = DOT_SLUGS.map(slug => slugToCourse.get(slug) ?? null)

  const caption = generateCaption(selectedPlayers, course, leaderboard, courseRounds)

  const coverPhotoUrl = COURSE_HERO[course.slug] ?? course.cover_photo_url

  function renderPlayerNames() {
    if (selectedPlayers.length === 1) {
      return (
        <div style={{ color: 'white', fontWeight: 900, fontSize: 36, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.1 }}>
          {selectedPlayers[0].full_name}
        </div>
      )
    }
    if (selectedPlayers.length === 2) {
      return (
        <div style={{ color: 'white', fontWeight: 900, fontSize: 36, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.15 }}>
          {selectedPlayers[0].full_name}
          {' '}
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 20, fontWeight: 500 }}>vs</span>
          {' '}
          {selectedPlayers[1].full_name}
        </div>
      )
    }
    return (
      <div style={{ color: 'white', fontWeight: 800, fontSize: 28, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.3 }}>
        {selectedPlayers.map(p => p.full_name).join(' · ')}
      </div>
    )
  }

  function renderMitaTarvitaan(player: Player) {
    const entry = leaderboard.find(e => e.player.id === player.id)
    const leader = leaderboard[0]
    const isLeader = !!leader && leader.player.id === player.id
    const hasPlayedCourse = courseRounds.some(r => r.player_id === player.id)
    const playerPoints = entry?.total_points ?? 0

    let content
    if (isLeader) {
      const gap = leader.total_points - (leaderboard[1]?.total_points ?? 0)
      const rival = leaderboard[1]?.player.full_name ?? '?'
      content = (
        <>
          <span style={{ color, fontWeight: 700 }}>{player.full_name}</span>
          <span style={{ fontWeight: 400 }}>{' johtaa sarjaa — '}</span>
          <span style={{ color, fontWeight: 700 }}>{rival}</span>
          <span style={{ fontWeight: 400 }}>{' tarvitsee '}</span>
          <span style={{ fontWeight: 800, fontSize: 18 }}>{gap + 1}p</span>
          <span style={{ fontWeight: 400 }}>{' enemmän ohittaakseen'}</span>
        </>
      )
    } else {
      const gap = (leader?.total_points ?? 0) - playerPoints
      content = (
        <>
          <span style={{ color, fontWeight: 700 }}>{player.full_name}</span>
          <span style={{ fontWeight: 400 }}>{' → kärkeen: '}</span>
          <span style={{ fontWeight: 800, fontSize: 18 }}>{gap + 1}p</span>
          <span style={{ fontWeight: 400 }}>{' enemmän kuin '}</span>
          <span style={{ color, fontWeight: 700 }}>{leader?.player.full_name ?? '?'}</span>
        </>
      )
    }

    return (
      <div key={player.id} style={{ fontSize: 16, color: 'white', lineHeight: 1.6, padding: '2px 0' }}>
        {content}
        {hasPlayedCourse && (
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: 400 }}> (kenttä pelattu)</span>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Card graphic */}
      <div
        ref={cardRef}
        className="font-display overflow-hidden"
        style={{ background: BG, border: `2px solid ${color}`, borderRadius: 12, maxWidth: 480, margin: '0 auto' }}
      >
        {/* Header band */}
        <div style={{ background: color, padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>GC</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 400 }}>Liekkipoika Kesäkisa 2026</div>
          </div>
          <div style={{ color: 'white', fontWeight: 900, fontSize: 28, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right', lineHeight: 1 }}>
            {course.name}
          </div>
        </div>

        {/* Player section — course photo background */}
        <div style={{
          position: 'relative',
          minHeight: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          backgroundImage: `url(${coverPhotoUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)',
          }} />
          <div style={{ position: 'relative', zIndex: 1, padding: '20px 24px' }}>
            {renderPlayerNames()}
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: 400, marginTop: 8 }}>
              {fmtDate(date)}
            </div>
          </div>
        </div>

        {/* Sarjatilanne */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <SectionLabel text="SARJATILANNE" />
          {overallRows.map((e, _i) =>
            e === 'gap' ? <GapRow key="gap" /> : (
              <div key={e.player.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                <span style={{ width: 16, textAlign: 'right', fontSize: 15, fontWeight: 600, flexShrink: 0, color: groupIds.has(e.player.id) ? color : '#6b7280' }}>
                  {e.rank}
                </span>
                <span style={{ flex: 1, fontSize: 17, fontWeight: groupIds.has(e.player.id) ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: groupIds.has(e.player.id) ? color : '#9ca3af' }}>
                  {e.player.full_name}
                </span>
                <div style={{ width: 56, height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.06)', flexShrink: 0, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: color, width: `${(e.total_points / maxPoints) * 100}%` }} />
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {dotCourses.map((c, di) => {
                    const played = c ? e.courses_played.includes(c.id) : false
                    return (
                      <div key={di} style={{ width: 8, height: 8, borderRadius: '50%', background: played ? (c?.color_hex ?? '#555') : 'transparent', border: played ? 'none' : '1px solid rgba(255,255,255,0.15)' }} />
                    )
                  })}
                </div>
                <span style={{ width: 40, textAlign: 'right', fontSize: 17, fontWeight: 700, flexShrink: 0, color: groupIds.has(e.player.id) ? color : '#6b7280' }}>
                  {e.total_points}p
                </span>
              </div>
            )
          )}
        </div>

        {/* Mitä tarvitaan? */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <SectionLabel text="MITÄ TARVITAAN?" />
          {selectedPlayers.map(player => renderMitaTarvitaan(player))}
        </div>

        {/* Skins */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <SectionLabel text={`${course.name.toUpperCase()} SKINS`} />
          <HoleOwnerGrid
            courseId={course.id}
            seasonId={seasonId}
            courseColor={color}
            highlightPlayerIds={selectedPlayers.map(p => p.id)}
            emptyStateText="18 skiniä jakamatta 🍭"
            onDataLoaded={setSkinCounts}
          />
          {skinCounts !== null && (
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>
              {skinCounts.ownedCount} skiniä jaettu · {skinCounts.emptyCount} jakamatta
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
          <span className="font-sans" style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 400 }}>
            liekkipoika.com · Liekkipoika Kesäkisa 2026
          </span>
        </div>
      </div>

      {/* Caption */}
      <div style={{ marginTop: 16, borderLeft: `2px solid ${color}66`, paddingLeft: 12 }}>
        <div className="label mb-2">Kuvateksti</div>
        <p className="font-sans" style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line', margin: 0 }}>
          {caption}
        </p>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(caption)
            setCaptionCopied(true)
            setTimeout(() => setCaptionCopied(false), 800)
          }}
          className="font-sans mt-3 px-3 py-1.5 rounded-md text-xs border border-white/12 bg-white/5 hover:bg-white/10 transition-colors"
          style={{ color: captionCopied ? '#4ade80' : 'white' }}
        >
          {captionCopied ? 'Kopioitu!' : 'Kopioi kuvateksti'}
        </button>
      </div>
    </div>
  )
}
