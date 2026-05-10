import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'ominiui.db')

// Ensure data directory exists
import fs from 'fs'
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New conversation',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT,
    tool_calls TEXT,
    tool_call_id TEXT,
    tool_name TEXT,
    image TEXT,
    image_path TEXT,
    images TEXT,
    prompt TEXT,
    error INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
`)

// Migration: add images column if missing (existing databases)
try {
  db.exec(`ALTER TABLE messages ADD COLUMN images TEXT`)
} catch {
  // Column already exists, ignore
}

// ── Session queries ──────────────────────────────────────────────────

const insertSession = db.prepare(
  'INSERT OR REPLACE INTO sessions (id, title, created_at) VALUES (?, ?, ?)'
)

const selectSessions = db.prepare(
  'SELECT * FROM sessions ORDER BY created_at DESC'
)

const updateSessionTitle = db.prepare(
  'UPDATE sessions SET title = ? WHERE id = ?'
)

const deleteSession = db.prepare('DELETE FROM sessions WHERE id = ?')
const deleteSessionMessages = db.prepare('DELETE FROM messages WHERE session_id = ?')

// ── Message queries ──────────────────────────────────────────────────

const insertMessage = db.prepare(`
  INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, tool_name, image, image_path, images, prompt, error, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const selectMessages = db.prepare(
  'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'
)

// ── Public API ───────────────────────────────────────────────────────

export function createSession(id: string, title: string) {
  insertSession.run(id, title, Date.now())
}

export function getSessions() {
  return selectSessions.all()
}

export function renameSession(id: string, title: string) {
  updateSessionTitle.run(title, id)
}

export function removeSession(id: string) {
  deleteSessionMessages.run(id)
  deleteSession.run(id)
}

export function saveMessage(sessionId: string, msg: any) {
  insertMessage.run(
    sessionId,
    msg.role,
    msg.content || null,
    msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
    msg.tool_call_id || null,
    msg.toolName || null,
    msg.image || null,
    msg.imagePath || null,
    msg.images ? JSON.stringify(msg.images) : null,
    msg.prompt || null,
    msg.error ? 1 : 0,
    Date.now(),
  )
}

export function getMessages(sessionId: string): any[] {
  const rows = selectMessages.all(sessionId) as any[]
  return rows.map((r) => {
    const msg: any = {
      role: r.role,
      content: r.content,
    }
    if (r.tool_calls) msg.tool_calls = JSON.parse(r.tool_calls)
    if (r.tool_call_id) msg.tool_call_id = r.tool_call_id
    if (r.tool_name) msg.toolName = r.tool_name
    if (r.image) msg.image = r.image
    if (r.image_path) msg.imagePath = r.image_path
    if (r.images) msg.images = JSON.parse(r.images)
    if (r.prompt) msg.prompt = r.prompt
    if (r.error) msg.error = true
    return msg
  })
}

export function clearSessionMessages(sessionId: string) {
  deleteSessionMessages.run(sessionId)
}

export default db
