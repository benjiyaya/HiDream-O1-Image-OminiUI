interface Props {
  msg: any
  onImageClick: (src: string) => void
  onDownload: (b64: string, name: string) => void
}

export default function MessageBubble({ msg, onImageClick, onDownload }: Props) {
  const isUser = msg.role === 'user'
  const isTool = msg.role === 'tool'
  const isAssistant = msg.role === 'assistant'

  return (
    <div className="message">
      <div className={`message-avatar ${isUser ? 'user' : 'assistant'}`}>
        {isUser ? 'U' : '✦'}
      </div>
      <div className="message-body">
        <div className="message-role">
          {isUser ? 'You' : isTool ? (msg.toolName || 'Tool') : 'Assistant'}
        </div>

        {/* User-attached images */}
        {isUser && msg.images && msg.images.length > 0 && (
          <div className="user-attached-images">
            {msg.images.map((b64: string, i: number) => (
              <div key={i} className="user-attached-thumb" onClick={() => onImageClick(`data:image/png;base64,${b64}`)}>
                <img src={`data:image/png;base64,${b64}`} alt={`Attached ${i + 1}`} />
              </div>
            ))}
          </div>
        )}

        {/* Text content */}
        {msg.content && (
          <div className="message-content">
            <p>{msg.content}</p>
          </div>
        )}

        {/* Tool call cards */}
        {msg.tool_calls?.map((tc: any, i: number) => {
          const args = JSON.parse(tc.function.arguments || '{}')
          return (
            <div key={i} className="tool-call-card">
              <div className="tool-call-header">
                <span className="tool-call-icon">
                  {tc.function.name === 'create_image' ? '🎨' : '✏️'}
                </span>
                <span className="tool-call-name">{tc.function.name}</span>
                <span className="tool-call-status">
                  <span className="status-dot" style={{ background: 'var(--accent)' }} />
                  calling
                </span>
              </div>
              <div className="tool-call-body">
                {args.prompt && (
                  <div className="tool-call-param">
                    <div className="tool-call-param-label">Prompt</div>
                    <div className="tool-call-param-value">{args.prompt}</div>
                  </div>
                )}
                {args.width && args.height && (
                  <div className="tool-call-param">
                    <div className="tool-call-param-label">Size</div>
                    <div className="tool-call-param-value">
                      {args.width} × {args.height}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Generation progress */}
        {msg.generating && (
          <div className="progress-container">
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${Math.round(((msg.progress?.step || 0) / (msg.progress?.total || 1)) * 100)}%`,
                }}
              />
            </div>
            <div className="progress-info">
              <span>
                {msg.toolName === 'create_image' ? 'Generating image' : 'Editing image'}
              </span>
              <span>
                Step {msg.progress?.step || 0} / {msg.progress?.total || '?'}
              </span>
            </div>
            {msg.progress?.preview && (
              <div className="progress-preview">
                <img
                  src={`data:image/jpeg;base64,${msg.progress.preview}`}
                  alt="Preview"
                />
              </div>
            )}
          </div>
        )}

        {/* Generated/edited image */}
        {msg.image && (
          <div className="generated-image-container">
            <img
              className="generated-image"
              src={`data:image/png;base64,${msg.image}`}
              alt={msg.prompt || 'Generated image'}
              onClick={() => onImageClick(`data:image/png;base64,${msg.image}`)}
            />
            <div className="image-actions">
              <button
                className="btn-image-action"
                onClick={() => onDownload(msg.image, `hidream-${Date.now()}.png`)}
              >
                ⬇ Download
              </button>
              <button
                className="btn-image-action"
                onClick={() => onImageClick(`data:image/png;base64,${msg.image}`)}
              >
                🔍 Full size
              </button>
            </div>
          </div>
        )}

        {/* Error indicator */}
        {msg.error && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 12px',
              background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid rgba(220, 38, 38, 0.2)',
              borderRadius: 'var(--radius-xs)',
              color: '#fca5a5',
              fontSize: 13,
            }}
          >
            {msg.content}
          </div>
        )}
      </div>
    </div>
  )
}
