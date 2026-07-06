import { useState, useMemo, useRef, useEffect } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

const RANK_COLORS = ['#F5C842', '#C0C0C0', '#CD7F32', '#6BBFFF', '#FF8C69']
const COURSE_SLUG_ORDER = ['kajaani', 'nuas', 'tenetti', 'paltamo']

function useIsMobile() {
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const fn = () => setV(window.innerWidth < 640)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return v
}

/** Hole-by-hole cumulative series for one player */
function buildSeries(playerRounds, allHoleResults) {
  const hrByRound = {}
  for (const hr of allHoleResults) {
    if (!hrByRound[hr.round_id]) hrByRound[hr.round_id] = []
    hrByRound[hr.round_id].push(hr)
  }
  const sorted = [...playerRounds].sort((a, b) => (a.played_date < b.played_date ? -1 : 1))
  let cum = 0, hIdx = 0
  const pts = [{ h: 0, v: 0, cid: null }]
  for (const r of sorted) {
    const holes = (hrByRound[r.id] ?? []).sort((a, b) => a.hole_number - b.hole_number)
    for (const hr of holes) {
      hIdx++
      cum += hr.points
      pts.push({ h: hIdx, v: cum, cid: r.course_id })
    }
  }
  return pts
}

/** Combined data array for desktop (hole-level x-axis) */
function buildDesktopData(top5, mode) {
  const maxActual = Math.max(0, ...top5.map(p => (p.series[p.series.length - 1]?.h ?? 0)))
  const maxX = mode === 'ennuste' ? Math.max(maxActual, 72) : maxActual
  const data = Array.from({ length: maxX + 1 }, (_, i) => ({ x: i }))
  for (const p of top5) {
    for (const pt of p.series) {
      if (pt.h <= maxX) data[pt.h][`a_${p.id}`] = pt.v
    }
    if (mode === 'ennuste') {
      const last = p.series[p.series.length - 1]
      if (last && last.h < 72) {
        const lastH = last.h
        const lastV = last.v
        const estTotal = Math.round(p.estimatedTotal)
        const range = 72 - lastH
        for (let x = lastH; x <= 72; x++) {
          const t = range > 0 ? (x - lastH) / range : 1
          data[x][`e_${p.id}`] = Math.round(lastV + (estTotal - lastV) * t)
        }
      }
    }
  }
  return data
}

/**
 * Combined data array for mobile (player-playing-order x-axis).
 * x=1 = each player's 1st course played (by date), x=2 = 2nd, etc.
 * This avoids gaps from non-sequential course play breaking lines.
 * Each point includes:
 *   a_${id}  — cumulative after this player's Nth course
 *   cp_${id} — points earned specifically on this course (for tooltip)
 *   cn_${id} — courseId played at this position (for tooltip course name)
 *   e_${id}  — extrapolated value (ennuste mode only)
 */
function buildMobileData(top5, roundsByPlayer, allHoleResults, orderedCourses, mode) {
  // Build per-player cumulative sequence in played_date order
  const playerSeq = {}
  for (const p of top5) {
    const rounds = [...(roundsByPlayer[p.id] ?? [])].sort((a, b) =>
      a.played_date < b.played_date ? -1 : 1
    )
    let cum = 0
    const seq = []
    for (const r of rounds) {
      const cumBefore = cum
      const holes = allHoleResults
        .filter(hr => hr.round_id === r.id)
        .sort((a, b) => a.hole_number - b.hole_number)
      for (const hr of holes) cum += hr.points
      seq.push({ cum, cp: cum - cumBefore, courseId: r.course_id })
    }
    playerSeq[p.id] = seq
  }

  const xEnd = orderedCourses.length

  const data = []
  for (let x = 1; x <= xEnd; x++) {
    const pt = { x, lbl: `${x}.` }
    for (const p of top5) {
      const seq = playerSeq[p.id] ?? []
      if (x <= seq.length) {
        const item = seq[x - 1]
        pt[`a_${p.id}`] = item.cum
        pt[`cp_${p.id}`] = item.cp
        pt[`cn_${p.id}`] = item.courseId
      }
    }
    data.push(pt)
  }

  if (mode === 'ennuste') {
    for (const p of top5) {
      const seq = playerSeq[p.id] ?? []
      const lx = seq.length
      if (lx < xEnd) {
        const startV = lx > 0 ? seq[lx - 1].cum : 0
        const endV = Math.round(p.estimatedTotal)
        const range = xEnd - lx
        for (let x = lx; x <= xEnd; x++) {
          const t = range > 0 ? (x - lx) / range : 1
          data[x - 1][`e_${p.id}`] = Math.round(startV + (endV - startV) * t)
        }
      }
    }
  }

  return data
}

