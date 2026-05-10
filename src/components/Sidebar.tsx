import type { ChatSession } from '../App'

interface Props {
  sessions: ChatSession[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  modelName: string
}

export default function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, modelName }: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <div className="brand-icon">🎨</div>
          <div>
            <div className="brand-text">OminiUI</div>
            <div className="brand-sub">HiDream Image Studio</div>
          </div>
        </div>
      </div>

      <div className="sidebar-actions">
        <button className="btn-new-chat" onClick={onNew}>
          <span>+</span> New conversation
        </button>
      </div>

      <div className="chat-list">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`chat-item ${s.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(s.id)}
          >
            <span className="chat-item-icon">💬</span>
            <span className="chat-item-title">{s.title}</span>
            <button
              className="chat-item-delete"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(s.id)
              }}
              title="Delete"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="settings-row">
          <span className="settings-label">Model</span>
          <span className="settings-value">
            {modelName ? `Ollama · ${modelName}` : 'Ollama'}
          </span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Image Engine</span>
          <span className="settings-value">HiDream-O1</span>
        </div>
      </div>
    </div>
  )
}
