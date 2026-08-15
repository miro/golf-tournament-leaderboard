import { Routes, Route } from 'react-router-dom'
import PublicLayout from './layouts/PublicLayout'
import AdminLayout from './layouts/AdminLayout'
import HomePage from './pages/HomePage'
import FeedPage from './pages/FeedPage'
import CoursesPage from './pages/CoursesPage'
import CourseDetailPage from './pages/CourseDetailPage'
import PlayersPage from './pages/PlayersPage'
import PlayerProfilePage from './pages/PlayerProfilePage'
import RulesPage from './pages/RulesPage'
import PersonalDashboard from './pages/PersonalDashboard'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminSubmit from './pages/admin/AdminSubmit'
import AdminPlayers from './pages/admin/AdminPlayers'
import AdminRounds from './pages/admin/AdminRounds'
import AdminCards from './pages/admin/AdminCards'
import AdminHype from './pages/admin/AdminHype'
import BetPage from './pages/proto/BetPage'
import InvitationalRosterPage from './pages/invitational/RosterPage'
import InvitationalLanding from './pages/invitational/InvitationalLanding'
import InvitationalLayout from './pages/invitational/InvitationalLayout'
import InvitationalTabsLayout from './pages/invitational/InvitationalTabsLayout'
import InvitationalSchedulePage from './pages/invitational/SchedulePage'
import InvitationalPaymentPage from './pages/invitational/PaymentPage'

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/:slug" element={<CourseDetailPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/player/:slug" element={<PlayerProfilePage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/me/:token" element={<PersonalDashboard />} />
      </Route>

      {/* Invitational — its own world. No main nav and no banner on any of these;
          the back arrows are the way out. Every route sits in the phone-width shell,
          with the tab bar as a second layer over schedule and payment. */}
      <Route element={<InvitationalLayout />}>
        <Route path="/invitational" element={<InvitationalLanding />} />
        <Route path="/invitational/roster" element={<InvitationalRosterPage />} />
        <Route element={<InvitationalTabsLayout />}>
          <Route path="/invitational/schedule" element={<InvitationalSchedulePage />} />
          <Route path="/invitational/payment" element={<InvitationalPaymentPage />} />
        </Route>
      </Route>

      {/* Prototypes — no chrome, no auth, not linked from nav */}
      <Route path="/proto/bet" element={<BetPage />} />

      {/* Admin */}
      <Route path="/admin">
        <Route index element={<AdminLogin />} />
        <Route element={<AdminLayout />}>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="submit" element={<AdminSubmit />} />
          <Route path="players" element={<AdminPlayers />} />
          <Route path="rounds" element={<AdminRounds />} />
          <Route path="cards" element={<AdminCards />} />
          <Route path="hype" element={<AdminHype />} />
        </Route>
      </Route>
    </Routes>
  )
}
