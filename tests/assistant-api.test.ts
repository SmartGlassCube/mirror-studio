import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const body = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    systemInstruction: { parts: [{ text: 'sys' }] },
    contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 999999, responseMimeType: 'application/json', topK: 3 },
    tools: [{ googleSearch: {} }],
    ...extra,
  })

const post = (handler: (r: Request) => Promise<Response>, text = body(), ip = '1.2.3.4') =>
  handler(new Request('http://x/api/assistant', { method: 'POST', body: text, headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' } }))

describe('assistant proxy', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('says when there is no shared key', async () => {
    const api = await import('../api/assistant')
    expect(await api.GET().json()).toMatchObject({ shared: false })
    expect((await post(api.POST)).status).toBe(404)
  })

  it('forwards only the allowed fields to the fixed model, then rate-limits per IP', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'server-key')
    vi.stubEnv('ASSISTANT_RATE_LIMIT', '2')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })))
    vi.stubGlobal('fetch', fetchMock)
    const api = await import('../api/assistant')

    const first = await post(api.POST)
    expect(first.status).toBe(200)
    expect((await first.json()).candidates[0].content.parts[0].text).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/models/gemini-flash-lite-latest:generateContent')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('server-key')
    const sent = JSON.parse(init.body as string)
    expect(sent.tools).toBeUndefined()
    expect(sent.generationConfig).toEqual({ temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json' })

    expect((await post(api.POST)).status).toBe(200)
    expect((await post(api.POST)).status).toBe(429)
    expect((await post(api.POST, body(), '5.6.7.8')).status).toBe(200)
  })

  it('rejects malformed requests without calling Google', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'server-key')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const api = await import('../api/assistant')
    expect((await post(api.POST, '{not json')).status).toBe(400)
    expect((await post(api.POST, JSON.stringify({ contents: [{ role: 'system', parts: [{ text: 'x' }] }] }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
