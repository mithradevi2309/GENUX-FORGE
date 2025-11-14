import assert from 'node:assert/strict'
import test from 'node:test'
import { loadCsv, GenUXDataProcessor } from '../scripts/data-processor.js'

test('integration: detect drift between v1 and v2 fixtures', () => {
  const v1Path = new URL('./fixtures/v1.csv', import.meta.url).pathname
  const v2Path = new URL('./fixtures/v2.csv', import.meta.url).pathname
  const v1 = loadCsv(v1Path)
  const v2 = loadCsv(v2Path)

  assert.ok(Array.isArray(v1) && v1.length > 0)
  assert.ok(Array.isArray(v2) && v2.length > 0)

  const proc = new GenUXDataProcessor()
  const metricsList = ['Personalization', 'Loading Speed', 'Mobile Responsiveness', 'Accessibility']
  const statSig = proc.statisticalSignificance(v1, v2, metricsList)
  assert.equal(typeof statSig, 'number')
  assert.ok(statSig >= 0)

  const driftScore = proc.computeDriftScore({ statisticalSignificance: statSig, llmConfidence: 0.75, deltaTSeconds: 60 * 60 * 24 })
  assert.equal(typeof driftScore, 'number')

  // Intent accuracy on v2 rows
  const personalisationScores = v2.map((r) => Number.parseFloat(r.Personalization) || 0)
  const experienceRatings = v2.map((r) => Number.parseFloat(r.ExperienceRating) || 0)
  const intentAcc = proc.intentAccuracy(personalisationScores, experienceRatings)
  assert.equal(typeof intentAcc, 'number')
  assert.ok(intentAcc >= -1 && intentAcc <= 1)
})
