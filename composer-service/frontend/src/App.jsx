import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuth from './hooks/useAuth'
import useMetrics from './hooks/useMetrics'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import Anomalies from './pages/Anomalies'
import Notifications from './pages/Notifications'
import Preferences from './pages/Preferences'

// ─── Auth Guard ─────────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { initialized, authenticated } = useAuth()

  // Auth is disabled system-wide (AUTH_DISABLED=true on backend too) — let through
  if (import.meta.env.VITE_AUTH_DISABLED === 'true') return children

  if (!initialized) return <Login />
  if (!authenticated) return <Login />

  return children
}

// ─── App Layout (wraps authenticated pages) ─────────────────────────────────
function AppLayout() {
  const { serviceHealth } = useMetrics()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1440, margin: '0 auto', width: '100%' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/anomalies" element={<Anomalies />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer serviceHealth={serviceHealth} />
    </div>
  )
}

// ─── Root App ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/preferences" element={<Preferences />} />
        <Route
          path="*"
          element={(
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          )}
        />
      </Routes>
    </BrowserRouter>
  )
}
