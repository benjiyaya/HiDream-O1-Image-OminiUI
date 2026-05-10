import { useState, useCallback, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Chat from './components/Chat'

export interface ChatSession {
  id: string
  title: string
  messages: any[]
  createdAt: number
}

async function apiFetch(url: string, opts?: RequestInit) {
  const resp = await fetch(url, opts)
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  return resp.json()
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [modelName, setModelName] = useState('')

  // Load sessions from DB on mount
  useEffect(() => {
    apiFetch('/api/sessions').then((rows: any[]) => {
      if (rows.length > 0) {
        const loaded = rows.map((r) => ({
          id: r.id,
          title: r.title,
          messages: [],
          createdAt: r.created_at,
        }))
        setSessions(loaded)
        setActiveId(loaded[0].id)
        // Load messages for active session
        apiFetch(`/api/sessions/${loaded[0].id}/messages`).then((msgs) => {
          setSessions((prev) =>
            prev.map((s) => (s.id === loaded[0].id ? { ...s, messages: msgs } : s)),
          )
        })
      } else {
        // Create a default session
        const id = Date.now().toString()
        apiFetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, title: 'New conversation' }),
        })
        setSessions([{ id, title: 'New conversation', messages: [], createdAt: Date.now() }])
        setActiveId(id)
      }
    })

    // Fetch model name
    apiFetch('/api/model').then((data) => setModelName(data.model)).catch(() => {})
  }, [])

  // Load messages when switching sessions
  const handleSelect = useCallback(
    (id: string) => {
      setActiveId(id)
      const session = sessions.find((s) => s.id === id)
      if (session && session.messages.length === 0) {
        apiFetch(`/api/sessions/${id}/messages`).then((msgs) => {
          setSessions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, messages: msgs } : s)),
          )
        })
      }
    },
    [sessions],
  )

  const active = sessions.find((s) => s.id === activeId) || sessions[0]

  const updateMessages = useCallback(
    (msgs: any[]) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeId) return s
          const title =
            s.title === 'New conversation' && msgs.length > 0
              ? (msgs.find((m: any) => m.role === 'user')?.content || '').slice(0, 40) || s.title
              : s.title
          // Persist title change
          if (title !== s.title) {
            apiFetch(`/api/sessions/${activeId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title }),
            }).catch(() => {})
          }
          return { ...s, messages: msgs, title }
        }),
      )
    },
    [activeId],
  )

  // Persist a single message to DB
  const persistMessage = useCallback(
    (msg: any) => {
      apiFetch(`/api/sessions/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      }).catch(() => {})
    },
    [activeId],
  )

  const newChat = useCallback(() => {
    const id = Date.now().toString()
    apiFetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: 'New conversation' }),
    }).catch(() => {})
    setSessions((prev) => [
      { id, title: 'New conversation', messages: [], createdAt: Date.now() },
      ...prev,
    ])
    setActiveId(id)
  }, [])

  const deleteChat = useCallback(
    (id: string) => {
      apiFetch(`/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {})
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id)
        if (next.length === 0) {
          const freshId = Date.now().toString()
          apiFetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: freshId, title: 'New conversation' }),
          }).catch(() => {})
          setActiveId(freshId)
          return [{ id: freshId, title: 'New conversation', messages: [], createdAt: Date.now() }]
        }
        if (activeId === id) setActiveId(next[0].id)
        return next
      })
    },
    [activeId],
  )

  return (
    <div className="app">
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={newChat}
        onDelete={deleteChat}
        modelName={modelName}
      />
      {active && (
        <Chat
          key={activeId}
          sessionId={activeId}
          messages={active.messages}
          onUpdateMessages={updateMessages}
          onPersistMessage={persistMessage}
          onNewChat={newChat}
        />
      )}
    </div>
  )
}
