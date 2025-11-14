import test from 'node:test'
import assert from 'node:assert/strict'
import { GenUXDataProcessor, loadCsv, mean, variance } from '../scripts/data-processor.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('Performance: Load real UX Research.csv dataset', async () => {
  const csvPath = join(__dirname, 'fixtures', 'UX Research.csv')
  
  const start = performance.now()
  const rows = loadCsv(csvPath)
  const loadTime = performance.now() - start
  
  assert.ok(rows.length > 0, 'CSV loaded')
  assert.ok(loadTime < 50, `CSV load time ${loadTime.toFixed(2)}ms < 50ms`)
  
  console.log(`  ✓ Loaded ${rows.length} rows in ${loadTime.toFixed(2)}ms`)
})

test('Performance: Statistical significance on real data (120 rows)', async () => {
  const csvPath = join(__dirname, 'fixtures', 'UX Research.csv')
  const rows = loadCsv(csvPath)
  
  // Split into two halves to simulate version comparison
  const half = Math.floor(rows.length / 2)
  const prev = rows.slice(0, half)
  const curr = rows.slice(half)
  
  const proc = new GenUXDataProcessor()
  const metrics = ['Personalization', 'Loading Speed', 'Mobile Responsiveness', 'Accessibility']
  
  const start = performance.now()
  const statSig = proc.statisticalSignificance(prev, curr, metrics)
  const duration = performance.now() - start
  
  assert.equal(typeof statSig, 'number')
  assert.ok(statSig >= 0, 'statistical significance >= 0')
  assert.ok(duration < 156, `Duration ${duration.toFixed(2)}ms < 156ms (paper target)`)
  
  console.log(`  ✓ Statistical significance computed in ${duration.toFixed(2)}ms (target: 156ms)`)
  console.log(`    Value: ${statSig.toFixed(4)}`)
})

test('Performance: Real-time metrics processing (full dataset)', async () => {
  const csvPath = join(__dirname, 'fixtures', 'UX Research.csv')
  const rows = loadCsv(csvPath)
  
  const proc = new GenUXDataProcessor()
  
  const start = performance.now()
  const metrics = proc.processRealTimeData(rows)
  const duration = performance.now() - start
  
  assert.equal(typeof metrics.adaptationEffectiveness, 'number')
  assert.equal(typeof metrics.intentMatchRate, 'number')
  assert.ok(duration < 156, `Duration ${duration.toFixed(2)}ms < 156ms`)
  
  console.log(`  ✓ Real-time metrics in ${duration.toFixed(2)}ms (target: 156ms)`)
  console.log(`    Adaptation Effectiveness: ${metrics.adaptationEffectiveness.toFixed(2)}/5`)
  console.log(`    Intent Match Rate: ${metrics.intentMatchRate.toFixed(1)}%`)
})

test('Performance: Drift score computation with LLM confidence', async () => {
  const csvPath = join(__dirname, 'fixtures', 'UX Research.csv')
  const rows = loadCsv(csvPath)
  
  const proc = new GenUXDataProcessor()
  const half = Math.floor(rows.length / 2)
  const prev = rows.slice(0, half)
  const curr = rows.slice(half)
  
  const start = performance.now()
  const statSig = proc.statisticalSignificance(prev, curr, ['Personalization', 'Loading Speed', 'Mobile Responsiveness', 'Accessibility'])
  const driftScore = proc.computeDriftScore({ statisticalSignificance: statSig, llmConfidence: 0.85, deltaTSeconds: 60 * 60 * 24 })
  const duration = performance.now() - start
  
  assert.equal(typeof driftScore, 'number')
  assert.ok(driftScore >= 0 && driftScore <= 1, 'drift score in [0,1]')
  assert.ok(duration < 2100, `Duration ${duration.toFixed(2)}ms < 2100ms (paper target, stub mode)`)
  
  console.log(`  ✓ Drift score computed in ${duration.toFixed(2)}ms (target: 2100ms, stub mode)`)
  console.log(`    Statistical Significance: ${statSig.toFixed(4)}`)
  console.log(`    Combined Drift Score: ${driftScore.toFixed(4)}`)
})

