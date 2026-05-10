import { useState, useRef, useEffect, useCallback } from 'react'
import MessageBubble from './MessageBubble'

interface Props {
  sessionId: string
  messages: any[]
  onUpdateMessages: (msgs: any[]) => void
  onPersistMessage: (msg: any) => void
  onNewChat: () => void
}

const WELCOME_CHIPS = [
  'A cat astronaut floating in space',
  'Edit my photo to look like a painting',
  'A cyberpunk city at sunset, neon lights',
  'Turn this sketch into a realistic photo',
]

export default function Chat({ sessionId, messages, onUpdateMessages, onPersistMessage, onNewChat }: Props) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [error, setError] = useState('')
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [refineEnabled, setRefineEnabled] = useState(false)
  const [refining, setRefining] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  useEffect(() => autoResize(), [input, autoResize])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const remaining = 6 - uploadedImages.length
    if (remaining <= 0) {
      setError('Maximum 6 images allowed')
      e.target.value = ''
      return
    }
    const toAdd = files.slice(0, remaining)
    toAdd.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const b64 = (reader.result as string).split(',')[1]
        setUploadedImages((prev) => {
          if (prev.length >= 6) return prev
          return [...prev, b64]
        })
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeUpload = (idx: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== idx))
  }

  const refinePromptText = async (text: string): Promise<string> => {
    setRefining(true)
    try {
      const resp = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Refine failed' }))
        console.warn('[refine]', err.error)
        return text // Fall back to original
      }
      const data = await resp.json()
      return data.prompt || text
    } catch (err) {
      console.warn('[refine]', err)
      return text
    } finally {
      setRefining(false)
    }
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    setError('')

    // Optionally refine the prompt
    let finalText = text
    if (refineEnabled) {
      finalText = await refinePromptText(text)
    }

    const userMsg: any = { role: 'user', content: finalText }
    if (uploadedImages.length > 0) {
      userMsg.images = uploadedImages
      console.log(`[chat] Sending ${uploadedImages.length} attached images`)
    }

    const newMessages = [...messages, userMsg]
    onUpdateMessages(newMessages)
    onPersistMessage(userMsg)
    setInput('')
    setUploadedImages([])
    setLoading(true)

    try {
      // Build API messages (strip internal fields, ensure non-null content)
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content || '',
      }))

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || `HTTP ${resp.status}`)
      }

      const data = await resp.json()

      if (data.tool_calls && data.tool_calls.length > 0) {
        // Assistant message with tool calls
        const assistantMsg = {
          role: 'assistant',
          content: data.content || '',
          tool_calls: data.tool_calls,
        }
        let accumulated = [...newMessages, assistantMsg]
        onUpdateMessages(accumulated)
        onPersistMessage(assistantMsg)

        // Execute each tool call sequentially
        // Images always come from the user's uploads — LLM can't provide base64
        const lastUserMsg = [...newMessages].reverse().find((m) => m.role === 'user')
        const attachedImages: string[] = lastUserMsg?.images || []

        for (const tc of data.tool_calls) {
          const toolName = tc.function.name
          const args = JSON.parse(tc.function.arguments)

          let toolResult: any
          if (toolName === 'create_image') {
            toolResult = await executeCreateImage(args, accumulated)
          } else if (toolName === 'edit_image') {
            // Edit: always use the first attached image
            const editImage = attachedImages[0] || args.image
            toolResult = await executeEditImage({ ...args, image: editImage }, accumulated)
          } else if (toolName === 'subject_driven_image') {
            // Subject-driven: always use attached images (2-6)
            toolResult = await executeSubjectImage({ ...args, ref_images: attachedImages }, accumulated)
          }

          if (toolResult) {
            accumulated = [...accumulated, toolResult]
            onUpdateMessages(accumulated)
            onPersistMessage(toolResult)
          }
        }

        // Get follow-up from the model after tool results
        // Filter out tool messages and ensure non-null content for Ollama
        const followUpResp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: accumulated
              .filter((m: any) => m.role !== 'tool')
              .map((m: any) => ({
                role: m.role,
                content: m.content || '',
              })),
          }),
        })

        if (followUpResp.ok) {
          const followUpData = await followUpResp.json()
          if (followUpData.content) {
            const followMsg = { role: 'assistant', content: followUpData.content }
            onUpdateMessages([...accumulated, followMsg])
            onPersistMessage(followMsg)
          }
        }
      } else {
        // Plain text response
        const assistantMsg = { role: 'assistant', content: data.content || '' }
        onUpdateMessages([...newMessages, assistantMsg])
        onPersistMessage(assistantMsg)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const executeCreateImage = async (args: any, currentMsgs: any[]) => {
    // Add progress message
    const progressMsg = {
      role: 'assistant' as const,
      content: '',
      tool_call_id: 'create_image',
      toolName: 'create_image',
      generating: true,
      progress: { step: 0, total: 28, preview: null },
    }
    onUpdateMessages([...currentMsgs, progressMsg])

    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 't2i',
          prompt: args.prompt,
          width: args.width || 2048,
          height: args.height || 2048,
          seed: args.seed || 32,
        }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Generation failed' }))
        throw new Error(err.error)
      }

      const { image, imagePath } = await resp.json()
      return {
        role: 'tool' as const,
        content: `Image generated successfully.`,
        tool_call_id: 'create_image',
        toolName: 'create_image',
        image,
        imagePath,
        prompt: args.prompt,
      }
    } catch (err: any) {
      return {
        role: 'tool' as const,
        content: `Error: ${err.message}`,
        tool_call_id: 'create_image',
        toolName: 'create_image',
        error: true,
      }
    }
  }

  const executeEditImage = async (args: any, currentMsgs: any[]) => {
    const progressMsg = {
      role: 'assistant' as const,
      content: '',
      tool_call_id: 'edit_image',
      toolName: 'edit_image',
      generating: true,
      progress: { step: 0, total: 28, preview: null },
    }
    onUpdateMessages([...currentMsgs, progressMsg])

    try {
      console.log(`[edit] image present: ${!!args.image}`)
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'edit',
          prompt: args.prompt,
          refs_b64: [args.image],
          width: args.width || 2048,
          height: args.height || 2048,
          seed: args.seed || 32,
          keep_original_aspect: args.keep_original_aspect || false,
        }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Edit failed' }))
        throw new Error(err.error)
      }

      const { image, imagePath } = await resp.json()
      return {
        role: 'tool' as const,
        content: `Image edited successfully.`,
        tool_call_id: 'edit_image',
        toolName: 'edit_image',
        image,
        imagePath,
        prompt: args.prompt,
      }
    } catch (err: any) {
      return {
        role: 'tool' as const,
        content: `Error: ${err.message}`,
        tool_call_id: 'edit_image',
        toolName: 'edit_image',
        error: true,
      }
    }
  }

  const executeSubjectImage = async (args: any, currentMsgs: any[]) => {
    const progressMsg = {
      role: 'assistant' as const,
      content: '',
      tool_call_id: 'subject_driven_image',
      toolName: 'subject_driven_image',
      generating: true,
      progress: { step: 0, total: 28, preview: null },
    }
    onUpdateMessages([...currentMsgs, progressMsg])

    try {
      const refImages: string[] = args.ref_images || []
      console.log(`[subject] ref_images count: ${refImages.length}`)
      if (refImages.length < 2) {
        throw new Error('Subject-driven generation requires at least 2 reference images')
      }
      if (refImages.length > 6) {
        throw new Error('Subject-driven generation supports a maximum of 6 reference images')
      }

      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'subject',
          prompt: args.prompt,
          refs_b64: refImages,
          width: args.width || 2048,
          height: args.height || 2048,
          seed: args.seed || 32,
        }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Subject generation failed' }))
        throw new Error(err.error)
      }

      const { image, imagePath } = await resp.json()
      return {
        role: 'tool' as const,
        content: `Image generated successfully with ${refImages.length} reference images.`,
        tool_call_id: 'subject_driven_image',
        toolName: 'subject_driven_image',
        image,
        imagePath,
        prompt: args.prompt,
      }
    } catch (err: any) {
      return {
        role: 'tool' as const,
        content: `Error: ${err.message}`,
        tool_call_id: 'subject_driven_image',
        toolName: 'subject_driven_image',
        error: true,
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleChip = (text: string) => {
    setInput(text)
    textareaRef.current?.focus()
  }

  const downloadImage = (b64: string, name: string) => {
    const a = document.createElement('a')
    a.href = `data:image/png;base64,${b64}`
    a.download = name
    a.click()
  }

  return (
    <div className="main">
      <div className="chat-header">
        <div className="chat-header-title">OminiUI</div>
        <div className="chat-header-status">
          <span className="status-dot" />
          HiDream-O1-Image ready
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="welcome">
          <div className="welcome-content">
            <div className="welcome-icon">🎨</div>
            <div className="welcome-title">What shall we create?</div>
            <div className="welcome-sub">
              Describe an image to generate, or upload a photo to edit.
              I use HiDream-O1-Image powered by local Ollama reasoning.
            </div>
            <div className="welcome-chips">
              {WELCOME_CHIPS.map((c) => (
                <button key={c} className="welcome-chip" onClick={() => handleChip(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="messages" ref={scrollRef}>
          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              msg={msg}
              onImageClick={setLightboxSrc}
              onDownload={downloadImage}
            />
          ))}
          {loading && (
            <div className="message">
              <div className="message-avatar assistant">✦</div>
              <div className="message-body">
                <div className="message-role">Assistant</div>
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="input-area">
        <div className="input-wrapper">
          {uploadedImages.length > 0 && (
            <div className="upload-preview">
              {uploadedImages.map((b64, i) => (
                <div key={i} className="upload-thumb">
                  <img src={`data:image/png;base64,${b64}`} alt="Upload" />
                  <button className="upload-thumb-remove" onClick={() => removeUpload(i)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="input-tools">
            <button
              className="btn-tool"
              onClick={() => fileRef.current?.click()}
              disabled={uploadedImages.length >= 6}
              title={uploadedImages.length >= 6 ? 'Maximum 6 images' : 'Attach up to 6 images (edit: 1, subject: 2-6)'}
            >
              📎 {uploadedImages.length > 0 ? `${uploadedImages.length}/6 images` : 'Attach images'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              className={`btn-tool ${refineEnabled ? 'active' : ''}`}
              onClick={() => setRefineEnabled(!refineEnabled)}
              title="Enhance prompt with AI before sending"
            >
              ✨ {refining ? 'Refining...' : 'Enhance Prompt'}
            </button>
          </div>
          <div className="input-box">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe an image to create, or upload a photo and describe edits..."
              rows={1}
            />
            <button
              className="btn-send"
              onClick={sendMessage}
              disabled={!input.trim() || loading || refining}
              title="Send"
            >
              →
            </button>
          </div>
          <div className="input-hint">
            Press Enter to send · Shift+Enter for new line
            {refineEnabled && ' · ✨ Prompt enhancement ON'}
          </div>
        </div>
      </div>

      {error && <div className="error-toast" onClick={() => setError('')}>{error}</div>}

      {lightboxSrc && (
        <div className="lightbox" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="Full size" />
        </div>
      )}
    </div>
  )
}
