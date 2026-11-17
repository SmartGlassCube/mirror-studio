import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import { transform } from 'sucrase'
import type { WidgetComponent } from './widgets/defineWidget'

export type CompileResult = { ok: true; code: string } | { ok: false; error: string }

// TSX -> CommonJS with classic React.createElement calls: what the mirror's runtime loader expects.
export function compileWidgetSource(source: string): CompileResult {
  try {
    const { code } = transform(source, {
      transforms: ['typescript', 'jsx', 'imports'],
      jsxRuntime: 'classic',
      production: true,
      filePath: 'Widget.tsx',
    })
    return { ok: true, code }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

const MODULES: Record<string, unknown> = { react: React, 'react/jsx-runtime': JsxRuntime }

// Runs compiled widget code and returns its default export. Custom code runs with the studio's
// own privileges, which is why imported projects ask before running theirs (see store.ts).
export function loadCompiledWidget(code: string): WidgetComponent {
  const module = { exports: {} as Record<string, unknown> }
  const require = (name: string) => {
    if (name in MODULES) return MODULES[name]
    throw new Error(`Custom widgets can only import 'react' (tried '${name}')`)
  }
  new Function('require', 'module', 'exports', 'React', code)(require, module, module.exports, React)
  const component = module.exports.default ?? module.exports
  if (typeof component !== 'function') {
    throw new Error('The widget must `export default` a React component (a function).')
  }
  return component as WidgetComponent
}

type Cached = { component: WidgetComponent | null; error: string | null }
const cache = new Map<string, Cached>()

export function componentFor(source: string): Cached {
  const hit = cache.get(source)
  if (hit) return hit
  const compiled = compileWidgetSource(source)
  let result: Cached
  if (!compiled.ok) {
    result = { component: null, error: compiled.error }
  } else {
    try {
      result = { component: loadCompiledWidget(compiled.code), error: null }
    } catch (error) {
      result = { component: null, error: (error as Error).message }
    }
  }
  if (cache.size > 200) cache.clear()
  cache.set(source, result)
  return result
}
