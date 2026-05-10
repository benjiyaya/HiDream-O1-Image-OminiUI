const HIDREAM_URL = process.env.HIDREAM_API_URL || 'http://localhost:7860'
const IDLE_TIMEOUT_MS = parseInt(process.env.MODEL_IDLE_TIMEOUT_MS || '600000', 10)

let lastActivity = 0
let modelLoaded = true
let idleTimer: ReturnType<typeof setInterval> | null = null

export function touchActivity() {
  lastActivity = Date.now()
  if (!modelLoaded) {
    reloadModel()
  }
}

export function getModelStatus() {
  return {
    loaded: modelLoaded,
    lastActivity,
    idleMs: Date.now() - lastActivity,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
  }
}

async function unloadModel() {
  if (!modelLoaded) return
  console.log('[model-tracker] Unloading HiDream model after 10 min idle...')
  try {
    const resp = await fetch(`${HIDREAM_URL}/api/model/unload`, { method: 'POST' })
    if (resp.ok) {
      modelLoaded = false
      console.log('[model-tracker] Model unloaded successfully')
    } else {
      console.error('[model-tracker] Unload failed:', resp.status)
    }
  } catch (err) {
    console.error('[model-tracker] Unload request failed:', err)
  }
}

async function reloadModel() {
  if (modelLoaded) return
  console.log('[model-tracker] Reloading HiDream model...')
  try {
    const resp = await fetch(`${HIDREAM_URL}/api/model/reload`, { method: 'POST' })
    if (resp.ok) {
      modelLoaded = true
      console.log('[model-tracker] Model reloaded successfully')
    } else {
      console.error('[model-tracker] Reload failed:', resp.status)
    }
  } catch (err) {
    console.error('[model-tracker] Reload request failed:', err)
  }
}

export function startIdleCheck() {
  // Check every 60 seconds
  idleTimer = setInterval(() => {
    const idleMs = Date.now() - lastActivity
    if (idleMs >= IDLE_TIMEOUT_MS && modelLoaded) {
      unloadModel()
    }
  }, 60_000)

  // Initialize with current time
  lastActivity = Date.now()
  console.log('[model-tracker] Idle check started (10 min timeout)')
}

export function stopIdleCheck() {
  if (idleTimer) {
    clearInterval(idleTimer)
    idleTimer = null
  }
}
