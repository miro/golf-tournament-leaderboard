import { useState, useEffect, useRef } from 'react'
import { getCourseRounds, getHoleResultsForRounds } from '../../lib/queries'

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)
const NINE = Array.from({ length: 9 }, (_, i) => i + 1)
const CARD_BG = '#1a1a18'
const RED = '#E8453C'
const BLUE = '#5B9BD5'

interface HoleChampion {
  holeNumber: number
  par: number | null
  bestStrokes: number | null
  playerName: string | null
  playerId: string | null
  isLeader: boolean
}

interface Props {
  courseId: string
  seasonId: string
  courseColor?: string
  highlightPlayerIds?: string[]
  emptyStateText?: string
  onDataLoaded?: (data: { ownedCount: number; emptyCount: number }) => void
  layout?: 'scroll' | 'two-row'
}

function abbrevName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return (parts[parts.length - 1] ?? parts[0]).substring(0, 4).toUpperCase()
}

function holeStrokeStyle(strokes: number, par: number): {
  outer: string | null; inner: string | null; radius: number | string; color: string
} {
  const diff = strokes - par
  if (diff <= -2) return { outer: RED,  inner: RED,  radius: '50%', color: '#ffffff' }
  if (diff === -1) return { outer: RED,  inner: null, radius: '50%', color: '#ffffff' }
  if (diff === 0)  return { outer: null, inner: null, radius: 0,     color: '#ffffff' }
  if (diff === 1)  return { outer: BLUE, inner: null, radius: 2,     color: '#ffffff' }
  if (diff === 2)  return { outer: BLUE, inner: BLUE, radius: 2,     color: '#ffffff' }
  return               { outer: null, inner: null, radius: 0,     color: '#6b7280' }
}

