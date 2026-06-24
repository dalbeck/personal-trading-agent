# Build Spec — verdict colors + confidence meter

_Executable spec for a local Claude Code session. Read `AGENTS.md` + `.agents/design-system.md` (note the new "Status & verdict colors" and "Confidence & model self-ratings" rules) + `.agents/nextjs.md` first. Two small feature branches + PRs. No real-money paths._

## M1 — `feature/verdict-colors` — semantic, readable advisory verdict
The advisory verdict currently renders the **lime accent** as status text on a pale lime tint — near-invisible in light mode. Fix it to **semantic** colors everywhere the verdict appears (Overview "Evaluation gate" module **and** the full `/evaluation` scorecard):

- Go-candidate → **success** (green), Iterate → **warning** (amber), No-go → **danger** (red), Incomplete → **neutral/muted**.
- Dark-enough text on a light tint of the same hue; **≥4.5:1 contrast** in both light and dark. No lime for status.
- **Acceptance:** all four verdict states render with the correct semantic color and pass contrast in both themes; visually verify each.

## M2 — `feature/confidence-meter` — legible, scaled confidence
Replace the thin, easily-lost confidence bar with a **labeled segmented meter** wherever confidence appears (proposal cards in the Overview module + the Proposals view):

- A **Low / Moderate / High** bucket label + the number (e.g. "Moderate · 55%") and a **segmented** meter (e.g. 5 segments).
- Buckets (confirm thresholds): **Low < 40 · Moderate 40–69 · High ≥ 70**.
- **Neutral** meter color — not gain/loss green-red (high confidence ≠ good trade).
- A tooltip framing it as **model self-rated and uncalibrated** — one input alongside the risk rails and red-team, not a probability. Label it "Model confidence."
- **Accessibility:** the meter carries an `aria-label` like "Model confidence: Moderate, 55%".
- **Acceptance:** the meter is legible and labeled, neutral-colored, buckets compute correctly, tooltip present, light + dark + a11y verified; unit-test the bucket function.

## Out of scope
- Real-money paths; changing how confidence is produced (presentation only).
