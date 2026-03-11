import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuth from './hooks/useAuth'
import useMetrics from './hooks/useMetrics'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'

// ─── Auth Guard ─────────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { initialized, authenticated } = useAuth()

  if (!initialized) {
    return <Login />
  }

  if (!authenticated) {
    return <Login />
  }

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
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    </BrowserRouter>
  )
}
