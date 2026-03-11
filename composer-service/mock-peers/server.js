import express from 'express'

// ─── OAM Mock (port 8091) ────────────────────────────
const oam = express()
oam.use(express.json())

const devices = [
  { id: 'DEV-001', name: 'Sensor Temperatura Lisboa', type: 'temperature', district: 'Lisboa', status: 'active', ip: '192.168.1.101', firmware: 'v2.4.1', lastSeen: '2s ago' },
  { id: 'DEV-002', name: 'Sensor Humidade Porto', type: 'humidity', district: 'Porto', status: 'active', ip: '192.168.1.102', firmware: 'v2.4.1', lastSeen: '5s ago' },
  { id: 'DEV-003', name: 'Gateway Aveiro Central', type: 'gateway', district: 'Aveiro', status: 'active', ip: '192.168.1.103', firmware: 'v3.1.0', lastSeen: '1s ago' },
  { id: 'DEV-004', name: 'Sensor Pressão Faro', type: 'pressure', district: 'Faro', status: 'warning', ip: '192.168.2.15', firmware: 'v2.3.8', lastSeen: '45s ago' },
]

oam.get('/api/health', (_, res) => res.json({ status: 'healthy' }))
oam.get('/api/devices', (_, res) => res.json(devices))
oam.get('/api/devices/:id', (req, res) => {
  const d = devices.find(d => d.id === req.params.id)
  d ? res.json(d) : res.status(404).json({ error: 'Not found' })
})
oam.post('/api/devices', (req, res) => {
  const newDev = { id: `DEV-${String(devices.length + 1).padStart(3, '0')}`, ...req.body, status: 'pending', lastSeen: 'just now' }
  devices.push(newDev)
  res.status(201).json(newDev)
})
oam.delete('/api/devices/:id', (req, res) => {
  const idx = devices.findIndex(d => d.id === req.params.id)
  idx >= 0 ? (devices.splice(idx, 1), res.status(204).end()) : res.status(404).json({ error: 'Not found' })
})
oam.get('/api/metrics', (_, res) => res.json({
  totalRequests: 45843266, requestsPerSecond: 172411, totalDeployments: 6120,
  firewallActions: { total: 7507933, systemBlocks: 1398338, systemChallenges: 3171579, customWafBlocks: 328814 },
  botManagement: { botsBlocked: 415722, humansVerified: 2408348 },
  aiGateway: { requests: 24088, avgLatency: 142 },
  cache: { hitsServed: 28953177, hitRate: 68.2 },
  devicesOnline: 2847, devicesTotal: 3124,
}))
oam.get('/api/districts/stats', (_, res) => res.json([
  { id: 'lisboa', name: 'Lisboa', requests: 12456789, rate: 48221 },
  { id: 'porto', name: 'Porto', requests: 8945123, rate: 34108 },
  { id: 'setubal', name: 'Setúbal', requests: 4567890, rate: 17542 },
  { id: 'aveiro', name: 'Aveiro', requests: 3421890, rate: 13289 },
  { id: 'faro', name: 'Faro', requests: 3210987, rate: 12198 },
  { id: 'braga', name: 'Braga', requests: 2891045, rate: 10856 },
  { id: 'coimbra', name: 'Coimbra', requests: 2134567, rate: 8312 },
]))
oam.listen(8091, () => console.log('✓ OAM mock on :8091'))

// ─── Notification Mock (port 8092) ───────────────────
const notif = express()
notif.get('/api/health', (_, res) => res.json({ status: 'healthy' }))
notif.get('/api/notifications', (_, res) => res.json([
  { id: 'n1', msg: 'Device DEV-004 pressure anomaly in Faro', time: '2m ago', type: 'warn' },
  { id: 'n2', msg: 'OAM config sync completed', time: '8m ago', type: 'ok' },
  { id: 'n3', msg: 'New device provisioned in Braga', time: '15m ago', type: 'info' },
]))
notif.get('/api/notifications/count', (_, res) => res.json({ unread: 3 }))
notif.listen(8092, () => console.log('✓ Notification mock on :8092'))

// ─── Anomaly Mock (port 8093) ────────────────────────
const anomaly = express()
anomaly.get('/api/health', (_, res) => res.json({ status: 'healthy' }))
anomaly.get('/api/anomalies/summary', (_, res) => res.json({
  total: 12, bySeverity: { low: 5, medium: 4, high: 2, critical: 1 }, trending: ['temperature_spike', 'pressure_drop'],
}))
anomaly.get('/api/anomalies', (_, res) => res.json([
  { id: 'a1', deviceId: 'DEV-004', type: 'pressure_drop', severity: 'high', detectedAt: new Date().toISOString() },
]))
anomaly.listen(8093, () => console.log('✓ Anomaly mock on :8093'))
