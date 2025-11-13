
import csv
import matplotlib.pyplot as plt
import sys

# Read CSV
data = {'threshold': [], 'precision': [], 'recall': [], 'f1': [], 'fpr': []}
with open('/workspaces/GENUX-FORGE/sensitivity-metrics.csv', 'r') as f:
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
fig.savefig('/workspaces/GENUX-FORGE/sensitivity-plot-pr.png', dpi=100, bbox_inches='tight')
print('Saved: /workspaces/GENUX-FORGE/sensitivity-plot-pr.png')

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
fig.savefig('/workspaces/GENUX-FORGE/sensitivity-plot-threshold.png', dpi=100, bbox_inches='tight')
print('Saved: /workspaces/GENUX-FORGE/sensitivity-plot-threshold.png')

# Plot 3: ROC-like (FPR vs Recall)
fig, ax = plt.subplots(1, 1, figsize=(8, 6))
ax.plot(data['fpr'], data['recall'], 'o-', linewidth=2, markersize=6, color='red', label='ROC (approx)')
ax.set_xlabel('False Positive Rate (FPR)')
ax.set_ylabel('True Positive Rate (Recall)')
ax.set_title('GenUX Drift Detection: FPR vs TPR')
ax.grid(True, alpha=0.3)
ax.legend()
fig.savefig('/workspaces/GENUX-FORGE/sensitivity-plot-roc.png', dpi=100, bbox_inches='tight')
print('Saved: /workspaces/GENUX-FORGE/sensitivity-plot-roc.png')

plt.close('all')
