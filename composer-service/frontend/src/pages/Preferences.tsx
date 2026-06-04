import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { preferencesApi } from '../services/api'
import './Preferences.css'

type DeliveryMode = 'immediate' | 'digest'

type PreferencesData = {
  user_id?: string
  target_email?: string
  target_phone?: string
  channels?: {
    sms?: boolean
    email?: boolean
  }
  alert_type?: {
    critical?: DeliveryMode
    warnings?: DeliveryMode
  }
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

function maskPhone(phone: string) {
  if (!phone) return ''
  const trimmed = phone.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= 4) return trimmed
  return trimmed
}

export default function Preferences() {
  const [searchParams] = useSearchParams()
  const secret = searchParams.get('secret') || ''

  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [smsEnabled, setSmsEnabled] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('immediate')

  useEffect(() => {
    async function loadPreferences() {
      if (!secret) {
        setState('error')
        setError('Secret em falta no URL.')
        return
      }

      setState('loading')
      setError('')

      try {
        const response = await preferencesApi.getBySecret(secret)
        const data = (response?.data || {}) as PreferencesData

        const channels = data.channels || {}
        const alertType = data.alert_type || {}

        setEmail(data.target_email || '')
        setPhone(data.target_phone || '')

        setSmsEnabled(Boolean(channels.sms))
        setEmailEnabled(Boolean(channels.email))
        setDeliveryMode(alertType.warnings === 'digest' ? 'digest' : 'immediate')

        setState('ready')
      } catch (err) {
        setState('error')
        setError('Não foi possível carregar as preferências para este link.')
      }
    }

    loadPreferences()
  }, [secret])

  const canSubmit = useMemo(() => state === 'ready' && !saving, [state, saving])
  const hasAnyChannelEnabled = smsEnabled || emailEnabled

  useEffect(() => {
    if (!success) return

    const timer = window.setTimeout(() => {
      setSuccess('')
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [success])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!secret) {
      setError('Secret em falta no URL.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await preferencesApi.patchBySecret(secret, {
        channels: {
          sms: smsEnabled,
          email: emailEnabled,
        },
        alert_type: {
          warnings: deliveryMode,
          critical: 'immediate',
        },
      })
      setSuccess('Preferências atualizadas com sucesso.')
    } catch (err) {
      setError('Não foi possível guardar as preferências. Tenta novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="prefs-page">
      <header className="prefs-header">
        <h1>VoltGuard</h1>
      </header>

      <main className="prefs-main">
        <form className="prefs-card" onSubmit={handleSubmit}>
          <section className="prefs-section">
            <label className="prefs-label">Email</label>
            <div className="prefs-pill">{email || 'joao.silva@voltguard.local'}</div>
          </section>

          <section className="prefs-section">
            <label className="prefs-label">Telemóvel</label>
            <div className="prefs-pill">{maskPhone(phone) || '+351 910 000 000'}</div>
            <p className="prefs-hint">Para atualizar os seus contactos, fale com o administrador do sistema.</p>
          </section>

          <section className="prefs-section">
            <h2>Canais</h2>
            <div className="prefs-channels-grid">
              <div className="prefs-channel-item">
                <span>SMS</span>
                <label className="prefs-checkbox">
                  <input
                    type="checkbox"
                    checked={smsEnabled}
                    onChange={(event) => setSmsEnabled(event.target.checked)}
                  />
                  <span className="prefs-checkbox-mark" />
                </label>
              </div>

              <div className="prefs-channel-item">
                <span>Email</span>
                <label className="prefs-checkbox">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(event) => setEmailEnabled(event.target.checked)}
                  />
                  <span className="prefs-checkbox-mark" />
                </label>
              </div>
            </div>
          </section>

          {hasAnyChannelEnabled ? (
            <section className="prefs-section">
              <h2>Frequência de alertas</h2>
              <div className="prefs-mode-row">
                <label className="prefs-radio">
                  <span>Immediate</span>
                  <input
                    type="radio"
                    name="deliveryMode"
                    value="immediate"
                    checked={deliveryMode === 'immediate'}
                    onChange={() => setDeliveryMode('immediate')}
                  />
                  <span className="prefs-radio-mark" />
                </label>

                <label className="prefs-radio">
                  <span>Digest</span>
                  <input
                    type="radio"
                    name="deliveryMode"
                    value="digest"
                    checked={deliveryMode === 'digest'}
                    onChange={() => setDeliveryMode('digest')}
                  />
                  <span className="prefs-radio-mark" />
                </label>
              </div>
            </section>
          ) : null}

          {error ? <p className="prefs-error">{error}</p> : null}
          {success ? <p className="prefs-success">{success}</p> : null}

          <button type="submit" className="prefs-submit" disabled={!canSubmit}>
            {saving ? 'A guardar...' : 'Submeter'}
          </button>

          {state === 'loading' ? <p className="prefs-status">A carregar preferências...</p> : null}
        </form>
      </main>
    </div>
  )
}
