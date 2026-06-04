import { useLocation, useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { useTheme } from '../../contexts/ThemeContext'

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: '◈' },
  { path: '/devices', label: 'Devices', icon: '◎' },
  { path: '/anomalies', label: 'Anomalies', icon: '⚠' },
  { path: '/notifications', label: 'Notifications', icon: '◆' },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        height: 56,
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Left: Brand + Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* Logo */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.3, color: 'var(--text-primary)' }}>
            COMPOSITOR
          </span>
          <span
            className="mono"
            style={{
              fontSize: 9,
              color: 'var(--text-faint)',
              background: 'var(--bg-elevated)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              marginLeft: 2,
              letterSpacing: 1,
            }}
          >
            SOA
          </span>
        </div>

        {/* Nav tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  padding: '7px 16px',
                  background: isActive ? 'var(--accent-blue-dim)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(14,165,233,0.25)' : 'transparent'}`,
                  borderRadius: 'var(--radius-md)',
                  color: isActive ? 'var(--accent-blue)' : 'var(--text-faint)',
                  fontSize: 13,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 11 }}>{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: Session info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
            }}
          >
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.3 }}>
              {user?.email || 'user@compositor.pt'}
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
              {user?.isAdmin ? 'admin' : 'operator'}
            </div>
          </div>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            padding: '5px 8px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-faint)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isDark ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          style={{
            padding: '4px 12px',
            background: 'var(--accent-red-dim)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--accent-red)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Logout
        </button>
      </div>
    </nav>
  )
}
