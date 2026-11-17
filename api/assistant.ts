// Vercel Function: forwards the studio's assistant requests to Gemini with the site's own key
// (GEMINI_API_KEY), so visitors can try the assistant without one. Users who add their own key
// in the studio call Google directly and never come through here.
//
// Guard rails: only the fields the studio sends are forwarded, the model is fixed server-side,
// output is capped, and each IP gets ASSISTANT_RATE_LIMIT requests per hour. The limit is kept in
// the function instance's memory, so it is per instance and resets on cold starts: fine to stop
// casual overuse, not a hard quota. Use Vercel KV / Upstash for a strict one.

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'
const LIMIT = Number(process.env.ASSISTANT_RATE_LIMIT) || 30
const WINDOW_MS = 60 * 60 * 1000
const MAX_BODY_BYTES = 200_000
const MAX_OUTPUT_TOKENS = 8192

const hits = new Map<string, number[]>()

function rateLimited(ip: string, now: number) {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= LIMIT) {
    hits.set(ip, recent)
    return Math.ceil((recent[0] + WINDOW_MS - now) / 60000)
  }
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key)
  }
  return 0
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })

type Part = { text: string }
type Content = { role: 'user' | 'model'; parts: Part[] }

function sanitize(body: unknown) {
  if (!body || typeof body !== 'object') return null
  const { systemInstruction, contents, generationConfig } = body as Record<string, unknown>
  const textParts = (value: unknown): Part[] | null =>
    Array.isArray(value) && value.every((p) => p && typeof p === 'object' && typeof (p as Part).text === 'string') ? (value as Part[]).map((p) => ({ text: p.text })) : null
  if (!Array.isArray(contents) || contents.length === 0 || contents.length > 60) return null
  const cleanContents: Content[] = []
  for (const c of contents) {
    const parts = textParts((c as Content)?.parts)
    const role = (c as Content)?.role
    if (!parts || (role !== 'user' && role !== 'model')) return null
    cleanContents.push({ role, parts })
  }
  const system = systemInstruction ? textParts((systemInstruction as { parts?: unknown }).parts) : null
  const config = (generationConfig ?? {}) as Record<string, unknown>
  return {
    ...(system ? { systemInstruction: { parts: system } } : {}),
    contents: cleanContents,
    generationConfig: {
      temperature: typeof config.temperature === 'number' ? Math.max(0, Math.min(1.5, config.temperature)) : 0.4,
      maxOutputTokens: Math.min(MAX_OUTPUT_TOKENS, Number(config.maxOutputTokens) || MAX_OUTPUT_TOKENS),
      ...(config.responseMimeType === 'application/json' ? { responseMimeType: 'application/json' } : {}),
    },
  }
}

// GET: does this deployment offer the shared assistant?
export function GET() {
  return json(200, { shared: Boolean(process.env.GEMINI_API_KEY), model: MODEL, limitPerHour: LIMIT })
}

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return json(404, { error: 'No shared assistant on this deployment.' })

  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY_BYTES) return json(413, { error: 'Request too large.' })
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return json(413, { error: 'Request too large.' })

  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
  const wait = rateLimited(ip, Date.now())
  if (wait) return json(429, { error: `The shared assistant's hourly limit is reached (try again in ${wait} min).` }, { 'retry-after': String(wait * 60) })

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json(400, { error: 'Invalid JSON.' })
  }
  const clean = sanitize(body)
  if (!clean) return json(400, { error: 'Unexpected request shape.' })

  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(clean),
  })
  const payload = await upstream.json().catch(() => null)
  if (!upstream.ok) {
    // Don't echo Google's error details (they can mention the key's project); keep the status.
    const status = upstream.status === 429 ? 429 : 502
    return json(status, { error: status === 429 ? 'The shared assistant is busy right now. Try again in a minute.' : 'The assistant service failed. Try again.' })
  }
  return json(200, { candidates: payload?.candidates ?? [], promptFeedback: payload?.promptFeedback })
}
