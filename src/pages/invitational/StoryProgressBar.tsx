import { AMBER } from './roster'

export const STORY_DURATION_MS = 8000

interface Props {
  /** Held down — freeze both the bar and, with it, the auto-advance. */
  paused: boolean
  /** Fired when the fill reaches 100%. */
  onComplete: () => void
}

/** Remount this (via a key on the card index) to restart the fill from zero.
 * Auto-advance hangs off onAnimationEnd rather than a parallel setTimeout, so a
 * paused bar cannot drift out of sync with a still-running timer. */
export default function StoryProgressBar({ paused, onComplete }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'rgba(255,255,255,0.20)',
        zIndex: 30,
        pointerEvents: 'none',
      }}
    >
      <div
        onAnimationEnd={onComplete}
        style={{
          height: '100%',
          width: 0,
          background: AMBER,
          animation: `progressFill ${STORY_DURATION_MS}ms linear forwards`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      />
    </div>
  )
}
