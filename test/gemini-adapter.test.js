import assert from 'node:assert/strict'
import test from 'node:test'
import { analyze } from '../lib/gemini-adapter.js'

test('gemini adapter offline deterministic response', async () => {
  const res = await analyze({ query: 'Test', data: [{ Personalization: '3' }], metrics: { mlPerformance: 3, systemResponsiveness: 4, intentMatchRate: 75, statisticalSignificance: 0.2 } })
  assert.equal(typeof res.interpretation, 'string')
  assert.ok(res.confidence >= 0 && res.confidence <= 1)
})

test('gemini adapter live mode without key throws', async () => {
  const prevMode = process.env.GEMINI_MODE
  process.env.GEMINI_MODE = 'live'
  try {
    let threw = false
    try {
      await analyze({ query: 'Should fail in test', data: [], metrics: {} })
    } catch (e) {
      threw = true
    }
    assert.ok(threw, 'Expected analyze to throw when live mode and no key')
  } finally {
    process.env.GEMINI_MODE = prevMode
  }
})
