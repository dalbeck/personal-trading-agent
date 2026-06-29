# Red-Team Logic Fixes — Implementation Brief

Source: review of 12 manual proposals (2026-06-29 batch). 11 rejections were upheld, 1 was "concern" (ABBV). Two rejections reached the correct outcome but exposed bugs in the red-team reasoning layer. Fix both. ABBV needs no code change.

Do NOT change any of the individual proposal verdicts. These are systemic rule fixes only.

---

## Issue 1 (priority) — Bank/financial metrics misapplied as value-trap signals

**Symptom:** INTR (Inter & Co, a digital bank, sector "Finance") was rejected with the basis: "declining FCF, net debt $18.63B, D/E 3.1, and interest coverage 0.3x ... value-trap tell."

**Why it's wrong:** Debt/equity, "net debt," and interest-coverage ratios are not meaningful solvency or value-trap signals for banks and other financial institutions. Banks are funded by deposits and carry high leverage and large debt balances by design; 0.3x "interest coverage" computed the generic way is a category error. The rejection outcome was still defensible on weak why-now (earnings months out), but the *stated reasoning* will misfire on every Finance-sector name the agent ever evaluates.

**Fix:**
- When `sector` is Finance (banks, insurers, capital markets, etc.), suppress or replace the generic leverage/coverage/net-debt factors in the red-team cash-flow-quality check.
- Either (a) gate those factors off for financials, or (b) substitute bank-appropriate metrics if available (e.g., capital adequacy, ROA/ROE, NIM, efficiency ratio, NPL trend). Option (a) is acceptable as a first pass if bank metrics aren't in the data feed.
- The red-team `basis`/`notes` text must stop citing D/E, net debt, and interest coverage for financial-sector tickers.

**Acceptance:**
- Re-running the red team on INTR no longer cites D/E / net debt / interest coverage as the fatal flaw. If still rejected, the basis rests on catalyst/why-now quality, not misapplied leverage metrics.
- A spot-check on at least one other Finance-sector name (e.g., LOB, FRME, BRK.B, RYN) confirms generic leverage factors are no longer fired for that sector.

---

## Issue 2 — Trend-mandate catalyst rule is ambiguous / over-rejecting on timing

**Symptom:** FRME (trend setup) was rejected solely on catalyst timing — "named earnings catalyst is nearly four months away" (Oct 23, 2026 vs. a late-June eval). But the technicals were the cleanest in the batch: price above a rising 50- and 200-day with 2.60x relative volume — genuine confirmation.

**Why it matters:** A *trend* strategy is, by definition, structure-and-momentum driven. Requiring a near-term named catalyst to approve a volume-confirmed trend contradicts the mandate and will systematically cut clean trend setups. Compare: BRK.B and LOB were correctly rejected partly on weak volume (0.98x, 1.12x) — there the volume test did real work. FRME passed that test and was still rejected.

**Fix — make the rule explicit (pick one and encode it):**
- **Option A (recommended):** For trend setups, volume-confirmed structure (e.g., relVol >= threshold AND price above rising 50/200-day) satisfies the "why now." A far-dated or absent named catalyst is NOT sufficient grounds for rejection on its own. Catalyst timing can lower conviction but not force a reject when structure + volume pass.
- **Option B:** Keep the near-term-catalyst requirement, but then it must be a documented, intentional mandate rule — and the rejection language should say "trend mandate requires a catalyst within N days," not frame strong volume as if it failed.

Do not leave this case-by-case. The current behavior reads as an unstated rule applied inconsistently.

**Acceptance:**
- The trend-mandate catalyst/volume logic is documented in code/config with an explicit threshold and precedence (does volume confirmation override catalyst timing, or not).
- Re-running FRME yields a verdict consistent with the chosen rule, with reasoning that matches the rule rather than penalizing a setup that passed the volume test.

---

## No change needed — ABBV ("concern")

ABBV correctly resolved to "concern," not reject: it cleared the hard rails with the strongest volume in the batch (3.0x) and a genuine company-specific M&A event, but the setup is a headline-spike chase with no demonstrated relative-strength base and only 2:1 R:R. The middle verdict is working as intended. Leave it.

---

## Out of scope
- No changes to position sizing, stop/target math, or the rails themselves.
- No manual overrides of the 11 upheld rejections.
- If the data feed lacks bank-specific metrics, ship Issue 1 as factor-suppression now and open a follow-up for richer financial-sector metrics.
