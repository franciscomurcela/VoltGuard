const state = new Map()

export function updateProcessingState(sensorId, data) {
  state.set(sensorId, { ...data, updated_at: new Date().toISOString() })
}

export function getProcessingState(sensorId) {
  return state.get(sensorId) ?? null
}