function TwoRowGroup({
  groupChampions,
  courseColor,
  highlightSet,
}: {
  groupChampions: HoleChampion[]
  courseColor: string
  highlightSet: Set<string>
}) {
  return (
    <div>
      {/* Par */}
      <div className="flex items-center gap-[3px]" style={{ height: 36, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width: 56, minWidth: 56, letterSpacing: '0.08em' }} className="text-[11px] uppercase text-gray-600 font-semibold">
          Par
        </div>
        {groupChampions.map(({ holeNumber, par }) => (
          <div key={holeNumber} style={{ flex: 1, minWidth: 0 }} className="flex items-center justify-center text-[13px] font-medium text-gray-500">
            {par ?? '–'}
          </div>
        ))}
      </div>

      {/* Lyönnit */}
      <div className="flex items-center gap-[3px]" style={{ height: 36, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width: 56, minWidth: 56, letterSpacing: '0.08em' }} className="text-[11px] uppercase text-gray-600 font-semibold">
          Lyönnit
        </div>
        {groupChampions.map(({ holeNumber, par, bestStrokes }) => {
          if (bestStrokes === null || par === null) {
            return (
              <div key={holeNumber} style={{ flex: 1, minWidth: 0 }} className="flex items-center justify-center">
                <span className="text-[13px] font-bold" style={{ color: '#374151' }}>—</span>
              </div>
            )
          }
          const s = holeStrokeStyle(bestStrokes, par)
          return (
            <div key={holeNumber} style={{ flex: 1, minWidth: 0 }} className="flex items-center justify-center">
              <div style={{
                width: 26, height: 26,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: s.outer ? `1.5px solid ${s.outer}` : 'none',
                borderRadius: s.radius,
                position: 'relative',
              }}>
                {s.inner && (
                  <div style={{
                    position: 'absolute', inset: 3,
                    border: `1.5px solid ${s.inner}`,
                    borderRadius: s.radius,
                  }} />
                )}
                <span className="text-[13px] font-bold" style={{ color: s.color, position: 'relative' }}>
                  {bestStrokes}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Mestari */}
      <div className="flex items-center gap-[3px]" style={{ height: 36 }}>
        <div style={{ width: 56, minWidth: 56, letterSpacing: '0.08em' }} className="text-[11px] uppercase text-gray-600 font-semibold">
          Mestari
        </div>
        {groupChampions.map(({ holeNumber, playerName, playerId, isLeader }) => {
          const isHighlighted = playerId !== null && highlightSet.has(playerId)
          const nameColor = !playerName
            ? '#374151'
            : isLeader
            ? courseColor
            : isHighlighted
            ? 'rgba(255,255,255,0.8)'
            : 'rgba(255,255,255,0.35)'
          return (
            <div key={holeNumber} style={{ flex: 1, minWidth: 0 }} className="flex items-center justify-center">
              <span
                className="text-[9px]"
                style={{
                  color: nameColor,
                  fontWeight: isLeader || isHighlighted ? 700 : 600,
                  textDecoration: isHighlighted && !isLeader ? 'underline' : 'none',
                  textDecorationColor: 'rgba(255,255,255,0.25)',
                }}
              >
                {playerName ? abbrevName(playerName) : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function HoleOwnerGrid({
  courseId,
  seasonId,
  courseColor = '#2D6A4F',
  highlightPlayerIds = [],
  emptyStateText = 'Ei vielä tuloksia',
  onDataLoaded,
  layout = 'scroll',
}: Props) {
  const [loading, setLoading] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [champions, setChampions] = useState<HoleChampion[]>([])

  // Keep a stable ref so changing onDataLoaded never re-triggers the fetch
  const onDataLoadedRef = useRef(onDataLoaded)
  useEffect(() => { onDataLoadedRef.current = onDataLoaded })

  useEffect(() => {
    if (!courseId || !seasonId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const courseRounds = await getCourseRounds(courseId, seasonId)
      const holeResults = await getHoleResultsForRounds(courseRounds.map(r => r.id))
      if (cancelled) return

      const hrMap: Record<string, typeof holeResults> = {}
      for (const hr of holeResults) {
        hrMap[hr.round_id] = hrMap[hr.round_id] ?? []
        hrMap[hr.round_id].push(hr)
      }

      const roundById = new Map(courseRounds.map(r => [r.id, r]))
      const flatHole = Object.entries(hrMap).flatMap(([rid, hrs]) =>
        hrs.map(hr => ({ hr, round: roundById.get(rid) ?? null }))
      )

      // PB leader for mestari highlight
      const pbMap = new Map<string, number>()
      for (const r of courseRounds) {
        const ex = pbMap.get(r.player_id)
        if (!ex || r.total_points > ex) pbMap.set(r.player_id, r.total_points)
      }
      const pbLeaderId = pbMap.size === 0 ? null
        : [...pbMap.entries()].sort((a, b) => b[1] - a[1])[0][0]

      const computed: HoleChampion[] = HOLES.map(holeNum => {
        const holeData = flatHole.filter(x => x.hr.hole_number === holeNum && x.hr.strokes_played != null)
        if (holeData.length === 0) {
          return { holeNumber: holeNum, par: null, bestStrokes: null, playerName: null, playerId: null, isLeader: false }
        }
        const par = holeData[0].hr.par
        const minStrokes = Math.min(...holeData.map(x => x.hr.strokes_played!))
        const candidates = holeData.filter(x => x.hr.strokes_played === minStrokes)
        candidates.sort((a, b) => {
          const pd = (b.round?.total_points ?? 0) - (a.round?.total_points ?? 0)
          if (pd !== 0) return pd
          const hd = (b.round?.hcp_at_time ?? 0) - (a.round?.hcp_at_time ?? 0)
          if (hd !== 0) return hd
          return (a.round?.submitted_at ?? '') < (b.round?.submitted_at ?? '') ? -1 : 1
        })
        const winner = candidates[0]
        const winnerPlayerId = winner.round?.player_id ?? null
        return {
          holeNumber: holeNum,
          par,
          bestStrokes: minStrokes,
          playerName: winner.round?.player?.full_name ?? null,
          playerId: winnerPlayerId,
          isLeader: winnerPlayerId !== null && winnerPlayerId === pbLeaderId,
        }
      })

      const ownedCount = computed.filter(h => h.playerName !== null).length
      setChampions(computed)
      setHasData(flatHole.length > 0)
      setLoading(false)
      onDataLoadedRef.current?.({ ownedCount, emptyCount: 18 - ownedCount })
    }

    load().catch(console.error)
    return () => { cancelled = true }
  }, [courseId, seasonId])

  const highlightSet = new Set(highlightPlayerIds)

  if (loading) {
    if (layout === 'two-row') {
      return (
        <div style={{ background: CARD_BG, borderRadius: 12, overflow: 'hidden', padding: 16, paddingBottom: 12 }}>
          {[0, 1].map(group => (
            <div key={group} style={{ marginBottom: group === 0 ? 12 : 0 }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-[3px]" style={{ height: 36, marginBottom: 2 }}>
                  <div className="animate-pulse rounded" style={{ width: 56, minWidth: 56, height: 28, background: 'rgba(255,255,255,0.04)' }} />
                  {NINE.map(n => (
                    <div key={n} className="animate-pulse rounded" style={{ flex: 1, minWidth: 0, height: 28, background: 'rgba(255,255,255,0.04)' }} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )
    }
    return (
      <div style={{ background: CARD_BG, borderRadius: 12, overflow: 'hidden' }}>
        <div className="overflow-x-auto">
          <div style={{ minWidth: 64 + 18 * 44, padding: 16, paddingBottom: 12 }}>
            {([32, 32, 44, 32] as number[]).map((h, i) => (
              <div key={i} className="flex items-center gap-1" style={{ height: h, marginBottom: 2 }}>
                <div className="animate-pulse rounded" style={{ width: 56, minWidth: 56, height: h - 8, background: 'rgba(255,255,255,0.04)' }} />
                {HOLES.map(n => (
                  <div key={n} className="animate-pulse rounded" style={{ width: 36, minWidth: 36, height: h - 8, background: 'rgba(255,255,255,0.04)' }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div style={{ background: CARD_BG, borderRadius: 12, overflow: 'hidden' }}>
        <div className="text-center text-gray-600 text-sm py-8 px-4">
          {emptyStateText}
        </div>
      </div>
    )
  }

  if (layout === 'two-row') {
    return (
      <div style={{ background: CARD_BG, borderRadius: 12, overflow: 'hidden', padding: 16, paddingBottom: 12 }}>
        <TwoRowGroup groupChampions={champions.slice(0, 9)} courseColor={courseColor} highlightSet={highlightSet} />
        <div style={{ height: 12, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.06)' }} />
        </div>
        <TwoRowGroup groupChampions={champions.slice(9, 18)} courseColor={courseColor} highlightSet={highlightSet} />
      </div>
    )
  }

  return (
    <div style={{ background: CARD_BG, borderRadius: 12, overflow: 'hidden' }}>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 64 + 18 * 44, padding: 16, paddingBottom: 12 }}>

          {/* Row 1: Hole numbers */}
          <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ width: 64, minWidth: 64, height: 32, letterSpacing: '0.08em' }} className="text-[12px] uppercase text-gray-600 font-semibold flex items-center">
              Reikä
            </div>
            {HOLES.map(h => (
              <div key={h} style={{ width: 44, minWidth: 44, height: 32 }} className="flex items-center justify-center text-[13px] font-semibold text-gray-600">
                {h}
              </div>
            ))}
          </div>

          {/* Row 2: Par */}
          <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width: 64, minWidth: 64, height: 32, letterSpacing: '0.08em' }} className="text-[12px] uppercase text-gray-600 font-semibold flex items-center">
              Par
            </div>
            {champions.map(({ holeNumber, par }) => (
              <div key={holeNumber} style={{ width: 44, minWidth: 44, height: 32 }} className="flex items-center justify-center text-[14px] font-medium text-gray-500">
                {par ?? '–'}
              </div>
            ))}
          </div>

          {/* Row 3: Lyönnit */}
          <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width: 64, minWidth: 64, height: 44, letterSpacing: '0.08em' }} className="text-[12px] uppercase text-gray-600 font-semibold flex items-center">
              Lyönnit
            </div>
            {champions.map(({ holeNumber, par, bestStrokes }) => {
              if (bestStrokes === null || par === null) {
                return (
                  <div key={holeNumber} style={{ width: 44, minWidth: 44, height: 44 }} className="flex items-center justify-center">
                    <span className="text-[15px] font-bold" style={{ color: '#374151' }}>—</span>
                  </div>
                )
              }
              const s = holeStrokeStyle(bestStrokes, par)
              return (
                <div key={holeNumber} style={{ width: 44, minWidth: 44, height: 44 }} className="flex items-center justify-center">
                  <div style={{
                    width: 30, height: 30,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: s.outer ? `1.5px solid ${s.outer}` : 'none',
                    borderRadius: s.radius,
                    position: 'relative',
                  }}>
                    {s.inner && (
                      <div style={{
                        position: 'absolute', inset: 4,
                        border: `1.5px solid ${s.inner}`,
                        borderRadius: s.radius,
                      }} />
                    )}
                    <span className="text-[15px] font-bold" style={{ color: s.color, position: 'relative' }}>
                      {bestStrokes}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Row 4: Mestari */}
          <div className="flex">
            <div style={{ width: 64, minWidth: 64, height: 32, letterSpacing: '0.08em' }} className="text-[12px] uppercase text-gray-600 font-semibold flex items-center">
              Mestari
            </div>
            {champions.map(({ holeNumber, playerName, playerId, isLeader }) => {
              const isHighlighted = playerId !== null && highlightSet.has(playerId)
              const nameColor = !playerName
                ? '#374151'
                : isLeader
                ? courseColor
                : isHighlighted
                ? 'rgba(255,255,255,0.8)'
                : 'rgba(255,255,255,0.35)'
              return (
                <div key={holeNumber} style={{ width: 44, minWidth: 44, height: 32 }} className="flex items-center justify-center">
                  <span
                    className="text-[12px]"
                    style={{
                      color: nameColor,
                      fontWeight: isLeader || isHighlighted ? 700 : 600,
                      textDecoration: isHighlighted && !isLeader ? 'underline' : 'none',
                      textDecorationColor: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    {playerName ? abbrevName(playerName) : '—'}
                  </span>
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </div>
  )
}
