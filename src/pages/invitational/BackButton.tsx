import { Link } from 'react-router-dom'
import Icon from './icons'

/** Circular back arrow that floats over full-bleed content — the landing hero and
 * the roster carousel. Icon colour rides on currentColor so hover lifts it to full
 * white without touching the disc. */
export default function BackButton({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="absolute top-4 left-4 z-20 flex items-center justify-center rounded-full text-white/70 hover:text-white transition-colors duration-150"
      style={{
        width: 40,
        height: 40,
        background: 'rgba(0,0,0,0.40)',
        border: '1px solid rgba(255,255,255,0.15)',
      }}
    >
      <Icon name="arrow-left" size={24} />
    </Link>
  )
}
