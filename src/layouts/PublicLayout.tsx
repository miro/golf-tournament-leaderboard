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
      <header className="sticky top-0 z-40 bg-gc-dark/95 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="text-gc-gold text-xl">⛳</span>
            <span className="font-bold text-white text-sm hidden sm:block">
              Liekkipoika 2026
            </span>
          </NavLink>

          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gc-green text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-white/30 text-xs">
        Golf Company — Liekkipoika Kesäkisa 2026
      </footer>
    </div>
  )
}
