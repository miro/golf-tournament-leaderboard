import { Outlet, NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Tulokset', end: true },
  { to: '/feed', label: 'Feed' },
  { to: '/courses', label: 'Kentät' },
  { to: '/players', label: 'Pelaajat' },
  { to: '/rules', label: 'Säännöt' },
]

export default function PublicLayout() {
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
            <span className="font-bold text-white text-sm hidden sm:block tracking-wide">
              Liekkipoika Kesäkisa 2026
            </span>
          </NavLink>

          <nav className="flex items-center gap-0.5">
            {navItems.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
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
