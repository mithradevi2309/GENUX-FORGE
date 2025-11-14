#!/usr/bin/env node
/**
 * Sensitivity Analysis with Synthetic Drift Injection
 * 
 * This script:
 * 1. Loads the GenUX dataset
 * 2. Injects controlled metric drifts to create labeled ground truth transitions
 * 3. Computes drift scores for each transition
 * 4. Evaluates precision/recall/FPR across threshold range (0.02–0.30)
 * 5. Generates CSV table and PNG plots
 */

import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Re-implement lightweight CSV loader and processor
function loadCsv(filePath) {
  const raw = fsSync.readFileSync(filePath, "utf8")
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  const headers = lines[0].split(',').map((h) => h.trim())
  const rows = lines.slice(1).map((line) => {
    const parts = line.split(',')
    const obj = {}
    headers.forEach((h, i) => (obj[h] = parts[i] ? parts[i].trim() : ""))
    return obj
  })
  return rows
}

function mean(arr) {
  if (!arr || arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function variance(arr) {
  if (!arr || arr.length === 0) return 0
  const m = mean(arr)
  return arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length
}

class GenUXDataProcessor {
  statisticalSignificance(prevData, currData, metricsList) {
    if (!Array.isArray(prevData) || !Array.isArray(currData)) return 0
    const eps = 1e-6
    const scores = metricsList.map((m) => {
      const prevVals = prevData.map((d) => Number.parseFloat(d[m]) || 0)
      const currVals = currData.map((d) => Number.parseFloat(d[m]) || 0)
      const prevMean = mean(prevVals)
      const currMean = mean(currVals)
      const prevVar = variance(prevVals)
      const currVar = variance(currVals)
      const pooledVar = (prevVar + currVar) / 2 || eps
      const sigma = Math.sqrt(pooledVar)
      return Math.abs(currMean - prevMean) / sigma
    })
    return scores.reduce((s, v) => s + v, 0) / Math.max(1, scores.length)
  }

  computeDriftScore({ statisticalSignificance = 0, llmConfidence = 0, deltaTSeconds = 0, alpha = 0.4, beta = 0.5, gamma = 0.1, lambda = 1 / (60 * 60 * 24) }) {
    const temporalWeight = Math.exp(-lambda * deltaTSeconds)
    return alpha * statisticalSignificance + beta * llmConfidence + gamma * temporalWeight
  }
}

const DATASET_PATH = process.env.GENUX_DATASET || path.join(process.cwd(), 'test', 'fixtures', 'genux-data-2025-11-13.csv')
const OUTPUT_DIR = process.cwd()

// Metric injection levels (amount to shift metrics to create detectable drifts)
const DRIFT_LEVELS = {
  NONE: 0,       // No change (negative case)
  SMALL: 0.05,   // 5% shift (borderline)
  MEDIUM: 0.15,  // 15% shift (moderate)
  LARGE: 0.30,   // 30% shift (clear drift)
}

const METRICS_TO_INJECT = ['Personalization', 'Loading Speed', 'Mobile Responsiveness', 'Accessibility']

/**
 * Inject metric changes into a dataset chunk to simulate drift
 * positive=true -> increase metrics, false -> decrease
 */
function injectDrift(data, driftLevel, positive = true) {
  if (driftLevel === 0) return data
  return data.map((row) => {
    const modified = { ...row }
    for (const metric of METRICS_TO_INJECT) {
      const val = Number.parseFloat(row[metric]) || 0
      const sign = positive ? 1 : -1
      const shifted = val + sign * driftLevel * 5 // Scale by 5 to map [0.05, 0.30] to [0.25, 1.5] point shifts
      // Clamp to valid range [1, 5]
      modified[metric] = String(Math.max(1, Math.min(5, shifted)))
    }
    return modified
  })
}

/**
 * Create labeled transitions by splitting dataset and injecting drifts
 * Returns array of { prevData, currData, trueLabel, description }
 */
function createLabeledTransitions(data) {
  const transitions = []
  const chunkSize = Math.floor(data.length / 5)

  const chunks = []
  for (let i = 0; i < 5; i++) {
    const start = i * chunkSize
    const end = i === 4 ? data.length : (i + 1) * chunkSize
    chunks.push(data.slice(start, end))
  }

  // Transition 1: No drift (negative case)
  transitions.push({
    prevData: chunks[0],
    currData: chunks[0].slice(), // Copy same data
    trueLabel: false,
    description: 'No drift (control)',
  })

  // Transition 2: Small drift (might be missed)
  transitions.push({
    prevData: chunks[1],
    currData: injectDrift(chunks[1].slice(), DRIFT_LEVELS.SMALL, true),
    trueLabel: false, // Ambiguous; treat as no-drift for simplicity
    description: 'Small positive drift (+5%)',
  })

  // Transition 3: Medium drift (should be detected)
  transitions.push({
    prevData: chunks[2],
    currData: injectDrift(chunks[2].slice(), DRIFT_LEVELS.MEDIUM, true),
    trueLabel: true,
    description: 'Medium positive drift (+15%)',
  })

  // Transition 4: Large drift (should be clearly detected)
  transitions.push({
    prevData: chunks[3],
    currData: injectDrift(chunks[3].slice(), DRIFT_LEVELS.LARGE, true),
    trueLabel: true,
    description: 'Large positive drift (+30%)',
  })

  // Transition 5: Large negative drift
  transitions.push({
    prevData: chunks[4],
    currData: injectDrift(chunks[4].slice(), DRIFT_LEVELS.LARGE, false),
    trueLabel: true,
    description: 'Large negative drift (-30%)',
  })

  return transitions
}

/**
 * Compute drift scores for all transitions
 */
async function computeDriftScores(transitions) {
  const proc = new GenUXDataProcessor()
  const metricsList = ['Personalization', 'Loading Speed', 'Mobile Responsiveness', 'Accessibility']

  const results = []
  for (const { prevData, currData, trueLabel, description } of transitions) {
    const t0 = Date.now()
    const statSig = proc.statisticalSignificance(prevData, currData, metricsList)
    const tStat = Date.now() - t0

    const driftScore = proc.computeDriftScore({
      statisticalSignificance: statSig,
      llmConfidence: 0.5, // Neutral LLM confidence for synthetic
      deltaTSeconds: 60 * 60 * 24,
    })

    results.push({
      description,
      statSig: Number(statSig.toFixed(4)),
      driftScore: Number(driftScore.toFixed(4)),
      trueLabel,
      computeTimeMs: tStat,
    })
    console.log(`  ${description}: driftScore=${driftScore.toFixed(4)}, truth=${trueLabel}`)
  }
  return results
}

/**
 * Evaluate performance across threshold range
 */
function evaluateThresholds(results) {
  const thresholds = []
  for (let t = 0.02; t <= 0.30; t += 0.01) {
    thresholds.push(Number(t.toFixed(2)))
  }

  const metrics = []
  for (const thr of thresholds) {
    let TP = 0, FP = 0, TN = 0, FN = 0
    for (const r of results) {
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
    const fnr = FN + TP === 0 ? 0 : FN / (FN + TP)

    metrics.push({ threshold: thr, TP, FP, TN, FN, precision, recall, f1, fpr, fnr })
  }

  // Find best by F1
  metrics.sort((a, b) => b.f1 - a.f1)
  const best = metrics[0]

  // Re-sort by threshold for output
  metrics.sort((a, b) => a.threshold - b.threshold)

  return { metrics, best }
}

/**
 * Write CSV table
 */
async function writeMetricsCSV(metrics, filePath) {
  const header = ['threshold', 'TP', 'FP', 'TN', 'FN', 'precision', 'recall', 'f1', 'fpr', 'fnr']
  const lines = [header.join(',')]
  for (const m of metrics) {
    lines.push([
      m.threshold,
      m.TP, m.FP, m.TN, m.FN,
      m.precision.toFixed(3),
      m.recall.toFixed(3),
      m.f1.toFixed(3),
      m.fpr.toFixed(3),
      m.fnr.toFixed(3),
    ].join(','))
  }
  await fs.writeFile(filePath, lines.join('\n'), 'utf8')
}

/**
 * Generate plots using Node canvas if available, else use gnuplot or fallback
 */
async function generatePlots(metrics, outputDir) {
  const basePath = path.join(outputDir, 'sensitivity-plot')

  // Create a simple Python script to generate plots using matplotlib (if available)
  const pythonScript = `
import csv
import matplotlib.pyplot as plt
import sys

# Read CSV
data = {'threshold': [], 'precision': [], 'recall': [], 'f1': [], 'fpr': []}
with open('${path.join(outputDir, 'sensitivity-metrics.csv')}', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        data['threshold'].append(float(row['threshold']))
        data['precision'].append(float(row['precision']))
        data['recall'].append(float(row['recall']))
        data['f1'].append(float(row['f1']))
        data['fpr'].append(float(row['fpr']))

# Plot 1: Precision vs Recall (PR curve)
fig, ax = plt.subplots(1, 1, figsize=(8, 6))
ax.plot(data['recall'], data['precision'], 'o-', linewidth=2, markersize=6, label='Precision-Recall')
ax.set_xlabel('Recall')
ax.set_ylabel('Precision')
ax.set_title('GenUX Drift Detection: Precision-Recall Curve')
ax.grid(True, alpha=0.3)
ax.legend()
fig.savefig('${basePath}-pr.png', dpi=100, bbox_inches='tight')
print('Saved: ${basePath}-pr.png')

# Plot 2: Metrics vs Threshold
fig, ax = plt.subplots(1, 1, figsize=(10, 6))
ax.plot(data['threshold'], data['precision'], 'o-', label='Precision', linewidth=2)
ax.plot(data['threshold'], data['recall'], 's-', label='Recall', linewidth=2)
ax.plot(data['threshold'], data['f1'], '^-', label='F1', linewidth=2)
ax.axhline(y=0, color='k', linestyle='-', alpha=0.1)
ax.set_xlabel('Threshold')
ax.set_ylabel('Score')
ax.set_title('GenUX Drift Detection: Performance vs Threshold')
ax.legend()
ax.grid(True, alpha=0.3)
fig.savefig('${basePath}-threshold.png', dpi=100, bbox_inches='tight')
print('Saved: ${basePath}-threshold.png')

# Plot 3: ROC-like (FPR vs Recall)
fig, ax = plt.subplots(1, 1, figsize=(8, 6))
ax.plot(data['fpr'], data['recall'], 'o-', linewidth=2, markersize=6, color='red', label='ROC (approx)')
ax.set_xlabel('False Positive Rate (FPR)')
ax.set_ylabel('True Positive Rate (Recall)')
ax.set_title('GenUX Drift Detection: FPR vs TPR')
ax.grid(True, alpha=0.3)
ax.legend()
fig.savefig('${basePath}-roc.png', dpi=100, bbox_inches='tight')
print('Saved: ${basePath}-roc.png')

plt.close('all')
`

  const scriptPath = path.join(outputDir, 'gen_plots.py')
  await fs.writeFile(scriptPath, pythonScript, 'utf8')

  try {
    execSync(`python3 "${scriptPath}"`, { cwd: outputDir, stdio: 'inherit' })
    console.log('✓ Plots generated successfully')
  } catch (err) {
    console.warn('⚠ Python matplotlib not available; skipping plots. Install via: pip install matplotlib')
  }
}

/**
 * Main
 */
async function run() {
  console.log('GenUX Sensitivity Analysis with Synthetic Drift Injection\n')

  console.log(`Loading dataset: ${DATASET_PATH}`)
  const data = loadCsv(DATASET_PATH)
  if (!data || data.length === 0) {
    console.error('Dataset empty or not found')
    process.exit(1)
  }
  console.log(`Loaded ${data.length} rows\n`)

  console.log('Creating labeled transitions with synthetic drift injection...')
  const transitions = createLabeledTransitions(data)
  console.log(`Created ${transitions.length} labeled transitions:\n`)

  console.log('Computing drift scores...')
  const results = await computeDriftScores(transitions)
  console.log()

  console.log('Evaluating thresholds (0.02–0.30)...')
  const { metrics, best } = evaluateThresholds(results)
  console.log()

  console.log('Best threshold by F1:')
  console.log(`  Threshold: ${best.threshold}`)
  console.log(`  Precision: ${best.precision.toFixed(3)}`)
  console.log(`  Recall: ${best.recall.toFixed(3)}`)
  console.log(`  F1: ${best.f1.toFixed(3)}`)
  console.log(`  FPR: ${best.fpr.toFixed(3)}`)
  console.log()

  // Save results
  const metricsPath = path.join(OUTPUT_DIR, 'sensitivity-metrics.csv')
  await writeMetricsCSV(metrics, metricsPath)
  console.log(`✓ Metrics saved to: ${metricsPath}`)

  const summaryPath = path.join(OUTPUT_DIR, 'sensitivity-summary.json')
  await fs.writeFile(summaryPath, JSON.stringify({
    datasetSize: data.length,
    transitionCount: transitions.length,
    driftLevels: DRIFT_LEVELS,
    transitions: results,
    evaluation: { metrics, best },
  }, null, 2), 'utf8')
  console.log(`✓ Summary saved to: ${summaryPath}`)

  console.log('\nGenerating plots...')
  await generatePlots(metrics, OUTPUT_DIR)

  console.log('\n✓ Sensitivity analysis complete!')
}

run().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
