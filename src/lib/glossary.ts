/**
 * One central glossary for the jargon/acronyms used across the dashboard.
 * Definitions live here once and are reused everywhere via the `<Term>`
 * component (`src/components/term.tsx`) — never hardcode an explanation inline.
 *
 * `label` is the canonical display text; `definition` is one or two plain
 * sentences; `caveat` (optional) carries the honest limitation we already
 * surface elsewhere (uncalibrated confidence, IEX vs the consolidated tape,
 * metered Perplexity, the dry-run sink, advisory vs approvable).
 */
export interface GlossaryEntry {
  label: string;
  definition: string;
  caveat?: string;
}

export const GLOSSARY = {
  "rr": {
    label: "R:R",
    definition:
      "Reward-to-risk — the distance from entry to the take-profit divided by the distance from entry to the stop. The charter requires at least 2:1.",
  },
  "atr": {
    label: "ATR",
    definition:
      "Average True Range — a measure of a symbol's typical daily price movement, used to size stops relative to volatility.",
  },
  "drawdown": {
    label: "drawdown",
    definition:
      "The decline from a portfolio's high-water mark to a later low, as a percentage. Max drawdown is the worst such drop over the window.",
  },
  "relative-volume": {
    label: "relative volume",
    definition:
      "Today's trading volume versus the symbol's recent average — a confirmation that real activity backs a move, not a thin drift.",
  },
  "marketable-limit": {
    label: "marketable-limit order",
    definition:
      "A limit order priced through the current quote so it fills immediately like a market order, but with a hard cap on the price paid — no unbounded slippage.",
  },
  "protective-stop": {
    label: "protective stop",
    definition:
      "A pre-set exit below (for a long) the entry that caps the loss if the thesis fails. Every buy must carry one.",
  },
  "spy": {
    label: "SPY",
    definition:
      "The S&P 500 ETF, used purely as the benchmark to measure excess return (alpha) against. It is never held.",
  },
  "alpha": {
    label: "excess return (alpha)",
    definition:
      "The desk's return minus the benchmark's over the same window — the value added beyond just owning the index.",
  },
  "sharpe": {
    label: "Sharpe",
    definition:
      "Return divided by its volatility (here with a zero risk-free rate) — higher means smoother, more efficient returns.",
  },
  "profit-factor": {
    label: "profit factor",
    definition:
      "Gross profit divided by gross loss across closed trades. Above 1 is net-profitable; higher is better.",
  },
  "win-rate": {
    label: "win rate",
    definition:
      "The share of closed round-trips that ended in a profit. High win rate with tiny wins can still lose money — read it with profit factor.",
  },
  "iex": {
    label: "IEX feed",
    definition:
      "The market-data feed from the IEX exchange that the free Alpaca tier provides for quotes and bars.",
    caveat:
      "Not the consolidated SIP tape — it reflects IEX activity only, so prices can differ slightly from the full market.",
  },
  "red-team": {
    label: "red-team",
    definition:
      "A hostile second-opinion pass: a different model (Codex) argues against each proposal as a prosecutor and must be cleared before approval.",
    caveat:
      "Fails closed — if it errors or can't be parsed, the verdict defaults to reject.",
  },
  "advisory-vs-approvable": {
    label: "advisory vs approvable",
    definition:
      "Advisory proposals are guidance only — you place them yourself. Approvable proposals carry an approve button that routes the order (to the dry-run sink while the gate is closed).",
  },
  "dry-run-sink": {
    label: "dry-run sink",
    definition:
      "Where approved orders go while the live gate is closed — a paper/mock broker. No real money, never Robinhood.",
  },
  "two-gate": {
    label: "two-gate",
    definition:
      "Real-money execution requires two independent gates open at once: the broker gate (the account allows agent trading) and the harness gate (order tools allow-listed). Either closed → no live order.",
  },
  "model-confidence": {
    label: "model confidence",
    definition:
      "The model's own 0–100 rating of a proposal, shown as a Low/Moderate/High meter.",
    caveat:
      "Self-rated and uncalibrated — one input alongside the risk rails and red-team, not a probability.",
  },
  "risk-posture": {
    label: "risk posture",
    definition:
      "A 0–100 reading of how aggressively the book is currently positioned (Conservative ↔ Aggressive), blended from real signals: capital deployed vs cash, top-name concentration, open positions vs the 5-cap, average risk-per-trade vs the 2% rail, drawdown vs the −10% halt, and whether a rail has been loosened.",
    caveat:
      "A snapshot of current positioning — not a prediction, a recommendation, or a safety rating. A higher reading just means more exposure, not a worse account.",
  },
  "perplexity-finance": {
    label: "Perplexity Finance",
    definition:
      "The metered research provider used to fill fundamentals and narrative gaps (EPS, analyst consensus, IPO date) that the free sources lack.",
    caveat:
      "Capped and daily-metered — results are cached per symbol per day so a refresh never re-spends.",
  },
  "evaluation-scorecard": {
    label: "evaluation scorecard",
    definition:
      "The paper-desk go/no-go rubric (performance vs benchmark, trade stats, process integrity, reliability, governance) that gates whether hands-off automation could ever be enabled.",
    caveat:
      "Advisory — the final GO is a human decision; it never gates your own approvals.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