test('Accuracy: Intent accuracy calculation on real data', async () => {
  const csvPath = join(__dirname, 'fixtures', 'UX Research.csv')
  const rows = loadCsv(csvPath)
  
  const proc = new GenUXDataProcessor()
  
  // Extract personalization scores (1-5 scale) and experience ratings (1-5 scale)
  const personScores = rows.map((r) => Number.parseFloat(r.Personalization) || 0)
  const expRatings = rows.map((r) => getUserExperienceRating(r.User_experience))
  
  const intentAcc = proc.intentAccuracy(personScores, expRatings)
  
  assert.ok(intentAcc >= -1 && intentAcc <= 1, `intent accuracy in [-1,1], got ${intentAcc}`)
  console.log(`  ✓ Intent accuracy: ${intentAcc.toFixed(4)} (range: [-1, 1])`)
})

// Derive a 1-5 experience rating from the User_experience sentiment field
function getUserExperienceRating(userExperienceText) {
  const sentimentMap = {
    'Intuitive': 5,
    'Smooth': 5,
    'Efficient': 4,
    'Good': 4,
    'Moderate': 3,
    'Average': 3,
    'Confusing': 2,
    'Frustrating': 2,
    'Overwhelming': 1,
    'Poor': 1,
    'Well-structured': 4,
    'User-Friendly': 5,
    'Engaging': 4,
    'Clear and concise': 5,
    'Limited Menu Options': 2,
    'Inconsistent Navigation': 2,
    'Adequate': 3,
  }
  return sentimentMap[userExperienceText] || 3
}

test('Correctness: Verify sentiment mapping correctness', async () => {
  const csvPath = join(__dirname, 'fixtures', 'UX Research.csv')
  const rows = loadCsv(csvPath)
  
  const proc = new GenUXDataProcessor()
  const sentiment = proc.calculateUXSentiment(rows)
  
  assert.ok(sentiment >= 1 && sentiment <= 5, `sentiment in [1,5], got ${sentiment}`)
  console.log(`  ✓ Average UX sentiment: ${sentiment.toFixed(2)}/5`)
})

test('Correctness: Validate metric averages are in expected ranges', async () => {
  const csvPath = join(__dirname, 'fixtures', 'UX Research.csv')
  const rows = loadCsv(csvPath)
  
  const proc = new GenUXDataProcessor()
  
  const avgPersonalization = proc.calculateAverage(rows, 'Personalization')
  const avgLoadSpeed = proc.calculateAverage(rows, 'Loading Speed')
  const avgMobileResp = proc.calculateAverage(rows, 'Mobile Responsiveness')
  const avgAccessibility = proc.calculateAverage(rows, 'Accessibility')
  
  assert.ok(avgPersonalization >= 1 && avgPersonalization <= 5, `personalization ${avgPersonalization} in [1,5]`)
  assert.ok(avgLoadSpeed >= 1 && avgLoadSpeed <= 5, `load speed ${avgLoadSpeed} in [1,5]`)
  assert.ok(avgMobileResp >= 1 && avgMobileResp <= 5, `mobile responsiveness ${avgMobileResp} in [1,5]`)
  assert.ok(avgAccessibility >= 1 && avgAccessibility <= 5, `accessibility ${avgAccessibility} in [1,5]`)
  
  console.log(`  ✓ All metrics in valid ranges:`)
  console.log(`    Personalization: ${avgPersonalization.toFixed(2)}/5`)
  console.log(`    Loading Speed: ${avgLoadSpeed.toFixed(2)}/5`)
  console.log(`    Mobile Responsiveness: ${avgMobileResp.toFixed(2)}/5`)
  console.log(`    Accessibility: ${avgAccessibility.toFixed(2)}/5`)
})
