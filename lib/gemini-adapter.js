// Gemini adapter supporting two modes:
// - live: calls the Gemini generative API (requires GEMINI_API_KEY and a runtime fetch implementation)
// - offline (default): deterministic heuristic-based interpretation for testing

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ""
const GEMINI_MODEL = process.env.GEMINI_MODEL || process.env.GENUX_GEMINI_MODEL || 'gemini-pro'
const MODE = process.env.GEMINI_MODE || "offline" // 'live' or 'offline'

async function callGeminiLive(prompt) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set')
  if (typeof globalThis.fetch !== 'function') throw new Error('No fetch available in runtime; set up node-fetch or run in an environment with fetch')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const res = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1024 },
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Gemini API error: ${res.status} ${txt}`)
  }
  const json = await res.json()
  const generatedText = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
  // Note: Gemini doesn't provide a standardized 'confidence' in this API; return a heuristic
  return { interpretation: generatedText, confidence: 0.85 }
}

function heuristicInterpretation({ data = [], metrics = {}, query = '' }) {
  // Very small deterministic heuristic to provide a readable interpretation for offline testing.
  const total = data.length
  const avgPersonalization = metrics.mlPerformance || 0
  const avgLoad = metrics.systemResponsiveness || 0
  const intentMatch = metrics.intentMatchRate || 0

  const issues = []
  if (avgPersonalization < 3) issues.push('low personalization acceptance')
  if (avgLoad < 3) issues.push('users reporting slow loading')
  if (intentMatch < 70) issues.push('low intent match rate')

  const summary = []
  summary.push(`Total records: ${total}`)
  summary.push(`Avg personalization: ${avgPersonalization.toFixed(2)}/5`)
  summary.push(`Avg loading speed: ${avgLoad.toFixed(2)}/5`)
  summary.push(`Intent match rate: ${intentMatch.toFixed(1)}%`)
  if (issues.length) summary.push(`Potential issues: ${issues.join(', ')}`)
  else summary.push('No major issues detected')

  // Confidence heuristic: combine statistical significance and intent match
  const statSig = metrics.statisticalSignificance || 0
  const conf = Math.max(0.25, Math.min(0.99, 0.5 * Math.tanh(statSig / 5) + 0.5 * Math.min(1, intentMatch / 100)))

  return { interpretation: summary.join('. '), confidence: Number(conf.toFixed(2)) }
}

export async function analyze({ query = '', data = [], metrics = {} } = {}) {
  const runtimeMode = process.env.GEMINI_MODE || MODE
  if (runtimeMode === 'live') {
    const prompt = `GenUX analysis request:\nQuery: ${query}\nMetrics: ${JSON.stringify(metrics)}\nSample (first 5 rows): ${JSON.stringify(data.slice(0, 5))}`
    return await callGeminiLive(prompt)
  }
  // offline deterministic
  return heuristicInterpretation({ data, metrics, query })
}

// (analyze and MODE are exported via ESM declarations)

// Gemini adapter with two modes: 'auto' (use real API if keys provided) and 'stub' (deterministic offline)
/*
Usage:
  const { GeminiAdapter } = await import('./lib/gemini-adapter.js')
  const adapter = new GeminiAdapter({ mode: 'auto' })
  const res = await adapter.analyze({ metrics: {...}, note: '...' })
  // res = { interpretation: string, confidence: number }
*/

const DEFAULT_CONFIDENCE = 0.75

export class GeminiAdapter {
  constructor(options = {}) {
    this.mode = options.mode || process.env.GENUX_GEMINI_MODE || 'auto' // 'auto'|'stub'|'remote'
    this.apiKey = process.env.GENUX_GEMINI_API_KEY || options.apiKey
    this.endpoint = process.env.GENUX_GEMINI_ENDPOINT || options.endpoint
    // If user passes allowNetwork true we attempt remote when available (still safe-guarded)
    this.allowNetwork = Boolean(options.allowNetwork)
  }

  // Analyze a structured prompt object and return { interpretation, confidence }
  async analyze(structuredPrompt) {
    // Validate input
    if (!structuredPrompt || typeof structuredPrompt !== 'object') {
      throw new Error('structuredPrompt object required')
    }

    // Decide mode
    if (this.mode === 'stub' || (!this.apiKey && this.mode !== 'remote')) {
      return this._stubAnalyze(structuredPrompt)
    }

    // remote mode requested but not allowed to perform network calls in this environment
    if (!this.allowNetwork) {
      // fallback to stub but log that we would call remote with API key present
      console.info('GeminiAdapter: remote mode requested but network calls are disabled. Falling back to stub.')
      return this._stubAnalyze(structuredPrompt)
    }

    // If we reach here and have an endpoint + apiKey, attempt a remote call
    if (!this.endpoint || !this.apiKey) {
      console.info('GeminiAdapter: missing endpoint/apiKey; using stub.')
      return this._stubAnalyze(structuredPrompt)
    }

    // Basic remote call implementation (user must provide valid endpoint and key). This is generic.
    try {
      const body = { instances: [structuredPrompt] }
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        console.warn('GeminiAdapter remote call failed:', res.status, text)
        return this._stubAnalyze(structuredPrompt)
      }
      const json = await res.json()
      // Attempt to extract a text + confidence from returned structure
      const text = json.output?.[0]?.content || json.predictions?.[0]?.content || JSON.stringify(json)
      const confidence = (json.output?.[0]?.confidence || json.predictions?.[0]?.score || DEFAULT_CONFIDENCE)
      return { interpretation: String(text), confidence: Number(confidence) || DEFAULT_CONFIDENCE }
    } catch (err) {
      console.warn('GeminiAdapter remote call error:', err.message)
      return this._stubAnalyze(structuredPrompt)
    }
  }

  // Deterministic offline analyzer: inspects metrics and returns human-readable interpretation and a confidence
  _stubAnalyze(prompt) {
    // prompt expected shape: { metrics: {name: value, ...}, anomalies: [{metric, prev, curr}], note }
    const metrics = prompt.metrics || {}
    const anomalies = prompt.anomalies || []
    const note = prompt.note || ''

    // Build interpretation heuristically
    const parts = []
    // If anomalies provided, describe them
    if (anomalies.length > 0) {
      anomalies.slice(0, 5).forEach((a) => {
        parts.push(`Metric ${a.metric} changed from ${a.prev} to ${a.curr}`)
      })
    } else {
      // Inspect top metrics
      const keys = Object.keys(metrics)
      // find largest relative change if numeric pair provided
      const sorted = keys
        .map((k) => ({ k, v: Number(metrics[k] || 0) }))
        .sort((a, b) => Math.abs(b.v - 0) - Math.abs(a.v - 0))
      sorted.slice(0, 3).forEach((s) => {
        parts.push(`${s.k} ~ ${s.v}`)
      })
    }

    if (note) parts.push(`Note: ${note}`)

    // Confidence heuristic: more anomalies -> higher confidence; cap at 0.95
    const confBase = Math.min(0.95, 0.4 + Math.min(0.5, anomalies.length * 0.15))
    // If metrics contain clear signals (e.g., Loading Speed > 4), bump confidence
    const loading = Number(metrics['Loading Speed'] || 0)
    const personalization = Number(metrics['Personalization'] || 0)
    const boost = loading >= 4 || personalization >= 4 ? 0.1 : 0
    const confidence = Math.min(0.99, confBase + boost)

    const interpretation = parts.length > 0 ? parts.join('. ') : 'No significant contextual clues found.'
    return { interpretation, confidence }
  }
}

export default GeminiAdapter
