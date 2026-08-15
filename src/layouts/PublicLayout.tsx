import { Outlet, NavLink, useLocation } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  end?: boolean
  /** Keeps the item lit across a section's sub-routes, not just its own path. */
  activePrefix?: string
}

const navItems: NavItem[] = [
  { to: '/', label: 'Tulokset', end: true },
  { to: '/feed', label: 'Feed' },
  { to: '/courses', label: 'Kentät' },
  { to: '/players', label: 'Pelaajat' },
  // Ohjelma is the landing tab: the roster is full-screen and hides this nav, so
  // entering there would leave no way through to the other tabs.
  { to: '/invitational/schedule', label: 'Invitational', activePrefix: '/invitational' },
  { to: '/rules', label: 'Säännöt' },
]

export default function PublicLayout() {
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nike-style stripe bar */}
      <div className="stripe-bar">
        <span /><span /><span /><span />
      </div>

      <header className="sticky top-0 z-40 bg-gc-dark/95 backdrop-blur border-b border-white/8">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <NavLink to="/" className="flex items-center gap-2.5">
            <img src="/gc-logo.png" alt="GC" style={{ height: 36, width: 'auto', filter: 'invert(1)' }} />
            <span className="font-bold text-white text-[18px] hidden sm:block font-display" style={{ letterSpacing: '0.04em' }}>
              Liekkipoika Kesäkisa 2026
            </span>
          </NavLink>

          <nav className="flex items-center gap-0.5">
            {navItems.map(({ to, label, end, activePrefix }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-[15px] font-medium font-display transition-colors ${
                    isActive || (activePrefix && pathname.startsWith(activePrefix))
                      ? 'bg-gc-green text-gc-dark font-bold'
                      : 'text-gc-muted hover:text-white hover:bg-white/8'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-white/8 py-6 text-center text-gc-muted text-xs">
        Golf Company — Liekkipoika Kesäkisa 2026
      </footer>
    </div>
  )
}
