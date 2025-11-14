#!/usr/bin/env node
import { createRequire } from 'module'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

const require = createRequire(import.meta.url)
const { loadCsv, GenUXDataProcessor } = require('../scripts/data-processor')
import { GeminiAdapter } from '../lib/gemini-adapter.js'

// Config via env
const GEMINI_MODE = process.env.GEMINI_MODE || process.env.GENUX_GEMINI_MODE || 'live'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GENUX_GEMINI_API_KEY || ''
const CONCURRENCY = Number(process.env.CONCURRENCY || 4)
const PARALLEL_REQUESTS = Number(process.env.REQ_COUNT || 20)
const DATASET_PATH = process.env.GENUX_DATASET || path.join(process.cwd(), 'test', 'fixtures', 'genux-data-2025-11-13.csv')

async function safeWriteJSON(p, obj) {
  await fs.writeFile(p, JSON.stringify(obj, null, 2), 'utf8')
}

function changePercent(prevAvg, currAvg) {
  const denom = (Math.abs(prevAvg) + Math.abs(currAvg)) / 2 || 1e-6
  return Math.abs(currAvg - prevAvg) / denom
}

function evaluateThresholds(records, truthFn) {
  // records: array with { driftScore, trueLabel }
  const thresholds = []
  for (let t = 0.02; t <= 0.30; t += 0.01) thresholds.push(Number(t.toFixed(2)))
  const rows = []
  for (const thr of thresholds) {
    let TP = 0, FP = 0, TN = 0, FN = 0
    for (const r of records) {
      const pred = r.driftScore >= thr
      const actual = r.trueLabel
      if (pred && actual) TP++
      else if (pred && !actual) FP++
      else if (!pred && !actual) TN++
      else if (!pred && actual) FN++
    }
    const precision = TP + FP === 0 ? 0 : TP / (TP + FP)
    const recall = TP + FN === 0 ? 0 : TP / (TP + FN)
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
    const fpr = FP + TN === 0 ? 0 : FP / (FP + TN)
    rows.push({ threshold: thr, TP, FP, TN, FN, precision, recall, f1, fpr })
  }
  // pick best by f1
  rows.sort((a,b) => b.f1 - a.f1)
  return { table: rows, best: rows[0] }
}

