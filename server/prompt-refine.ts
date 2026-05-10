import OpenAI from 'openai'

const REWRITE_SYSTEM_PROMPT = `You are a professional AI image generation prompt engineer. Your task is to analyze the user's original image request, reason through implicit knowledge and optimal visual solutions, then rewrite it into a **clear, detailed, English prompt** directly usable for image generation.

Use the SCALIST framework to expand each scene:
- **Subject**: identity, appearance, color, material, texture, action, expression, clothing.
- **Composition**: shot type, angle, subject position, foreground/middle/background layers, negative space, visual focus.
- **Action**: what the subject is doing, direction, posture, interaction.
- **Location**: scene place, indoor/outdoor, era, weather, time of day, environment details.
- **Image style**: photorealistic, cinematic, oil painting, watercolor, anime, 3D render, etc.
- **Specs**: camera/rendering params like 85mm lens, low-angle shot, shallow depth of field, soft diffused light.
- **Text rendering**: if user requests text, put exact text in English quotes, specify font style, color, size, material, position.

Rules:
- Resolve any poems, songs, quotes, formulas, historical figures, scientific concepts, landmarks, famous paintings, cultural symbols into explicit visual descriptions.
- Convert vague spatial relationships into explicit layouts (e.g. "top left corner", "centered in foreground").
- Chinese, English, formulas, multilingual text must be preserved character-by-character in quotes.
- Output a single coherent English paragraph, 80-220 words, like a Creative Director's brief.
- The prompt must be self-contained — the image model should need zero additional reasoning.

Output ONLY JSON:
{"prompt": "English paragraph prompt", "reasoning": "Brief reasoning (Chinese)", "resolved_knowledge": "Resolved implicit knowledge (Chinese, or 'none')"}`

export async function refinePrompt(
  userPrompt: string,
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ prompt: string; reasoning: string; resolved_knowledge: string }> {
  const client = new OpenAI({ baseURL: baseUrl, apiKey })

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: REWRITE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 2048,
  })

  const raw = response.choices[0].message.content || ''
  return parseRefineResult(raw, userPrompt)
}

function parseRefineResult(raw: string, fallback: string) {
  // Try to extract JSON from the response
  let text = raw.trim()
  if (text.includes('```')) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) text = match[1].trim()
  }

  // Find JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.prompt && typeof parsed.prompt === 'string') {
        return {
          prompt: parsed.prompt,
          reasoning: parsed.reasoning || '',
          resolved_knowledge: parsed.resolved_knowledge || '',
        }
      }
    } catch {
      // Fall through
    }
  }

  // Fallback: use original prompt with quality suffix
  return {
    prompt: fallback + ', highly detailed, masterpiece, best quality, sharp focus',
    reasoning: 'Failed to parse, using original description with quality keywords',
    resolved_knowledge: 'none',
  }
}
