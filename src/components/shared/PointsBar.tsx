// Fixed course order and fallback colors used when parent doesn't supply a color
const COURSE_ORDER = ['kajaani', 'nuas', 'tenetti', 'paltamo'] as const

const COURSE_COLORS: Record<string, string> = {
  kajaani: '#2D6A4F',
  nuas:    '#C4791B',
  tenetti: '#8B1BC4',
  paltamo: '#1B4FC4',
}

export interface SegmentData {
  courseSlug: string
  points: number
  color?: string
}

interface Props {
  segments: SegmentData[]
  maxPoints: number
  height?: number
  className?: string
}

export default function PointsBar({ segments, maxPoints, height = 6, className }: Props) {
  const safe = maxPoints > 0 ? maxPoints : 1

  // Sort into fixed course order; unknown slugs go at end; skip zero points
  const inOrder = COURSE_ORDER
    .map(slug => segments.find(s => s.courseSlug === slug))
    .filter((s): s is SegmentData => !!s && s.points > 0)
  const others = segments.filter(s => !(COURSE_ORDER as readonly string[]).includes(s.courseSlug) && s.points > 0)
  const ordered = [...inOrder, ...others]

  return (
    <div
      className={className}
      style={{
        height,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 4,
        overflow: 'hidden',
        display: 'flex',
        gap: 1,
        flexShrink: 0,
      }}
    >
      {ordered.map(seg => (
        <div
          key={seg.courseSlug}
          style={{
            height: '100%',
            flexShrink: 0,
            width: `${(seg.points / safe) * 100}%`,
            background: seg.color ?? COURSE_COLORS[seg.courseSlug] ?? '#555555',
          }}
        />
      ))}
    </div>
  )
}