/** Find which course a player was playing at a given hole index */
function getCourseAtHole(series, holeIdx) {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].h <= holeIdx && series[i].cid) return series[i].cid
  }
  return null
}

function ChartTooltip({ active, payload, label, isMobile, top5, courseById, orderedCourses }) {
  if (!active || !payload?.length) return null

  // Build one entry per player: prefer actual over estimated
  const rawMap = {}
  for (const e of payload) {
    if (e.value == null) continue
    if (e.dataKey?.startsWith('a_')) {
      const pid = e.dataKey.slice(2)
      rawMap[pid] = { type: 'actual', entry: e }
    } else if (e.dataKey?.startsWith('e_') && !rawMap[e.dataKey?.slice(2)]) {
      const pid = e.dataKey.slice(2)
      rawMap[pid] = { type: 'estimated', entry: e }
    }
  }

  const playerEntries = top5
    .map(p => { const r = rawMap[p.id]; return r ? { p, ...r } : null })
    .filter(Boolean)
    .sort((a, b) => b.entry.value - a.entry.value)

  if (!playerEntries.length) return null

  const allEstimated = playerEntries.every(e => e.type === 'estimated')
  const borderColor = allEstimated
    ? `${playerEntries[0].p.color}99`
    : 'rgba(255,255,255,0.1)'

  return (
    <div style={{
      background: '#221D17',
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      padding: '8px 12px',
      minWidth: 150,
    }}>
      {isMobile ? (
        <>
          <div style={{
            fontSize: 10, color: '#5A5040', marginBottom: 6,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {`${label}. kenttä`}
          </div>
          {playerEntries.map(({ p, type, entry }) => {
            if (type === 'estimated') {
              const pph = p.holesPlayed > 0 ? (p.totalPoints / p.holesPlayed).toFixed(1) : '–'
              return (
                <div key={p.id} style={{ marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: 12, color: '#F2EDE6', fontWeight: 700 }}>
                      {p.rank}. {p.player?.full_name?.split(' ')[0] ?? '–'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#9A8870', paddingLeft: 13, marginTop: 1, fontStyle: 'italic' }}>
                    Ennustettu: <span style={{ color: '#E8A820', fontWeight: 600 }}>~{Math.round(entry.value)}p</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#5A5040', paddingLeft: 13 }}>
                    Perustuu: {pph} p/väylä
                  </div>
                </div>
              )
            }
            const coursePoints = payload[0]?.payload?.[`cp_${p.id}`]
            const cid = payload[0]?.payload?.[`cn_${p.id}`]
            const pCourseName = cid ? (courseById[cid]?.name ?? null) : null
            return (
              <div key={p.id} style={{ marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontSize: 12, color: '#F2EDE6', fontWeight: 700 }}>
                    {p.player?.full_name?.split(' ')[0] ?? '–'}
                  </span>
                </div>
                {coursePoints != null && (
                  <div style={{ fontSize: 11, color: '#9A8870', paddingLeft: 13, marginTop: 1 }}>
                    {pCourseName ?? '–'}: <span style={{ color: '#E8A820', fontWeight: 600 }}>{coursePoints}p</span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#5A5040', paddingLeft: 13 }}>
                  Yhteensä: <span style={{ color: '#F2EDE6', fontWeight: 600 }}>{Math.round(entry.value)}p</span>
                </div>
              </div>
            )
          })}
        </>
      ) : (
        <>
          <div style={{
            fontSize: 10, color: '#5A5040', marginBottom: 6,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            Reikä {label}
          </div>
          {playerEntries.map(({ p, type, entry }) => {
            if (type === 'estimated') {
              const pph = p.holesPlayed > 0 ? (p.totalPoints / p.holesPlayed).toFixed(1) : '–'
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block', marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#F2EDE6', fontWeight: 700, lineHeight: 1.3 }}>
                      {p.rank}. {p.player?.full_name?.split(' ')[0] ?? '–'}
                    </div>
                    <div style={{ fontSize: 10, color: '#9A8870', fontStyle: 'italic', marginTop: 1 }}>
                      Ennustettu: ~{Math.round(entry.value)}p
                    </div>
                    <div style={{ fontSize: 10, color: '#5A5040' }}>
                      Perustuu: {pph} p/väylä
                    </div>
                  </div>
                </div>
              )
            }
            const cid = getCourseAtHole(p.series, label)
            const cname = cid ? (courseById[cid]?.name ?? null) : null
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block', marginTop: 3 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#F2EDE6', fontWeight: 700, lineHeight: 1.3 }}>
                    {p.player?.full_name?.split(' ')[0] ?? '–'}
                  </div>
                  {cname && (
                    <div style={{ fontSize: 10, color: '#5A5040', letterSpacing: '0.05em' }}>
                      {cname}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 12, color: '#E8A820', fontWeight: 700 }}>
                  {Math.round(entry.value)}p
                </span>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

export default function ProgressionChart({ allRounds, allHoleResults, courses }) {
  const [mode, setMode] = useState('tilanne')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const isMobile = useIsMobile()
  const hasAnimated = useRef(false)
  const isAnimActive = !hasAnimated.current
  useEffect(() => { hasAnimated.current = true }, [])

  const courseBySlug = useMemo(() => {
    const m = {}; for (const c of courses) m[c.slug] = c; return m
  }, [courses])

  const courseById = useMemo(() => {
    const m = {}; for (const c of courses) m[c.id] = c; return m
  }, [courses])

  const orderedCourses = useMemo(() =>
    COURSE_SLUG_ORDER.map(s => courseBySlug[s]).filter(Boolean)
  , [courseBySlug])

  const roundsByPlayer = useMemo(() => {
    const m = {}
    for (const r of allRounds) {
      if (!m[r.player_id]) m[r.player_id] = []
      m[r.player_id].push(r)
    }
    return m
  }, [allRounds])

  const seriesMap = useMemo(() => {
    const m = {}
    for (const [pid, rounds] of Object.entries(roundsByPlayer)) {
      m[pid] = buildSeries(rounds, allHoleResults)
    }
    return m
  }, [roundsByPlayer, allHoleResults])

  const statsMap = useMemo(() => {
    const m = {}
    for (const [pid, series] of Object.entries(seriesMap)) {
      const last = series[series.length - 1]
      const holesPlayed = last?.h ?? 0
      const totalPoints = last?.v ?? 0
      const rounds = roundsByPlayer[pid] ?? []
      const pph = holesPlayed > 0 ? totalPoints / holesPlayed : 0
      m[pid] = {
        player: rounds[0]?.player,
        totalPoints,
        holesPlayed,
        roundsPlayed: rounds.length,
        estimatedTotal: pph * 72,
        series,
      }
    }
    return m
  }, [seriesMap, roundsByPlayer])

  const { top5, canEnnuste } = useMemo(() => {
    const allIds = Object.keys(statsMap)
    // Any player with ≥1 round is eligible for ennuste
    const eligibleIds = allIds.filter(id => statsMap[id].roundsPlayed >= 1)
    const canEnnuste = eligibleIds.length >= 1

    const sorted = mode === 'ennuste'
      ? [...eligibleIds].sort((a, b) => statsMap[b].estimatedTotal - statsMap[a].estimatedTotal)
      : [...allIds].sort((a, b) => statsMap[b].totalPoints - statsMap[a].totalPoints)

    const top5 = sorted.slice(0, 5).map((id, i) => ({
      id,
      ...statsMap[id],
      color: RANK_COLORS[i],
      rank: i + 1,
    }))

    return { top5, canEnnuste }
  }, [statsMap, mode])

  useEffect(() => {
    if (!canEnnuste && mode === 'ennuste') setMode('tilanne')
  }, [canEnnuste, mode])

  const chartData = useMemo(() => {
    if (!top5.length) return []
    return isMobile
      ? buildMobileData(top5, roundsByPlayer, allHoleResults, orderedCourses, mode)
      : buildDesktopData(top5, mode)
  }, [top5, isMobile, roundsByPlayer, allHoleResults, orderedCourses, mode])

  const maxY = useMemo(() => {
    if (!chartData.length) return 100
    let max = 0
    for (const d of chartData) {
      for (const p of top5) {
        const a = d[`a_${p.id}`]
        const e = d[`e_${p.id}`]
        if (a != null) max = Math.max(max, a)
        if (e != null) max = Math.max(max, e)
      }
    }
    return Math.ceil(max * 1.1) || 100
  }, [chartData, top5])

  const xMax = isMobile
    ? orderedCourses.length
    : (chartData.length > 0 ? chartData[chartData.length - 1].x : 0)

  const xTicks = isMobile
    ? orderedCourses.map((_, i) => i + 1)
    : [1, 19, 37, 55].filter(t => t <= xMax + 1)

  const xTickFormatter = (val) => {
    if (isMobile) {
      return `${val}.`
    }
    // Desktop: "1. kenttä", "2. kenttä", …
    const idx = Math.floor((val - 1) / 18)
    return `${idx + 1}. kenttä`
  }

  const refLines = isMobile ? [] : [19, 37, 55].filter(x => x <= xMax)
  const hasData = allHoleResults.length > 0

  function toggle(id) {
    setSelectedPlayer(prev => prev === id ? null : id)
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2
          className="text-[13px] uppercase text-gray-600 font-display font-semibold"
          style={{ letterSpacing: '0.12em' }}
        >
          Eteneminen
        </h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'tilanne', label: 'TILANNE' },
            { key: 'ennuste', label: 'ENNUSTE' },
          ].map(({ key, label }) => {
            const isActive = mode === key
            const disabled = key === 'ennuste' && !canEnnuste
            return (
              <button
                key={key}
                onClick={() => { if (!disabled) setMode(key) }}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  padding: '4px 10px',
                  borderRadius: 20,
                  border: isActive ? 'none' : '1px solid rgba(255,255,255,0.12)',
                  background: isActive ? '#E8A820' : 'transparent',
                  color: isActive ? '#17130F' : disabled ? '#3A3020' : '#9A8870',
                  cursor: disabled ? 'default' : 'pointer',
                  transition: 'background 200ms, color 200ms',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="card" style={{ padding: '16px 0 12px' }}>
        {!hasData ? (
          <div style={{
            height: isMobile ? 220 : 280,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#5A5040', fontSize: 13, textAlign: 'center',
            padding: '0 24px', lineHeight: 1.6,
          }}>
            Ei vielä tuloksia — eteneminen näkyy kun<br />ensimmäinen kierros on syötetty
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray=""
                />
                <XAxis
                  dataKey="x"
                  type="number"
                  scale="linear"
                  domain={isMobile ? [1, xMax] : [0, xMax]}
                  ticks={xTicks}
                  tickFormatter={xTickFormatter}
                  tick={{ fill: '#5A5040', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, maxY]}
                  tick={{ fill: '#5A5040', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      isMobile={isMobile}
                      top5={top5}
                      courseById={courseById}
                      orderedCourses={orderedCourses}
                    />
                  }
                  cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
                />
                {refLines.map(x => (
                  <ReferenceLine
                    key={x}
                    x={x}
                    stroke="rgba(255,255,255,0.15)"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                  />
                ))}
                {top5.flatMap(p => {
                  const sel = selectedPlayer === p.id
                  const dim = !!(selectedPlayer && !sel)
                  const opacity = dim ? 0.2 : 1
                  const sw = sel ? 4 : 2.5
                  const lines = [
                    <Line
                      key={`a_${p.id}`}
                      dataKey={`a_${p.id}`}
                      stroke={p.color}
                      strokeWidth={sw}
                      strokeOpacity={opacity}
                      dot={isMobile ? { r: 5, fill: p.color, strokeWidth: 0 } : false}
                      activeDot={{ r: isMobile ? 7 : 4, fill: p.color, stroke: 'none', cursor: 'pointer' }}
                      connectNulls={false}
                      isAnimationActive={isAnimActive}
                      legendType="none"
                      onClick={() => toggle(p.id)}
                      style={{ cursor: 'pointer', transition: 'stroke-opacity 300ms' }}
                    />,
                  ]
                  if (mode === 'ennuste') {
                    lines.push(
                      <Line
                        key={`e_${p.id}`}
                        dataKey={`e_${p.id}`}
                        stroke={p.color}
                        strokeWidth={sw - 0.5}
                        strokeOpacity={opacity * 0.55}
                        strokeDasharray="6 4"
                        dot={false}
                        activeDot={{ r: isMobile ? 7 : 4, fill: p.color, stroke: 'none' }}
                        connectNulls={true}
                        isAnimationActive={false}
                        legendType="none"
                        style={{ transition: 'stroke-opacity 300ms' }}
                      />
                    )
                  }
                  return lines
                })}
              </ComposedChart>
            </ResponsiveContainer>

            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '6px 18px',
              marginTop: 10, paddingLeft: 40, paddingRight: 16,
            }}>
              {top5.map((p) => {
                const sel = selectedPlayer === p.id
                const dim = !!(selectedPlayer && !sel)
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'none', border: 'none', padding: '2px 0',
                      cursor: 'pointer',
                      opacity: dim ? 0.3 : 1,
                      transition: 'opacity 300ms',
                    }}
                  >
                    <svg width="20" height="4" style={{ flexShrink: 0, display: 'block' }}>
                      <line x1="0" y1="2" x2="20" y2="2" stroke={p.color} strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                      <span className="font-display" style={{ fontSize: 12, fontWeight: 700, color: p.color }}>
                        {p.rank}.
                      </span>
                      <span className="font-display" style={{ fontSize: 12, fontWeight: sel ? 700 : 500, color: '#F2EDE6' }}>
                        {p.player?.full_name?.split(' ')[0] ?? '–'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
