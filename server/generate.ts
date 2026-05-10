import type { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { touchActivity } from './model-tracker.js'

const HIDREAM_URL = process.env.HIDREAM_API_URL || 'http://localhost:7860'
const RESULTS_DIR = path.resolve(process.env.HIDREAM_RESULTS_DIR || path.join('..', 'HiDream-O1-Image', 'results'))

// Ensure results directory exists
fs.mkdirSync(RESULTS_DIR, { recursive: true })

// In-memory job store for SSE streaming
const jobs = new Map<string, EventEmitter>()

interface GenerateParams {
  mode: 't2i' | 'edit' | 'subject'
  prompt: string
  refs_b64?: string[]
  width?: number
  height?: number
  seed?: number
  keep_original_aspect?: boolean
}

function timestampFilename(): string {
  const now = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const rand = Math.random().toString(36).slice(2, 8)
  return `img_${ts}_${rand}.png`
}

function saveImageToResults(base64Png: string): string {
  const filename = timestampFilename()
  const filepath = path.join(RESULTS_DIR, filename)
  fs.writeFileSync(filepath, Buffer.from(base64Png, 'base64'))
  console.log(`[generate] Saved -> ${filepath}`)
  return filepath
}

async function callHiDream(params: GenerateParams): Promise<{ image: string; imagePath: string }> {
  // Mark model activity
  touchActivity()

  const refsCount = (params.refs_b64 || []).length
  console.log(`[generate] Starting: mode=${params.mode} refs=${refsCount} prompt="${params.prompt.slice(0, 60)}..."`)

  // Step 1: start the job
  const body = JSON.stringify({
    mode: params.mode,
    prompt: params.prompt,
    refs_b64: params.refs_b64 || [],
    width: params.width || 2048,
    height: params.height || 2048,
    seed: params.seed || 32,
    keep_original_aspect: params.keep_original_aspect || false,
  })

  console.log(`[generate] Payload size: ${(body.length / 1024 / 1024).toFixed(1)}MB`)

  const startResp = await fetch(`${HIDREAM_URL}/api/generate/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!startResp.ok) {
    const errText = await startResp.text()
    console.error(`[generate] HiDream returned ${startResp.status}: ${errText.slice(0, 500)}`)
    throw new Error(`HiDream ${startResp.status}: ${errText.slice(0, 200)}`)
  }

  const { job_id } = (await startResp.json()) as { job_id: string }

  // Step 2: stream SSE from HiDream and forward progress
  return new Promise<{ image: string; imagePath: string }>((resolve, reject) => {
    const emitter = new EventEmitter()
    jobs.set(job_id, emitter)

    const streamUrl = `${HIDREAM_URL}/api/generate/stream/${job_id}`

    fetch(streamUrl).then(async (streamResp) => {
      if (!streamResp.ok) {
        reject(new Error(`HiDream stream failed: ${streamResp.status}`))
        return
      }

      const reader = streamResp.body?.getReader()
      if (!reader) {
        reject(new Error('No stream body'))
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = JSON.parse(line.slice(6))

            if (data.type === 'progress') {
              emitter.emit('progress', {
                step: data.step,
                total: data.total,
                preview: data.preview || null,
              })
            } else if (data.type === 'done') {
              // Auto-save to results folder
              const imagePath = saveImageToResults(data.image)
              emitter.emit('done', { image: data.image, imagePath })
              jobs.delete(job_id)
              resolve({ image: data.image, imagePath })
            } else if (data.type === 'error') {
              emitter.emit('error', data.message)
              jobs.delete(job_id)
              reject(new Error(data.message))
            }
          }
        }
      } catch (e: any) {
        jobs.delete(job_id)
        reject(e)
      }
    }).catch((e) => {
      jobs.delete(job_id)
      reject(e)
    })
  })
}

// Direct generation endpoint (returns final result)
export async function generateHandler(req: Request, res: Response) {
  try {
    const params = req.body as GenerateParams
    console.log(`[generate] Request: mode=${params.mode} refs=${(params.refs_b64 || []).length} prompt="${(params.prompt || '').slice(0, 80)}"`)
    const { image, imagePath } = await callHiDream(params)
    res.json({ image, imagePath })
  } catch (err: any) {
    console.error('[generate] Error:', err.message)
    res.status(500).json({ error: err.message || 'Generation failed' })
  }
}

// SSE streaming endpoint for progress
export async function streamHandler(req: Request, res: Response) {
  const { jobId } = req.params
  const emitter = jobs.get(jobId)
  if (!emitter) {
    res.status(404).json({ error: 'Unknown job' })
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  const onProgress = (data: any) => {
    res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`)
  }
  const onDone = (result: any) => {
    res.write(`data: ${JSON.stringify({ type: 'done', image: result.image, imagePath: result.imagePath })}\n\n`)
    res.end()
  }
  const onError = (msg: string) => {
    res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`)
    res.end()
  }

  emitter.on('progress', onProgress)
  emitter.on('done', onDone)
  emitter.on('error', onError)

  req.on('close', () => {
    emitter.off('progress', onProgress)
    emitter.off('done', onDone)
    emitter.off('error', onError)
  })
}

// Export for use by chat handler
export { callHiDream, jobs }
