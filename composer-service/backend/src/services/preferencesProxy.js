import client, { withRetry } from '../utils/proxyClient.js'
import { getServiceUrl } from '../utils/serviceDiscovery.js'

const LABEL = 'notification-preferences'

export async function getPreferences(secret) {
  return withRetry(async () => {
    const url = getServiceUrl('notification', '/v1/preferences')
    const res = await client.get(url, {
      params: { secret },
    })
    return res.data
  }, { label: LABEL })
}

export async function patchPreferences(secret, payload) {
  return withRetry(async () => {
    const url = getServiceUrl('notification', '/v1/preferences')
    const res = await client.patch(url, payload, {
      params: { secret },
    })
    return res.data
  }, { label: LABEL })
}
