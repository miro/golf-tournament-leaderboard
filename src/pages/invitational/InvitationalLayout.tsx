import { NavLink, Outlet } from 'react-router-dom'

/** Pelaajat links out of this layout: the roster is a full-screen carousel with
 * no chrome, so it renders outside PublicLayout and has no tab bar of its own. */
const tabs = [
  { to: '/invitational/roster', label: 'Pelaajat' },
  { to: '/invitational/schedule', label: 'Ohjelma' },
  { to: '/invitational/payment', label: 'Maksaminen' },
]

export default function InvitationalLayout() {
  return (
    <div>
      {/* top-14 clears the 56px main nav, which sticks at top-0 with z-40. */}
      <div className="sticky top-14 z-30 bg-gc-dark border-b border-white/8">
        <div className="max-w-[680px] mx-auto px-4 flex items-center gap-1 h-12">
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
