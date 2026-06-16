import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const links = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/submit', label: 'Syötä kierros' },
  { to: '/admin/players', label: 'Pelaajat' },
  { to: '/admin/rounds', label: 'Kierrokset' },
  { to: '/admin/cards', label: 'Kortit' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/admin', { replace: true })
      } else {
        setChecking(false)
      }
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen bg-gc-dark flex items-center justify-center text-gray-400">
        Tarkistetaan...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gc-dark flex">
      <aside className="w-56 bg-gc-card border-r border-white/8 flex flex-col p-4 gap-1 shrink-0">
        <div className="text-gc-green font-black text-base mb-5 tracking-wide">GC ADMIN</div>
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-gc-green text-white font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
        <div className="mt-auto">
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              navigate('/admin')
            }}
            className="w-full px-3 py-2 rounded-md text-sm text-gray-500 hover:text-white hover:bg-white/5 text-left transition-colors"
          >
            Kirjaudu ulos
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
