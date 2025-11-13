#!/usr/bin/env node
const path = require('path')
const fs = require('fs')
const { loadCsv, GenUXDataProcessor } = require('../scripts/data-processor')
const { analyze, MODE } = require('../lib/gemini-adapter')

async function run() {
  const fixtureDir = path.join(__dirname, '..', 'test', 'fixtures')
  const versions = ['v1.csv', 'v2.csv', 'v3.csv', 'v4.csv', 'v5.csv']
  const rowsByVersion = versions.map((f) => loadCsv(path.join(fixtureDir, f)))

  const proc = new GenUXDataProcessor()
  const results = []

  for (let i = 0; i < rowsByVersion.length - 1; i++) {
    const prev = rowsByVersion[i]
    const curr = rowsByVersion[i + 1]
    const metricsList = ['Personalization', 'Loading Speed', 'Mobile Responsiveness', 'Accessibility']

    const t0 = Date.now()
    const statSig = proc.statisticalSignificance(prev, curr, metricsList)
    const tStat = Date.now() - t0

    // Build basic metrics object for LLM adapter
    const metrics = {
      statisticalSignificance: statSig,
      mlPerformance: proc.calculateAverage(curr, 'Personalization'),
      systemResponsiveness: proc.calculateAverage(curr, 'Loading Speed'),
      intentMatchRate: proc.calculateAverage(curr, 'Personalization') / 5 * 100,
    }

    const llmStart = Date.now()
    // call adapter (offline or live depending on env)
    const llmResp = await analyze({ query: `Explain change from v${i + 1} to v${i + 2}`, data: curr, metrics })
    const llmTime = Date.now() - llmStart

    const driftScore = proc.computeDriftScore({ statisticalSignificance: statSig, llmConfidence: llmResp.confidence, deltaTSeconds: 60 * 60 * 24 })

    const record = {
      transition: `v${i + 1}->v${i + 2}`,
      statisticalSignificance: statSig,
      statisticalTimeMs: tStat,
      llmTimeMs: llmTime,
      llmConfidence: llmResp.confidence,
      interpretation: llmResp.interpretation,
      driftScore,
    }
    console.log(record)
    results.push(record)
  }

  const out = path.join(process.cwd(), 'e2e-output.json')
  fs.writeFileSync(out, JSON.stringify({ mode: MODE, results }, null, 2))
  console.log('E2E run complete — output written to', out)
}

if (require.main === module) {
  run().catch((err) => {
    console.error('E2E run failed:', err)
    process.exit(2)
  })
}
import { loadCsv, mean } from '../scripts/data-processor.js'
import { GeminiAdapter } from '../lib/gemini-adapter.js'

async function run() {
  const adapter = new GeminiAdapter({ mode: process.env.GENUX_GEMINI_MODE || 'stub', allowNetwork: false })
  const versions = [1,2,3,4,5].map((n) => new URL(`../test/fixtures/v${n}.csv`, import.meta.url).pathname)

  // load all versions
  const datasets = versions.map((p) => ({ version: p.split('/').pop(), rows: loadCsv(p) }))

  for (let i = 1; i < datasets.length; i++) {
    const prev = datasets[i-1].rows
    const curr = datasets[i].rows
    console.log(`\n--- Comparing ${i} -> ${i+1} ---`) // human friendly

    const metricsList = ['Personalization','Loading Speed','Mobile Responsiveness','Accessibility']
    const processorModule = await import('../scripts/data-processor.js')
    const Proc = processorModule.GenUXDataProcessor
    const proc = new Proc()
    const statSig = proc.statisticalSignificance(prev, curr, metricsList)

    // Build anomalies list (simple) and metrics snapshot
    const prevAvg = metricsList.reduce((acc, m) => ({ ...acc, [m]: proc.calculateAverage(prev, m) }), {})
    const currAvg = metricsList.reduce((acc, m) => ({ ...acc, [m]: proc.calculateAverage(curr, m) }), {})
    const anomalies = metricsList.map((m) => ({ metric: m, prev: prevAvg[m], curr: currAvg[m] })).filter((a) => Math.abs(a.curr - a.prev) / (Math.abs(a.prev) + 1e-6) > 0.05)

    const llmRes = await adapter.analyze({ metrics: currAvg, anomalies, note: `Comparing v${i} to v${i+1}` })
    const driftScore = proc.computeDriftScore({ statisticalSignificance: statSig, llmConfidence: llmRes.confidence, deltaTSeconds: 60 * 60 * 24 })

    console.log('StatisticalSignificance:', statSig.toFixed(3))
    console.log('LLM interpretation:', llmRes.interpretation)
    console.log('LLM confidence:', llmRes.confidence)
    console.log('Combined DriftScore:', driftScore.toFixed(3))
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('e2e-run.js')) {
  run().catch((e) => { console.error(e); process.exit(1) })
}

export default run
