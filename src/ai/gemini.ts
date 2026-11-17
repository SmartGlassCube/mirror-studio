// Gemini (Google AI Studio) client. With the user's own key, the browser calls Google directly
// and the key never leaves it; otherwise requests go through /api/assistant, which holds the
// project's shared key and rate-limits it.

export const DEFAULT_MODEL = 'gemini-flash-lite-latest'
const SETTINGS_KEY = 'smart-mirror-studio:gemini'

export type GeminiSettings = { apiKey: string; model: string }

export function loadGeminiSettings(): GeminiSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
    return { apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '', model: typeof raw.model === 'string' && raw.model ? raw.model : DEFAULT_MODEL }
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL }
  }
}

export function saveGeminiSettings(settings: GeminiSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* private mode: the key just won't be remembered */
  }
}

export type ChatTurn = { role: 'user' | 'model'; text: string }

export type GenerateOptions = {
  system: string
  turns: ChatTurn[]
  json?: boolean
  temperature?: number
  signal?: AbortSignal
}

export class AssistantError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

export async function generate({ system, turns, json, temperature = 0.4, signal }: GenerateOptions): Promise<string> {
  const settings = loadGeminiSettings()
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: { temperature, maxOutputTokens: 8192, ...(json ? { responseMimeType: 'application/json' } : {}) },
  }
  const ownKey = settings.apiKey.trim()
  let response: Response
  try {
    response = ownKey
      ? await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': ownKey },
          body: JSON.stringify(body),
          signal,
        })
      : await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new AssistantError('Could not reach the assistant. Check your connection.')
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.error ?? `The assistant answered ${response.status}.`
    if (response.status === 429 && !ownKey) {
      throw new AssistantError(`${message} Add your own free Google AI Studio key in the assistant settings to keep going.`, 429)
    }
    if (response.status === 404 && !ownKey) {
      throw new AssistantError('The shared assistant isn\'t available on this deployment. Add your own Google AI Studio key in the assistant settings.', 404)
    }
    throw new AssistantError(String(message), response.status)
  }
  const text = (payload?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) {
    const reason = payload?.candidates?.[0]?.finishReason ?? payload?.promptFeedback?.blockReason
    throw new AssistantError(reason ? `The model returned nothing (${reason}).` : 'The model returned nothing.')
  }
  return text
}