async function run() {
  console.log('E2E Gemini run — mode:', GEMINI_MODE)
  if (GEMINI_MODE === 'live' && !GEMINI_API_KEY) {
    console.error('GEMINI_MODE=live but no GEMINI_API_KEY provided in env')
    process.exit(2)
  }

  const adapter = new GeminiAdapter({ mode: GEMINI_MODE === 'live' ? 'live' : 'stub', allowNetwork: GEMINI_MODE === 'live', apiKey: GEMINI_API_KEY })
  // prefer module-level analyze when running in live mode and key present
  let moduleAnalyze = null
  if (GEMINI_MODE === 'live' && GEMINI_API_KEY) {
    try {
      const mod = await import('../lib/gemini-adapter.js')
      moduleAnalyze = mod.analyze || null
    } catch (err) {
      console.warn('Failed to import module-level analyze:', err.message)
    }
  }

  console.log('Loading dataset:', DATASET_PATH)
  const rows = loadCsv(DATASET_PATH)
  if (!rows || rows.length === 0) {
    console.error('Dataset empty or not found')
    process.exit(3)
  }
  console.log(`Loaded ${rows.length} rows`)

  // For this run we'll split the dataset into N sequential chunks (5) and compare
  const chunks = 5
  const chunkSize = Math.floor(rows.length / chunks)
  const datasets = []
  for (let i = 0; i < chunks; i++) {
    const start = i * chunkSize
    const end = i === chunks - 1 ? rows.length : (i + 1) * chunkSize
    datasets.push({ id: `chunk${i+1}`, rows: rows.slice(start, end) })
  }

  const proc = new GenUXDataProcessor()
  const metricsList = ['Personalization','Loading Speed','Mobile Responsiveness','Accessibility']

  const perCallRecords = []

  for (let i = 0; i < datasets.length - 1; i++) {
    const prev = datasets[i].rows
    const curr = datasets[i+1].rows

    const t0 = Date.now()
    const statSig = proc.statisticalSignificance(prev, curr, metricsList)
    const tStat = Date.now() - t0

    const prevAvg = Object.fromEntries(metricsList.map((m) => [m, proc.calculateAverage(prev, m)]))
    const currAvg = Object.fromEntries(metricsList.map((m) => [m, proc.calculateAverage(curr, m)]))
    const anomalies = metricsList.map((m) => ({ metric: m, prev: prevAvg[m], curr: currAvg[m], change: changePercent(prevAvg[m], currAvg[m]) }))

    // synthetic ground truth: mark true drift if any metric change > 0.10 (10%)
    const trueDrift = anomalies.some((a) => a.change > 0.10)

    // call LLM and measure
    let llmResp = { interpretation: '', confidence: 0 }
    let llmTime = 0
    let success = false
    try {
      const t1 = Date.now()
      if (moduleAnalyze) {
        llmResp = await moduleAnalyze({ query: `Comparing chunk ${i+1} -> ${i+2}`, data: curr.slice(0,5), metrics: currAvg })
      } else {
        llmResp = await adapter.analyze({ metrics: currAvg, anomalies, note: `Comparing chunk ${i+1} -> ${i+2}` })
      }
      llmTime = Date.now() - t1
      success = true
    } catch (err) {
      llmResp = { interpretation: String(err.message || err), confidence: 0 }
      llmTime = -1
      success = false
    }

    const driftScore = proc.computeDriftScore({ statisticalSignificance: statSig, llmConfidence: llmResp.confidence || 0, deltaTSeconds: 60*60*24 })

    const record = {
      transition: `${datasets[i].id}->${datasets[i+1].id}`,
      statisticalSignificance: statSig,
      statisticalTimeMs: tStat,
      llmTimeMs: llmTime,
      llmConfidence: llmResp.confidence || 0,
      interpretation: llmResp.interpretation || '',
      driftScore,
      trueLabel: trueDrift,
      success,
      responseLength: (llmResp.interpretation || '').length,
    }
    console.log('record:', record)
    perCallRecords.push(record)
  }

  // Save raw per-call records
  await safeWriteJSON(path.join(process.cwd(), 'e2e-output.json'), { mode: GEMINI_MODE, records: perCallRecords })
  // also CSV
  const csvLines = ['transition,statSig,statMs,llmMs,llmConf,respLen,success,driftScore,trueLabel']
  for (const r of perCallRecords) csvLines.push(`${r.transition},${r.statisticalSignificance},${r.statisticalTimeMs},${r.llmTimeMs},${r.llmConfidence},${r.responseLength},${r.success ? 1 : 0},${r.driftScore},${r.trueLabel ? 1 : 0}`)
  await fs.writeFile(path.join(process.cwd(), 'e2e-metrics.csv'), csvLines.join('\n'), 'utf8')

  // Sensitivity analysis using synthetic truth
  const evalRes = evaluateThresholds(perCallRecords, null)
  await safeWriteJSON(path.join(process.cwd(), 'sensitivity-results.json'), evalRes)
  // pick best threshold and print
  console.log('\nSensitivity analysis best threshold (by F1):')
  console.log(evalRes.best)

  // Load test: run multiple parallel analyze calls against the largest transition
  const target = perCallRecords.reduce((a,b)=> (a.driftScore>b.driftScore?a:b), perCallRecords[0])
  console.log('\nStarting controlled parallel load test against transition:', target.transition)

  const loadResults = []
  const tasks = []
  const adapterForLoad = new GeminiAdapter({ mode: GEMINI_MODE === 'live' ? 'live' : 'stub', allowNetwork: GEMINI_MODE === 'live', apiKey: GEMINI_API_KEY })
  const loadAnalyze = moduleAnalyze || ((p) => adapterForLoad.analyze(p))

  for (let i = 0; i < PARALLEL_REQUESTS; i++) {
    tasks.push((async () => {
      const t0 = Date.now()
      try {
        const res = await loadAnalyze({ metrics: {}, anomalies: [], note: `load-test ${i}` })
        const latency = Date.now() - t0
        loadResults.push({ idx: i, latency, success: true, conf: res.confidence, len: (res.interpretation||'').length })
      } catch (err) {
        const latency = Date.now() - t0
        loadResults.push({ idx: i, latency, success: false, err: String(err) })
      }
    })())
    // throttle a bit to avoid hitting burst limits
    if (i % CONCURRENCY === 0) await new Promise((r)=>setTimeout(r, 100))
  }
  await Promise.all(tasks)

  // aggregate load results
  const successCount = loadResults.filter(r=>r.success).length
  const avgLatency = loadResults.filter(r=>r.success).reduce((s,r)=>s+r.latency,0) / Math.max(1, successCount)
  console.log(`Load test: ${loadResults.length} requests, success: ${successCount}, avgLatencyMs: ${avgLatency}`)
  await safeWriteJSON(path.join(process.cwd(), 'load-results.json'), { loadResults, summary: { total: loadResults.length, successCount, avgLatency } })

  console.log('\nAll artifacts written: e2e-output.json, e2e-metrics.csv, sensitivity-results.json, load-results.json')
}

if (process.argv[1] && process.argv[1].endsWith('e2e-gemini-run.mjs')) {
  run().catch((e)=>{console.error('Run failed:', e); process.exit(1)})
}

export default run
