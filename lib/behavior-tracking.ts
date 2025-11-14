// Advanced Behavior Tracking System
export class BehaviorTracker {
  private interactions: any[] = []
  private heatmapData: any[] = []
  private frustrationDetector: any
  private readonly MAX_HEATMAP_SIZE = 10000 // Circular buffer limit (~2min at 60Hz)
  private readonly MAX_INTERACTIONS = 5000
  private lastClickTime?: number
  private lastClickTarget?: string

  constructor() {
    this.frustrationDetector = {}
    this.initializeTracking()
  }

  private initializeTracking() {
    // Guard for non-browser environments
    if (typeof document === 'undefined') return

    // Mouse movement tracking
    document.addEventListener("mousemove", this.trackMouseMovement.bind(this))

    // Click pattern analysis
    if (typeof (this as any).analyzeClickPattern === 'function') {
      document.addEventListener("click", (this as any).analyzeClickPattern.bind(this))
    }

    // Scroll behavior tracking
    if (typeof (this as any).trackScrollBehavior === 'function') {
      document.addEventListener("scroll", (this as any).trackScrollBehavior.bind(this))
    }

    // Form interaction analysis
    if (typeof (this as any).analyzeFormInteraction === 'function') {
      document.addEventListener("input", (this as any).analyzeFormInteraction.bind(this))
    }

    // Mobile gesture tracking
    if ("ontouchstart" in window) {
      this.initializeTouchTracking()
    }

    // Eye tracking (if available)
    if (navigator.mediaDevices) {
      this.initializeEyeTracking()
    }
  }

  // Advanced mouse movement analysis
  private trackMouseMovement(event: MouseEvent) {
    const interaction: any = {
      timestamp: new Date(),
      eventType: "hover",
      coordinates: { x: event.clientX, y: event.clientY },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    }

    // Detect hesitation patterns
    const hesitation = this.detectHesitation(event)
    if (hesitation.isHesitating) {
      this.frustrationDetector.recordHesitation(hesitation)
    }

    // Build heatmap data
    this.heatmapData.push({
      x: event.clientX,
      y: event.clientY,
      timestamp: Date.now(),
      intensity: this.calculateIntensity(event),
    })
    // O(1) amortized: only trims when size exceeded
    this.enforceHeatmapLimit()
  }

  // Click pattern analysis for frustration detection
  private analyzeClickPattern(event: MouseEvent) {
    const clickData = {
      timestamp: Date.now(),
      coordinates: { x: event.clientX, y: event.clientY },
      element: event.target as HTMLElement,
      isRapidClick: this.detectRapidClicking(event),
      isDeadClick: this.detectDeadClick(event),
    }

    // Detect frustration indicators
    if (clickData.isRapidClick || clickData.isDeadClick) {
      this.frustrationDetector.recordFrustration({
        type: clickData.isRapidClick ? "rapid_clicking" : "dead_click",
        severity: clickData.isRapidClick ? 0.7 : 0.9,
        element: clickData.element.id || clickData.element.className,
        timestamp: new Date(),
      })
    }
  }

  // Mobile-specific gesture tracking
  private initializeTouchTracking() {
    let touchStartTime: number
    let touchStartPos: { x: number; y: number }

    document.addEventListener("touchstart", (event) => {
      touchStartTime = Date.now()
      touchStartPos = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      }
    })

