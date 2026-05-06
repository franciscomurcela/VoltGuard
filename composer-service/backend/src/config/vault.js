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
  } finally {
    clearTimeout(timeout)
  }
  // No vault.js, logo após o loop de carregamento:
  const anomalyKey = process.env.ANOMALY_APP_TOKEN || "MISSING";
  console.log(`[Debug] Anomaly Token Check (First 4 chars): ${anomalyKey.substring(0, 4)}...`);
}
