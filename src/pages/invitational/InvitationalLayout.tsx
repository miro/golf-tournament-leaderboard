import { Link, NavLink, Outlet } from 'react-router-dom'
import Icon from './icons'

/** Pelaajat is not a tab: the roster is a full-screen carousel with no chrome, so it
 * is reached from the landing page instead. */
const tabs = [
  { to: '/invitational/schedule', label: 'Ohjelma' },
  { to: '/invitational/payment', label: 'Maksaminen' },
]

export default function InvitationalLayout() {
  return (
    <div className="min-h-screen bg-gc-dark">
      {/* The main nav is absent on /invitational/*, so this bar sticks to the top. */}
      <div className="sticky top-0 z-30 bg-gc-dark border-b border-white/8">
        <div className="max-w-[680px] mx-auto px-4 flex items-center gap-1 h-12">
          <Link
            to="/invitational"
            aria-label="Takaisin Invitationalin etusivulle"
            className="flex items-center text-white/60 hover:text-white transition-colors duration-150 -ml-1"
            style={{ padding: '0 12px' }}
          >
            <Icon name="arrow-left" size={20} />
          </Link>

          {tabs.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-[15px] font-semibold font-display transition-colors ${
                  isActive ? 'bg-gc-green text-gc-dark' : 'text-gc-muted hover:text-white'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="max-w-[680px] mx-auto px-4 pt-6 pb-10">
        <Outlet />
      </div>
    </div>
  )
}