    document.addEventListener("touchend", (event) => {
      const touchEndTime = Date.now()
      const touchDuration = touchEndTime - touchStartTime

      const gesture = this.classifyGesture({
        duration: touchDuration,
        startPos: touchStartPos,
        endPos: {
          x: event.changedTouches[0].clientX,
          y: event.changedTouches[0].clientY,
        },
      })

      this.recordGesture(gesture)
    })
  }

  // Eye tracking integration (WebGazer.js or similar)
  private async initializeEyeTracking() {
    try {
      // Initialize eye tracking library
      const eyeTracker = await import("webgazer")

      eyeTracker.default
        .setGazeListener((data: any) => {
          if (data) {
            this.recordGazeData({
              x: data.x,
              y: data.y,
              timestamp: Date.now(),
              confidence: data.confidence || 0.5,
            })
          }
        })
        .begin()
    } catch (error) {
      console.log("Eye tracking not available:", error)
    }
  }

  // Frustration detection algorithm
  private detectHesitation(event: MouseEvent): { isHesitating: boolean; severity: number } {
    // Analyze mouse movement patterns for hesitation
    const recentMovements = this.getRecentMouseMovements(1000) // Last 1 second

    if (recentMovements.length < 5) return { isHesitating: false, severity: 0 }

    // Calculate movement entropy (randomness indicates confusion)
    const entropy = this.calculateMovementEntropy(recentMovements)
    const velocity = this.calculateAverageVelocity(recentMovements)

    // Low velocity + high entropy = hesitation
    const isHesitating = velocity < 50 && entropy > 0.7
    const severity = entropy * (1 - velocity / 100)

    return { isHesitating, severity }
  }

  private getRecentMouseMovements(duration: number): any[] {
    const cutoff = Date.now() - duration
    // return last movements within duration
    return this.heatmapData.filter((h) => h.timestamp >= cutoff)
  }

  private calculateMovementEntropy(movements: any[]): number {
    if (!movements || movements.length < 2) return 0
    // discretize directions into bins
    const dirs: Record<string, number> = {}
    for (let i = 1; i < movements.length; i++) {
      const a = movements[i - 1]
      const b = movements[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI / 30) * 30
      const key = String(angle)
      dirs[key] = (dirs[key] || 0) + 1
    }
    const total = Object.values(dirs).reduce((s, v) => s + v, 0)
    let entropy = 0
    for (const k in dirs) {
      const p = dirs[k] / total
      entropy -= p * Math.log2(p)
    }
    // normalize to [0,1]
    const max = Math.log2(Math.max(2, Object.keys(dirs).length))
    return max === 0 ? 0 : Math.min(1, entropy / max)
  }

  private calculateAverageVelocity(movements: any[]): number {
    if (!movements || movements.length < 2) return 0
    let s = 0
    let count = 0
    for (let i = 1; i < movements.length; i++) {
      const a = movements[i - 1]
      const b = movements[i]
      const dt = (b.timestamp - a.timestamp) / 1000
      if (dt <= 0) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      s += dist / dt
      count++
    }
    return count === 0 ? 0 : s / count
  }

  private classifyGesture(gestureData: any): any {
    // Simple classifier: swipe if distance > 50 and duration < 500ms
    const dx = gestureData.endPos.x - gestureData.startPos.x
    const dy = gestureData.endPos.y - gestureData.startPos.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const type = dist > 50 && gestureData.duration < 500 ? 'swipe' : 'tap'
    return { type, duration: gestureData.duration, distance: dist }
  }

  private recordGesture(gesture: any): void {
    this.interactions.push({ type: 'gesture', gesture, timestamp: Date.now() })
    this.enforceInteractionLimit()
  }

  private calculateIntensity(event: MouseEvent): number {
    // intensity based on movement speed relative to viewport size
    const v = Math.sqrt(Math.pow(event.movementX || 0, 2) + Math.pow(event.movementY || 0, 2))
    const norm = Math.min(1, v / Math.max(1, window.innerWidth / 10))
    return Number((norm).toFixed(2))
  }

  private detectRapidClicking(event: MouseEvent): boolean {
    const now = Date.now()
    const last = this.lastClickTime || 0
    this.lastClickTime = now
    const diff = now - last
    return diff > 0 && diff < 300 // clicks within 300ms
  }

  private detectDeadClick(event: MouseEvent): boolean {
    const target = (event.target as HTMLElement)?.id || (event.target as HTMLElement)?.className || ''
    const lastTarget = this.lastClickTarget || ''
    this.lastClickTarget = target
    // dead click heuristic: same element clicked many times but no navigation
    return !!(target && target === lastTarget)
  }

  private recordGazeData(data: any): void {
    this.interactions.push({ type: 'gaze', data, timestamp: Date.now() })
    this.enforceInteractionLimit()
  }

  // Enforce circular buffer on heatmapData to prevent unbounded growth
  private enforceHeatmapLimit(): void {
    if (this.heatmapData.length > this.MAX_HEATMAP_SIZE) {
      // Remove oldest 10% of records (sliding window)
      const trimCount = Math.floor(this.MAX_HEATMAP_SIZE * 0.1)
      this.heatmapData.splice(0, trimCount)
    }
  }

  // Enforce limit on interactions array
  private enforceInteractionLimit(): void {
    if (this.interactions.length > this.MAX_INTERACTIONS) {
      const trimCount = Math.floor(this.MAX_INTERACTIONS * 0.1)
      this.interactions.splice(0, trimCount)
    }
  }
}
