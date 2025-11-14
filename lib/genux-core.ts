// Core GenUX Engine - The Novel Part
import { BehaviorLearningModel } from "./BehaviorLearningModel"
import { UIGenerator } from "./UIGenerator"
import { DeploymentEngine } from "./DeploymentEngine"

export interface UserInteraction {
  userId: string
  sessionId: string
  timestamp: Date
  eventType: "click" | "scroll" | "hover" | "focus" | "resize" | "gesture"
  elementId: string
  elementType: string
  coordinates: { x: number; y: number }
  viewport: { width: number; height: number }
  device: "mobile" | "desktop" | "tablet"
  platform: "web" | "ios" | "android"
  context: {
    taskType: string
    userIntent: string
    frustrationLevel: number
    completionRate: number
  }
}

export interface UIComponent {
  id: string
  type: "button" | "form" | "navigation" | "content" | "layout"
  properties: {
    position: { x: number; y: number }
    size: { width: number; height: number }
    color: string
    typography: string
    visibility: boolean
    priority: number
  }
  performance: {
    clickRate: number
    conversionRate: number
    errorRate: number
    timeToInteract: number
  }
}

export class GenUXEngine {
  private behaviorModel: BehaviorLearningModel
  private uiGenerator: UIGenerator
  private deploymentEngine: DeploymentEngine

  constructor() {
    this.behaviorModel = new BehaviorLearningModel()
    this.uiGenerator = new UIGenerator()
    this.deploymentEngine = new DeploymentEngine()
  }

  // Core GenUX Process
  async processUserInteraction(interaction: UserInteraction): Promise<void> {
    // 1. Learn from interaction (best-effort)
    try {
      if (this.behaviorModel && typeof (this.behaviorModel as any).learn === 'function') {
        await this.behaviorModel.learn(interaction)
      }
    } catch (err) {
      console.warn('behaviorModel.learn failed:', (err as any)?.message || String(err))
    }

    // 2. Predict user needs (best-effort)
    let prediction: any = { confidence: 0 }
    try {
      if (this.behaviorModel && typeof (this.behaviorModel as any).predictUserNeeds === 'function') {
        prediction = await this.behaviorModel.predictUserNeeds(interaction.userId)
      }
    } catch (err) {
      console.warn('behaviorModel.predictUserNeeds failed:', (err as any)?.message || String(err))
    }

    // 3. Generate optimized UI and safely A/B test + deploy
    if (prediction && prediction.confidence > 0.8) {
      try {
        // prefer generateOptimizedInterface if available, else generatePersonalizedUI
        let optimizedUI
        if (typeof (this.uiGenerator as any).generateOptimizedInterface === 'function') {
          optimizedUI = await (this.uiGenerator as any).generateOptimizedInterface(prediction)
        } else {
          // map prediction -> userProfile/context shape for generatePersonalizedUI
          const userProfile = prediction.userProfile || { personalizationScores: prediction.personalizationScores || [], completionRate: prediction.completionRate || 0.6, commonPaths: prediction.commonPaths || [], formBehavior: prediction.formBehavior || {}, readingPatterns: prediction.readingPatterns || [], conversionBehavior: prediction.conversionBehavior || {} }
          const ctx = prediction.context || {}
          optimizedUI = await this.uiGenerator.generatePersonalizedUI(userProfile, ctx)
        }

        // 4. A/B test the change
        const testResult = await this.deploymentEngine.runABTest(optimizedUI)

        // 5. Deploy if successful
        if (testResult && testResult.improvement > 0.05) {
          await this.deploymentEngine.deployUIChange(optimizedUI)
        }
      } catch (err) {
        console.warn('UI generation / deployment failed:', (err as any)?.message || String(err))
      }
    }
  }

  // Real-time adaptation
  async adaptInterface(userId: string, context: any): Promise<UIComponent[]> {
    const userProfile = await this.behaviorModel.getUserProfile(userId)
    const currentContext = await this.analyzeContext(context)

    return await this.uiGenerator.generatePersonalizedUI(userProfile, currentContext)
  }

  private async analyzeContext(context: any): Promise<any> {
    // Lightweight context normalization: extract key fields and provide defaults
    try {
      const normalized = {
        taskType: context?.taskType || 'browse',
        userIntent: context?.userIntent || (context?.query ? 'search' : 'explore'),
        device: context?.device || 'web',
        frustrationLevel: typeof context?.frustrationLevel === 'number' ? context.frustrationLevel : 0,
        completionRate: typeof context?.completionRate === 'number' ? context.completionRate : 0.75,
        timestamp: context?.timestamp || new Date().toISOString(),
      }
      return normalized
    } catch (err) {
      return { taskType: 'browse', userIntent: 'explore', device: 'web', frustrationLevel: 0, completionRate: 0.75 }
    }
  }
}
