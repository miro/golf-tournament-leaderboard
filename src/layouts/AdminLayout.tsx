import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const links = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/submit', label: 'Syötä kierros' },
  { to: '/admin/players', label: 'Pelaajat' },
  { to: '/admin/rounds', label: 'Kierrokset' },
  { to: '/admin/cards', label: 'Kortit' },
  { to: '/admin/hype', label: 'Hype Tools' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    let fallback: ReturnType<typeof setTimeout>

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        clearTimeout(fallback)
        if (session) {
          setChecking(false)
        } else {
          navigate('/admin', { replace: true })
        }
      } else if (event === 'SIGNED_OUT') {
        navigate('/admin', { replace: true })
      }
    })

    fallback = setTimeout(() => navigate('/admin', { replace: true }), 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(fallback)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen bg-gc-dark flex items-center justify-center text-gray-400">
        Tarkistetaan...
      </div>
    )
  }

  const navLinks = links.map(l => (
    <NavLink
      key={l.to}
      to={l.to}
      onClick={() => setSidebarOpen(false)}
      className={({ isActive }) =>
        `px-3 py-2.5 rounded-md text-sm transition-colors ${
          isActive
            ? 'bg-gc-green text-white font-medium'
            : 'text-gray-400 hover:text-white hover:bg-white/5'
        }`
      }
    >
      {l.label}
    </NavLink>
  ))

  const signOutButton = (
    <button
      onClick={async () => {
        await supabase.auth.signOut({ scope: 'global' })
        window.location.href = '/admin'
      }}
      className="w-full px-3 py-2.5 rounded-md text-sm text-gray-500 hover:text-white hover:bg-white/5 text-left transition-colors"
    >
      Kirjaudu ulos
    </button>
  )

  return (
    <div className="min-h-screen bg-gc-dark flex">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-gc-card border-r border-white/8 flex-col p-4 gap-1 shrink-0">
        <div className="text-gc-green font-black text-base mb-5 tracking-wide">GC ADMIN</div>
        {navLinks}
        <div className="mt-auto">{signOutButton}</div>
      </aside>

      {/* Mobile: backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile: slide-over drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gc-card border-r border-white/8 flex flex-col p-4 gap-1 md:hidden transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="text-gc-green font-black text-base tracking-wide">GC ADMIN</div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded text-gray-500 hover:text-white transition-colors"
            aria-label="Sulje valikko"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {navLinks}
        <div className="mt-auto">{signOutButton}</div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-gc-card border-b border-white/8 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 -ml-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Avaa valikko"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-gc-green font-black text-sm tracking-wide">GC ADMIN</span>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>

    </div>
  )
}
