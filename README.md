

## Overview

GenUX introduces a novel, two-mode framework for detecting user behavioral drift in Generative User Experience (GenUX) systems. By integrating statistical analysis with the contextual power of Large Language Models (LLMs), GenUX delivers adaptive, real-time user interfaces that evolve with user behavior. The framework addresses the limitations of traditional drift detection methods by capturing subtle, contextual changes and providing actionable, human-readable insights.

---

## Research Highlights

- **Hybrid Detection Approach:**  
  GenUX combines fast, statistical drift monitoring (156 ms latency) with in-depth, LLM-driven behavioral analysis (2,100 ms latency), leveraging Google's Gemini API for qualitative insights.

- **High Accuracy and Fewer False Positives:**  
  Experimental results on 2,847 user interaction records across five dataset versions show an **84.7% drift detection accuracy**—a **23.4% improvement** over statistical-only methods and **67% fewer false positives**.

- **Primary Behavior Shifts Detected:**  
  - Personalization acceptance
  - Performance expectations
  - Cyclical user trust

- **Scalable and Adaptive:**  
  The multi-layered system architecture ensures real-time responsiveness while delivering deep behavioral insights, making it suitable for web, mobile, and desktop platforms.

---

## System Architecture

GenUX consists of four main components:

1. **Data Collection Layer:**  
   Aggregates user interaction data from diverse sources (web, mobile, desktop).

2. **Statistical Analysis Engine:**  
   Monitors UX metrics (e.g., click-through rate, time-on-task, scroll depth) for quantitative drift using normalized mean shifts.

3. **LLM Analysis Layer:**  
   Provides qualitative interpretation of user behaviors via Gemini API, enabling context-aware drift detection and actionable recommendations.

4. **Decision Engine:**  
   Fuses statistical and LLM insights to drive adaptive UI recommendations.

**Pipeline Illustration:**  
Data flows from collection through statistical and LLM analysis, merging insights in a fusion layer, and finally triggering outputs such as dashboards, APIs, or adaptive UI changes.

### Architecture Diagram
![GenUX System Architecture](Architecture.png)

---


## Experimental Setup

- **Dataset:**  
  - 2,847 interaction records collected over six months, five interface versions.
  - Captured 17 UX dimensions (personalization, loading speed, responsiveness, accessibility, error rates, semantic feedback, etc.).
  - Platforms: Web (45%), Mobile (35%), Desktop (20%).
  - Dataset is **publicly available on Kaggle**:  
    [UI UX Dataset](https://www.kaggle.com/datasets/mdatikurrahman3111/ui-ux-dataset)

- **Environment:**  
  - Intel Core i5-10400, 8GB RAM, standard consumer laptop (no discrete GPU).
  - Real-time statistical mode: 156 ms latency.
  - LLM drift detection mode: ~2,100 ms every 5–10 minutes.

---

## Results

- **Performance:**  
  - 84.7% drift detection accuracy (23.4% improvement over statistical-only, 11.2% over ML-based).
  - 67% reduction in false positives.
  - Intent match recognition: 78.3% (vs. 71.2% ML-based, 58.9% rule-based).
  - LLM analysis: 100% API call success, 86.1% average confidence.
  - System robust to real-time and periodic drift detection.

- **Version-Wise Insights:**  
  - Behavioral drift traces revealed personalization resistance, performance expectation cycles, and trust recovery across system updates.
  - LLMs justified subtle user behavior changes, providing actionable insights for UI adaptation.

---

## Threat Analysis & Mitigation

- **Risks Identified:**  
  - Data/model drift, API vulnerabilities, privacy, intent match degradation, and performance bottlenecks.
- **Mitigation Steps:**  
  - Adaptive thresholds, fallback LLM ensembles, continuous learning.
  - Daily API key rotation, CSP, TLS 1.3, input sanitization.
  - Caching, pagination, lazy loading for performance.

---

## Discussion & Future Work

GenUX demonstrates that integrating LLMs into drift detection pipelines enhances both accuracy and interpretability. The hybrid approach not only detects behavioral changes with higher precision but also provides actionable explanations, empowering designers to make user-aligned UI adaptations.

**Limitations:**  
- LLM-based analysis introduces processing latency and higher resource consumption.
- Over-reliance on third-party LLMs raises cost and privacy concerns for large-scale, long-term deployment.

**Future Directions:**  
- Optimize processing time and resource utilization.
- Explore multi-LLM ensemble frameworks for greater robustness.
- Validate GenUX in broader application domains.

---

## Funding

Partially funded by the Department of Computer Science and Engineering, Chennai Institute of Technology, Kundrathur, Chennai, Tamil Nadu, India-6000069.

---

## References

A full list of references is available in the research paper. Key references include ACM Computing Surveys, IEEE Transactions on Human-Machine Systems, and recent works on hybrid drift detection, intent recognition, and adaptive UX systems.

---

## Data Availability

The dataset used in this research is open for educational and research use:  
[UI UX Dataset on Kaggle](https://www.kaggle.com/datasets/mdatikurrahman3111/ui-ux-dataset)

---

## Citation

If you use GenUX or the associated research, please cite:

```
Mithradevi Kumar, "LLM-Based User Behavior Drift Detection Framework for Generative User Experience Systems", Chennai Institute of Technology, 2025.
```

---

## Contact

For questions or collaboration opportunities, contact Mithradevi Kumar at mithradevik.cse2023@citcchennai.net.

---
