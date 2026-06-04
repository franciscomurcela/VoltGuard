import logger from '../utils/logger.js'

const DEFAULT_TIMEOUT_MS = 5000

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '')
}

export async function loadVaultSecrets() {
  const addr = process.env.VAULT_ADDR
  const token = process.env.VAULT_TOKEN
  const secretPath = process.env.VAULT_SECRET_PATH || 'secret/data/compositor'

  if (!addr || !token) {
    return
  }

  const baseUrl = normalizeBaseUrl(addr)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  let keysLoaded = 0
  try {
    const res = await fetch(`${baseUrl}/v1/${secretPath}`, {
      headers: { 'X-Vault-Token': token },
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Vault read failed: ${res.status}`)
    }

    const payload = await res.json()
    const secrets = payload?.data?.data || {}

    for (const [key, value] of Object.entries(secrets)) {
      if (process.env[key] === undefined) {
        process.env[key] = String(value)
      }
    }
    keysLoaded = Object.keys(secrets).length
  } finally {
    clearTimeout(timeout)
  }
  logger.info({ secretPath, keysLoaded }, 'Vault secrets loaded')
}
