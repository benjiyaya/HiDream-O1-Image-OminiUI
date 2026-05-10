import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { chatHandler, modelInfoHandler } from './chat.js'
import { generateHandler, streamHandler } from './generate.js'
import { refinePrompt } from './prompt-refine.js'
import { getModelStatus, startIdleCheck } from './model-tracker.js'
import {
  createSession,
  getSessions,
  getMessages,
  saveMessage,
  renameSession,
  removeSession,
  clearSessionMessages,
} from './db.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '100mb' }))

// Log incoming requests for debugging
app.use((req, _res, next) => {
  if (req.method === 'POST') {
    const contentLength = req.headers['content-length']
    if (contentLength) {
      const mb = (parseInt(contentLength) / 1024 / 1024).toFixed(1)
      console.log(`[req] ${req.method} ${req.url} — ${mb}MB`)
    }
  }
  next()
})

const PORT = parseInt(process.env.PORT || '3001', 10)

// ── Chat & Generation ────────────────────────────────────────────────
app.post('/api/chat', chatHandler)
app.post('/api/generate', generateHandler)
app.get('/api/generate/stream/:jobId', streamHandler)

// ── Model info ───────────────────────────────────────────────────────
app.get('/api/model', modelInfoHandler)
app.get('/api/model/status', (_req, res) => {
  res.json(getModelStatus())
})

// ── Prompt refinement ────────────────────────────────────────────────
app.post('/api/refine', async (req, res) => {
  try {
    const { prompt } = req.body
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Missing prompt' })
      return
    }
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    const apiKey = process.env.OPENAI_API_KEY || ''
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    if (!apiKey) {
      res.status(400).json({ error: 'OPENAI_API_KEY not configured in .env' })
      return
    }
    const result = await refinePrompt(prompt, baseUrl, apiKey, model)
    res.json(result)
  } catch (err: any) {
    console.error('[refine]', err)
    res.status(500).json({ error: err.message || 'Refine failed' })
  }
})

// ── Session CRUD ─────────────────────────────────────────────────────
app.get('/api/sessions', (_req, res) => {
  res.json(getSessions())
})

app.post('/api/sessions', (req, res) => {
  const { id, title } = req.body
  createSession(id, title || 'New conversation')
  res.json({ ok: true })
})

app.put('/api/sessions/:id', (req, res) => {
  const { title } = req.body
  renameSession(req.params.id, title)
  res.json({ ok: true })
})

app.delete('/api/sessions/:id', (req, res) => {
  removeSession(req.params.id)
  res.json({ ok: true })
})

// ── Message CRUD ─────────────────────────────────────────────────────
app.get('/api/sessions/:id/messages', (req, res) => {
  res.json(getMessages(req.params.id))
})

app.post('/api/sessions/:id/messages', (req, res) => {
  saveMessage(req.params.id, req.body)
  res.json({ ok: true })
})

app.delete('/api/sessions/:id/messages', (req, res) => {
  clearSessionMessages(req.params.id)
  res.json({ ok: true })
})

// ── Start ────────────────────────────────────────────────────────────
startIdleCheck()

app.listen(PORT, () => {
  console.log(`[OminiUI server] listening on http://localhost:${PORT}`)
})
