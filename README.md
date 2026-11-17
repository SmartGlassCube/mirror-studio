# Smart Mirror Studio

A no-code editor for gesture-controlled smart mirrors built on the
[`glasscube`](https://github.com/SmartGlassCube/Smart-Mirror-SDK) Python SDK. Inspired by n8n:
pages are nodes, the hand gestures that move between them are the links.

- **Build**: drag pages and widgets onto a canvas, link pages by dragging from one to another and
  picking a gesture (two-finger swipes, open-hand swipes, clicks, pinch, scroll, zoom). A ★ "Any
  page" node holds gestures that work everywhere. Double-click a page to lay out its widgets on a
  true-to-scale mirror screen.
- **Widgets**: the SDK's built-ins (text, weather, calendar, news, events, QR gallery, games,
  drawing) with live data sources (Open-Meteo weather, clock, any JSON API, fixed JSON), plus your
  own: write a React component, start from a template, or ask the assistant. **Copy context for
  coding agents** puts a complete brief (contract, data shape, styling, current code) on the
  clipboard for Claude Code, Cursor, ChatGPT…
- **Test**: turn on your webcam and perform the gestures. Hand tracking runs in the browser with
  MediaPipe, and `src/runtime/` is a port of the SDK's gesture detector and state manager with the
  same thresholds, so what fires here fires on the mirror. No camera? Simulate any gesture with a
  button or the keyboard (arrows = two-finger swipes, Shift+arrows = open hand, C/V = clicks).
- **Assistant**: Gemini Flash-Lite (Google AI Studio) answers questions, writes widgets, and edits
  the project. It proposes a list of changes that you apply in one undoable step.
- **No accounts**: work autosaves in the browser (localStorage). Export a `.glasscube.json` or
  `.yaml` file to keep it, share it, or run it on a mirror; import it back anytime.
- **Problems panel**: unreachable pages, dead ends, two links on one gesture, gestures that collide
  with widget controls.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # gesture engine (the SDK's own test cases), simulator, import/export, API proxy
npm run build
```

The assistant needs a key: paste your own (free at <https://aistudio.google.com/apikey>) in the
assistant's Settings, or run `vercel dev` with `GEMINI_API_KEY` set to serve `/api/assistant`
locally (Vite proxies `/api` to it on port 3000).

## Deploy on Vercel

1. Push this folder to its own GitHub repository and import it in Vercel (framework: Vite; the
   settings come from `vercel.json`).
2. In Project → Settings → Environment Variables, add `GEMINI_API_KEY` (server-side only, never
   `VITE_`-prefixed). Optional: `GEMINI_MODEL` (default `gemini-flash-lite-latest`) and
   `ASSISTANT_RATE_LIMIT` (requests per IP per hour, default 30).
3. Deploy. Without `GEMINI_API_KEY` the site still works; the assistant then asks each user for
   their own key.

`api/assistant.ts` is the only server code: it forwards the studio's requests to Gemini with the
shared key, allowlists the request fields, fixes the model, caps output, and rate-limits per IP in
memory (per function instance; use Vercel KV/Upstash for a hard quota). Users with their own key
call Google straight from the browser, so their key never reaches the server.

## The project file

`src/model/project.ts` defines it. It maps one to one onto the SDK:

| Studio | SDK |
|---|---|
| `pages[]` (`id`, `widgets`) | graph `nodes` |
| `edges[]` (`from`, `to`, `gesture`) | graph `edges` |
| `bindings[]` (gesture → page from anywhere) | `StateManager(event_bindings=…)` with `set_current_node` |
| widget `type`, `position`, `content`, `props`, `draggable` | `BaseWidget(widget_type, position, content, metadata=props, draggable)` |
| widget `data` (`weather`, `clock`, `http`, `static`) | a `data_provider` (`OpenMeteoWeatherProvider`, …) |
| `widgetTypes[]` (`source` TSX + `compiled` JS in exports) | a frontend widget loaded at runtime |
| `settings.gestureConfig` | `StateManager(gesture_config=…)` |

Run an exported file on a real mirror with the SDK (0.2.0 or newer):

```bash
pip install -U glasscube
glasscube run my-mirror.glasscube.json
```

The SDK's `glasscube/project.py` reads it; each custom widget's `compiled` code is sent to the
mirror's UI, which loads it at runtime.

## Layout

| Path | |
|---|---|
| `src/editor/` | Canvas (React Flow), palette, inspector, page designer, widget studio, top bar |
| `src/mirror/` | The mirror's own widget components and styles (copied from the SDK's `frontend/`), `MirrorScreen`, the custom widget compiler (sucrase) |
| `src/runtime/` | Gesture engine + state simulator (ports of `glasscube/vision` and `glasscube/core`), MediaPipe hand tracking, data sources |
| `src/test/` | The Test view |
| `src/ai/` | Gemini client, assistant panel, project actions, coding-agent context |
| `src/model/` | Project types, catalog, templates, import/export, lint |
| `api/assistant.ts` | Vercel Function: the shared Gemini key, rate-limited |

When the SDK changes a gesture threshold, a widget binding or a widget component, mirror the
change in `src/runtime/` or `src/mirror/widgets/`; the tests in `src/runtime/engine.test.ts`
replay the SDK's gesture test cases.

## Security note

Custom widgets are code that runs in the page. Opening someone else's project file with custom
widgets asks for confirmation first, since that code could read what the page can (including a
saved assistant key).

## License

MIT
