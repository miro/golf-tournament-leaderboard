/** Inline Tabler-style line icons. The project has no icon dependency, so the
 * handful the invitational pages need are drawn here on Tabler's 24×24 grid. */

type IconName = 'car' | 'kitchen' | 'users' | 'trophy' | 'home' | 'map-pin' | 'check' | 'x'

const PATHS: Record<IconName, string[]> = {
  car: [
    'M7 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0H9M3 11h15m-6 0V6',
  ],
  kitchen: ['M19 3v12h-5c-.023-3.681.184-7.406 5-12zM19 15v6h-1v-3M8 4v17M5 4v3a3 3 0 1 0 6 0V4'],
  users: [
    'M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
    'M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2',
    'M16 3.13a4 4 0 0 1 0 7.75',
    'M21 21v-2a4 4 0 0 0-3-3.85',
  ],
  trophy: ['M8 21h8', 'M12 17v4', 'M7 4h10', 'M17 4v8a5 5 0 0 1-10 0V4', 'M7 6H5a2 2 0 0 0 0 4h2', 'M17 6h2a2 2 0 0 1 0 4h-2'],
  home: [
    'M5 12H3l9-9l9 9h-2',
    'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
    'M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6',
  ],
  'map-pin': [
    'M9 11a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    'M17.657 16.657l-4.243 4.243a2 2 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z',
  ],
  check: ['M5 12l5 5l10-10'],
  x: ['M18 6l-12 12', 'M6 6l12 12'],
}

interface Props {
  name: IconName
  size?: number
  color?: string
  /** Nudges the glyph down to sit on the text baseline it is inline with. */
  style?: React.CSSProperties
}

export default function Icon({ name, size = 16, color = 'currentColor', style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block', ...style }}
    >
      {PATHS[name].map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
