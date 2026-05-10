import type { Request, Response } from 'express'
import OpenAI from 'openai'
import { imageTools } from './tools.js'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: any[]
  tool_call_id?: string
  name?: string
}

const SYSTEM_PROMPT = `You are OminiUI, an AI creative assistant powered by HiDream-O1-Image. You help users create and edit images through natural conversation.

## Your capabilities
- **create_image**: Generate new images from text descriptions (no images attached)
- **edit_image**: Edit ONE image the user has attached — the user's attached image is used automatically
- **subject_driven_image**: Generate images using 2-6 attached reference images for subject-driven personalization — the user's attached images are used automatically

## Important: How images work
- The user can attach up to 6 images. You do NOT need to pass image data in tool arguments — the system attaches them automatically.
- If the user attached 1 image → use edit_image
- If the user attached 2-6 images → use subject_driven_image
- If no images attached → use create_image
- You should NOT ask the user to "pass" or "send" images. They are already attached.

## Guidelines
- When the user asks to create, generate, or draw an image with no attachments, call create_image.
- When the user has attached 1 image and asks to edit, modify, or transform it, call edit_image.
- When the user has attached 2-6 images and wants to generate a new scene featuring those subjects, call subject_driven_image.
- Always write rich, detailed prompts in English following the SCALIST framework: Subject, Composition, Action, Location, Image style, Specs, Text rendering.
- If the user writes in another language, still produce the image prompt in English.
- Be conversational and helpful. Explain what you're about to create before calling a tool.
- After an image is generated, describe what was created and offer to make adjustments.
- For text rendering in images, put the exact text in quotes and specify font, color, size, and position.`

function getClient(): OpenAI {
  const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1'
  const apiKey = process.env.OLLAMA_API_KEY || 'ollama'
  return new OpenAI({ baseURL, apiKey })
}

export function getModelName(): string {
  return process.env.OLLAMA_MODEL || 'qwen3.6:27b-bf16'
}

export async function chatHandler(req: Request, res: Response) {
  try {
    const { messages, model: userModel } = req.body as {
      messages: ChatMessage[]
      model?: string
    }

    const model = userModel || getModelName()
    const client = getClient()

    // Filter and sanitize messages for Ollama compatibility
    // - Ollama requires non-null content on all messages
    // - Ollama doesn't support 'tool' role, skip those
    const cleanMessages: ChatMessage[] = messages
      .filter((m) => m.role !== 'tool')
      .map((m) => ({
        ...m,
        content: m.content || '',
      }))

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...cleanMessages,
    ]

    const completion = await client.chat.completions.create({
      model,
      messages: fullMessages as any,
      tools: imageTools as any,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 4096,
    })

    const choice = completion.choices[0]
    const message = choice.message

    res.json({
      role: message.role,
      content: message.content,
      tool_calls: message.tool_calls || undefined,
    })
  } catch (err: any) {
    console.error('[chat]', err)
    res.status(500).json({ error: err.message || 'Chat failed' })
  }
}

// Endpoint to get the current model name
export async function modelInfoHandler(_req: Request, res: Response) {
  res.json({ model: getModelName() })
}
