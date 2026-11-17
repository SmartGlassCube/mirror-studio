import { Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Field } from '../components/fields'
import { useStudio } from '../store'
import { applyActions, builderSystemPrompt, describeAction, parseReply, type Action } from './actions'
import { AssistantError, DEFAULT_MODEL, generate, loadGeminiSettings, saveGeminiSettings, type ChatTurn } from './gemini'

type Message = { role: 'user' | 'bot'; text: string; actions?: Action[]; applied?: boolean; error?: boolean; raw?: string }

const SUGGESTIONS = [
  'Add a page with a clock and the weather in Tokyo, reached with a two-finger swipe up',
  'Make a countdown widget to New Year and put it on the home page',
  'Which gestures leave the home page?',
  'Add a "back home" gesture that works on every page',
]

export default function AssistantPanel() {
  const { toggleAssistant, applyProject } = useStudio.getState()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', text: 'Hi! Tell me what your mirror should show and how to move between pages. I propose changes; you apply them (and can undo).' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState(loadGeminiSettings)
  const [shared, setShared] = useState<boolean | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/assistant')
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => setShared(Boolean(info?.shared)))
      .catch(() => setShared(false))
  }, [])

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const send = async (text: string) => {
    if (!text.trim() || busy) return
    if (shared === false && !loadGeminiSettings().apiKey.trim()) {
      setShowSettings(true)
      return
    }
    const next: Message[] = [...messages, { role: 'user', text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    abort.current = new AbortController()
    try {
      // The model sees the conversation, with its earlier JSON answers, and the current project.
      const turns: ChatTurn[] = next.slice(1).filter((m) => !m.error).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.role === 'bot' ? (m.raw ?? m.text) : m.text }))
      const raw = await generate({ system: builderSystemPrompt(useStudio.getState().project), turns, json: true, signal: abort.current.signal })
      const reply = parseReply(raw)
      setMessages((m) => [...m, { role: 'bot', text: reply.reply || (reply.actions.length ? 'Here is the plan:' : '…'), actions: reply.actions, raw }])
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessages((m) => [...m, { role: 'bot', text: error instanceof AssistantError ? error.message : String(error), error: true }])
      }
    } finally {
      setBusy(false)
    }
  }

  const apply = (index: number) => {
    const message = messages[index]
    if (!message.actions) return
    const { project, errors } = applyActions(useStudio.getState().project, message.actions)
    applyProject(project)
    setMessages((m) => [
      ...m.map((x, i) => (i === index ? { ...x, applied: true } : x)),
      ...(errors.length ? [{ role: 'bot' as const, text: `Applied, but some steps were skipped:\n• ${errors.join('\n• ')}`, error: true }] : []),
    ])
  }

  const usingOwnKey = settings.apiKey.trim().length > 0

  return (
    <aside className="assistant">
      <div className="inspector-head">
        <span className="type-icon" style={{ '--tone': 'var(--violet)', width: 30, height: 30 } as React.CSSProperties}>
          <Sparkles size={16} />
        </span>
        <h3>Assistant</h3>
        <button className="btn btn--small" onClick={() => setShowSettings((v) => !v)}>
          {showSettings ? 'Chat' : 'Settings'}
        </button>
        <button className="icon-btn" onClick={() => toggleAssistant(false)} aria-label="Close assistant">
          <X size={18} />
        </button>
      </div>

      {showSettings ? (
        <div className="inspector-body" style={{ overflowY: 'auto' }}>
          <p className="hint" style={{ marginTop: 0 }}>
            {usingOwnKey
              ? 'Using your own key: requests go from this browser straight to Google.'
              : shared
                ? 'Using the shared key of this site, with a limit per hour. Add your own free key to skip it.'
                : 'This deployment has no shared key: add your own free key to use the assistant.'}
          </p>
          <Field label="Your Google AI Studio key" hint={<>Free at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>. Stored only in this browser, never in exported projects.</>}>
            <input className="input" type="password" autoComplete="off" value={settings.apiKey} placeholder="AIza…" onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} />
          </Field>
          <Field label="Model (with your key)" hint="Flash-Lite is fast and cheap; any Gemini model id works.">
            <input className="input" value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} placeholder={DEFAULT_MODEL} />
          </Field>
          <div className="actions">
            <button className="btn btn--primary" onClick={() => (saveGeminiSettings(settings), setShowSettings(false))}>
              Save
            </button>
            <button className="btn" onClick={() => (setSettings({ apiKey: '', model: DEFAULT_MODEL }), saveGeminiSettings({ apiKey: '', model: DEFAULT_MODEL }))}>
              Forget my key
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="chat" ref={chatRef}>
            {messages.map((m, i) => (
              <div key={i} className={`msg msg--${m.role}${m.error ? ' msg--error' : ''}`}>
                {m.text}
                {m.actions?.length ? (
                  <div className="plan">
                    <strong style={{ fontSize: 12 }}>{m.actions.length} change(s)</strong>
                    <ul>
                      {m.actions.map((a, j) => (
                        <li key={j}>{describeAction(a)}</li>
                      ))}
                    </ul>
                    {m.applied ? (
                      <span className="badge" style={{ color: 'var(--ok)' }}>
                        ✓ Applied (Ctrl+Z to undo)
                      </span>
                    ) : (
                      <button className="btn btn--small btn--primary" onClick={() => apply(i)}>
                        Apply
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? <div className="msg msg--bot">Thinking…</div> : null}
          </div>
          <div className="composer">
            {messages.length <= 1 ? (
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            <textarea
              className="textarea"
              value={input}
              placeholder="Ask or describe a change… (Enter to send)"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
            />
            <div className="actions" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
              {busy ? (
                <button className="btn" onClick={() => abort.current?.abort()}>
                  Stop
                </button>
              ) : null}
              <button className="btn btn--primary" disabled={busy || !input.trim()} onClick={() => send(input)}>
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
