import { Routes, Route, Navigate } from 'react-router-dom'
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

      {/* Admin */}
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin/*" element={<AdminLayout />}>
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="submit" element={<AdminSubmit />} />
        <Route path="players" element={<AdminPlayers />} />
        <Route path="rounds" element={<AdminRounds />} />
        <Route path="cards" element={<AdminCards />} />
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  )
}
