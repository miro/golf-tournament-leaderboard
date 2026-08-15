import { Link } from 'react-router-dom'
import { AMBER, INVITATIONAL_DATE_RANGE } from '../pages/invitational/schedule'

/** Slim strip under the main nav on every kesäkisa page — the only route into the
 * Invitational now that it has left the main navigation. */
export default function InvitationalBanner() {
  return (
    <Link
      to="/invitational"
      className="flex items-center justify-center w-full transition-colors duration-150 bg-[rgba(232,168,32,0.12)] hover:bg-[rgba(232,168,32,0.18)]"
      style={{ height: 44, borderBottom: '1px solid rgba(232,168,32,0.25)' }}
    >
      <span
        className="font-display"
        style={{ fontSize: 13, fontWeight: 700, color: AMBER, letterSpacing: '0.10em' }}
      >
        🔥👦 GC INVITATIONAL 2026
      </span>
      <span style={{ color: 'rgba(255,255,255,0.40)' }}>&nbsp;—&nbsp;</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.60)' }}>
        {INVITATIONAL_DATE_RANGE}
      </span>
      <span style={{ color: AMBER }}>&nbsp;→</span>
    </Link>
  )
}
