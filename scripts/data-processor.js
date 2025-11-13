// Real-time data processing script for GenUX metrics
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class GenUXDataProcessor {
  constructor() {
    this.metrics = {
      adaptationEffectiveness: 0,
      mlPerformance: 0,
      systemResponsiveness: 0,
      userEngagement: 0,
      intentMatchRate: 0,
      driftDetectionAccuracy: 0,
      uiGenerationLatency: 0,
    }
  }

  // Main lightweight processor that computes high-level metrics from a batch
  processRealTimeData(data) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("data must be a non-empty array")
    }

    // Calculate adaptation effectiveness (paper: personalization + UX sentiment)
    const avgPersonalization = this.calculateAverage(data, "Personalization")
    const avgUXSentiment = this.calculateUXSentiment(data)
    this.metrics.adaptationEffectiveness = (avgPersonalization + avgUXSentiment) / 2

    // ML performance and intent match (simple proxies)
    this.metrics.mlPerformance = avgPersonalization
    this.metrics.intentMatchRate = (avgPersonalization / 5) * 100

    // System responsiveness and UI generation latency (proxy)
    this.metrics.systemResponsiveness = this.calculateAverage(data, "Loading Speed")
    this.metrics.uiGenerationLatency = Math.max(0, (6 - this.metrics.systemResponsiveness) * 60)

    // User engagement: mobile responsiveness + accessibility
    const avgMobile = this.calculateAverage(data, "Mobile Responsiveness")
    const avgAccessibility = this.calculateAverage(data, "Accessibility")
    this.metrics.userEngagement = (avgMobile + avgAccessibility) / 2

    // Drift detection accuracy placeholder (will be computed by statistical functions)
    const variance = this.calculateVariance(data, "Personalization")
    this.metrics.driftDetectionAccuracy = Math.max(50, 100 - variance * 10)

    return this.metrics
  }

  // Compute statistical significance per paper: average over metrics of |mu_curr - mu_prev| / sigma_pooled
  statisticalSignificance(prevData, currData, metricsList) {
    if (!Array.isArray(prevData) || !Array.isArray(currData)) {
      throw new Error("prevData and currData must be arrays")
    }

    const eps = 1e-6
    const scores = metricsList.map((m) => {
      const prevVals = prevData.map((d) => Number.parseFloat(d[m]) || 0)
      const currVals = currData.map((d) => Number.parseFloat(d[m]) || 0)
      const muPrev = mean(prevVals)
      const muCurr = mean(currVals)
      const varPrev = variance(prevVals)
      const varCurr = variance(currVals)
      const sigmaPooled = Math.sqrt((varPrev + varCurr) / 2) + eps
      return Math.abs(muCurr - muPrev) / sigmaPooled
    })

    return scores.reduce((s, v) => s + v, 0) / Math.max(1, scores.length)
  }

  // Change percent per metric using paper-like normalization
  changePercent(prevAvg, currAvg) {
    const denom = (Math.abs(prevAvg) + Math.abs(currAvg)) / 2 || 1e-6
    return Math.abs(currAvg - prevAvg) / denom
  }

  // Compute combined drift score: alpha*stat + beta*llmConf + gamma*temporalWeight
  computeDriftScore({ statisticalSignificance = 0, llmConfidence = 0, deltaTSeconds = 0, alpha = 0.4, beta = 0.5, gamma = 0.1, lambda = 1 / (60 * 60 * 24) }) {
    const temporalWeight = Math.exp(-lambda * deltaTSeconds)
    return alpha * statisticalSignificance + beta * llmConfidence + gamma * temporalWeight
  }

  // Intent accuracy per paper: 1 - (sum |PersonalisationScore - ExperienceRating|) / (nusers * 4)
  intentAccuracy(personalisationScores, experienceRatings) {
    if (personalisationScores.length !== experienceRatings.length) {
      throw new Error("arrays must be same length")
    }
    const n = personalisationScores.length
    const sum = personalisationScores.reduce((acc, p, i) => acc + Math.abs(p - experienceRatings[i]), 0)
    return 1 - sum / (n * 4)
  }

  calculateAverage(data, field) {
    const values = data.map((d) => {
      const v = d[field]
      if (v === undefined || v === null || v === "") return 0
      return Number.parseFloat(v) || 0
    })
    return values.reduce((sum, val) => sum + val, 0) / Math.max(1, values.length)
  }

  calculateUXSentiment(data) {
    const sentimentMap = {
      Intuitive: 5,
      Smooth: 5,
      Efficient: 4,
      Good: 4,
      Moderate: 3,
      Average: 3,
      Confusing: 2,
      Frustrating: 2,
      Overwhelming: 1,
      Poor: 1,
    }

    const sentiments = data.map((d) => sentimentMap[d.User_experience] || 3)
    return sentiments.reduce((sum, val) => sum + val, 0) / Math.max(1, sentiments.length)
  }

  calculateVariance(data, field) {
    const values = data.map((d) => Number.parseFloat(d[field]) || 0)
    return variance(values)
  }
}

// small helpers
function mean(arr) {
  if (!arr || arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function variance(arr) {
  if (!arr || arr.length === 0) return 0
  const m = mean(arr)
  return arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length
}

// Simple CSV loader (very small, dependency-free). Returns array of objects.
function loadCsv(path) {
  const raw = fs.readFileSync(path, "utf8")
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  const headers = lines[0].split(/,|;|\t/).map((h) => h.trim())
  const rows = lines.slice(1).map((line) => {
    const parts = line.split(/,|;|\t/)
    const obj = {}
    headers.forEach((h, i) => (obj[h] = parts[i] ? parts[i].trim() : ""))
    return obj
  })
  return rows
}

// CLI: node scripts/data-processor.js path/to/data.csv
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    console.log("Usage: node scripts/data-processor.js path/to/data.csv")
    process.exit(0)
  }
  const filePath = argv[0]
  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath)
    process.exit(2)
  }
  const rows = loadCsv(filePath)
  const processor = new GenUXDataProcessor()
  // split into prev and curr halves if possible
  const half = Math.floor(rows.length / 2) || 1
  const prev = rows.slice(0, half)
  const curr = rows.slice(half)
  try {
    const statSig = processor.statisticalSignificance(prev, curr, ["Personalization", "Loading Speed", "Mobile Responsiveness", "Accessibility"])
    const driftScore = processor.computeDriftScore({ statisticalSignificance: statSig, llmConfidence: 0.7, deltaTSeconds: 60 * 60 * 24 })
    console.log("StatisticalSignificance:", statSig)
    console.log("DriftScore (alpha=0.4,beta=0.5,gamma=0.1):", driftScore)
    const metrics = processor.processRealTimeData(rows)
    console.log("High-level metrics:", metrics)
  } catch (err) {
    console.error("Error processing data:", err?.message || String(err))
    process.exit(3)
  }
}

export { GenUXDataProcessor, loadCsv, mean, variance }
