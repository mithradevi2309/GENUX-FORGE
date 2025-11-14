import assert from 'node:assert/strict'
import test from 'node:test'
import { GenUXDataProcessor, mean, variance } from '../scripts/data-processor.js'

test('mean and variance helpers', () => {
  assert.equal(mean([1, 2, 3]), 2)
  // variance of [1,2,3] is 2/3
  const v = variance([1, 2, 3])
  assert.ok(Math.abs(v - 0.6666666) < 1e-6)
})

test('statisticalSignificance simple case', () => {
  const p = [ { Personalization: '1' }, { Personalization: '1' } ]
  const c = [ { Personalization: '3' }, { Personalization: '3' } ]
  const proc = new GenUXDataProcessor()
  const ss = proc.statisticalSignificance(p, c, ['Personalization'])
  // muPrev=1 muCurr=3 varPrev=0 varCurr=0 -> sigmaPooled ~= eps so the value will be large
  assert.ok(ss > 1000)
})

test('computeDriftScore uses weights and temporal decay', () => {
  const proc = new GenUXDataProcessor()
  const stat = 0.5
  const llm = 0.8
  const scoreNow = proc.computeDriftScore({ statisticalSignificance: stat, llmConfidence: llm, deltaTSeconds: 0 })
  const scoreLater = proc.computeDriftScore({ statisticalSignificance: stat, llmConfidence: llm, deltaTSeconds: 60 * 60 * 24 * 30 })
  // scoreNow should be larger because temporal weight decays
  assert.ok(scoreNow >= scoreLater)
})

test('processRealTimeData computes metrics and returns object', () => {
  const rows = [
    { Personalization: '4', 'Loading Speed': '4', 'Mobile Responsiveness': '4', Accessibility: '4', User_experience: 'Good' },
    { Personalization: '3', 'Loading Speed': '3', 'Mobile Responsiveness': '3', Accessibility: '3', User_experience: 'Average' },
  ]
  const proc = new GenUXDataProcessor()
  const metrics = proc.processRealTimeData(rows)
  assert.equal(typeof metrics.adaptationEffectiveness, 'number')
  assert.equal(typeof metrics.intentMatchRate, 'number')
})
