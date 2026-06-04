import { loadVaultSecrets } from './config/vault.js'

await loadVaultSecrets()

const { start, default: app } = await import('./server.js')
await start()

export default app
