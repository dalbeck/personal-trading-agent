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
  "fcf": {
    label: "free cash flow (FCF)",
    definition:
      "The cash a business generates after funding its operations and capital spending — operating cash flow minus capital expenditures. Durable, positive FCF means a company funds itself; for a value play it supports the floor thesis.",
    caveat:
      "A point-in-time research figure, not order data — evidence to weigh, never a verdict on its own.",
  },
  "fcf-yield": {
    label: "FCF yield",
    definition:
      "Free cash flow divided by market cap — how much cash the business throws off relative to its price. Higher is cheaper; a healthy yield is part of a credible value floor.",
  },
  "interest-coverage": {
    label: "interest coverage",
    definition:
      "Operating earnings divided by interest expense — how many times over the company can cover its interest. Thin coverage (rising leverage) is a value-trap warning; comfortable coverage supports the floor.",
  },
  "dividend-yield": {
    label: "dividend yield",
    definition:
      "The annual dividend as a percentage of the share price — what you're paid to hold. For a value play a safe yield is the 'paid to wait' part of a floor.",
  },
  "payout-ratio": {
    label: "payout ratio",
    definition:
      "The share of earnings (or free cash flow) paid out as dividends. A comfortable payout leaves room to keep paying and growing; a stretched one (near or above 100%) is a cut-risk warning.",
  },
  "dividend-coverage": {
    label: "FCF dividend coverage",
    definition:
      "How many times free cash flow covers the dividend (FCF ÷ dividends). Comfortably above 1× means the dividend is funded from real cash — a credible floor; below 1× means it's being funded from elsewhere, a value-trap flag.",
    caveat:
      "A floor isn't a buy signal — a covered dividend can still coexist with a falling price. Evidence to weigh, not a verdict.",
  },
  "staged-entry": {
    label: "staged entry (DCA)",
    definition:
      "Scaling into a position in tranches over time instead of all at once — e.g. a third now, then more later if the price holds within a band. The full position's risk is sized up front; each tranche is approved separately.",
    caveat:
      "Reduces timing risk, not market risk — averaging into a decliner can average into a loss. An execution choice, not a guarantee.",
  },
  "evaluation-scorecard": {
    label: "evaluation scorecard",
    definition:
      "The paper-desk go/no-go rubric (performance vs benchmark, trade stats, process integrity, reliability, governance) that gates whether hands-off automation could ever be enabled.",
    caveat:
      "Advisory — the final GO is a human decision; it never gates your own approvals.",
  },
  "mean-reversion": {
    label: "mean-reversion",
    definition:
      "A trade that bets a price stretched away from its typical level will snap back toward it — buying weakness expecting a bounce, the opposite of trend-following. The value sleeve's stance.",
  },
  "value-trap": {
    label: "value trap",
    definition:
      "A stock that looks cheap but keeps falling because the business is genuinely deteriorating — cheap for a reason, not a bargain. The value prosecutor's main thing to rule out.",
  },
  "measured-move": {
    label: "measured move",
    definition:
      "A price target set by projecting the size of a prior move onto the breakout — e.g. a $10 base that breaks out projects a ~$10 further move. A technical, self-derived target.",
  },
  "target-weight": {
    label: "target weight",
    definition:
      "The share of the portfolio a core position is sized to hold (e.g. 5%). A long-term holding is governed by this weight and a review trigger rather than a protective stop.",
  },
  "review-trigger": {
    label: "review trigger",
    definition:
      "For a no-stop core holding, the wide drawdown (e.g. −20%) at which the position is flagged for a human review instead of being auto-stopped out — the long-term counterpart to a stop.",
  },
  "expense-ratio": {
    label: "expense ratio",
    definition:
      "The annual fee an ETF/fund charges as a percentage of assets. It compounds against the holder every year, so a high expense ratio is a real drag on a long-term core holding.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

/**
 * Phrases (case-insensitive) that auto-link to a glossary term in free-flowing
 * copy (e.g. the red-team rules view). Curated so rule phrasing maps to the
 * right entry without bloating every record; longer phrases are matched before
 * shorter ones so "reward-to-risk" wins over a bare "risk".
 */
const AUTO_LINK: ReadonlyArray<readonly [GlossaryKey, readonly string[]]> = [
  ["rr", ["reward-to-risk", "reward/risk", "reward to risk"]],
  ["relative-volume", ["relative volume"]],
  ["mean-reversion", ["mean-reversion", "mean reversion"]],
  ["value-trap", ["value trap"]],
  ["measured-move", ["measured move"]],
  ["target-weight", ["target weight"]],
  ["review-trigger", ["review trigger"]],
  ["expense-ratio", ["expense ratio"]],
  ["fcf", ["free cash flow"]],
  ["fcf-yield", ["fcf yield"]],
  ["interest-coverage", ["interest coverage"]],
  ["drawdown", ["drawdown"]],
  ["atr", ["atr"]],
  ["protective-stop", ["protective stop"]],
];

/** A plain text run, or a matched glossary term keeping its original text. */
export type GlossarySegment = string | { term: GlossaryKey; text: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split `text` into plain runs and glossary matches, wrapping the FIRST
 * occurrence of each known term (tracked in the shared `seen` set so a term is
 * tagged once per view — matching `<Term>`'s "primary appearance only"
 * restraint). Only terms present in {@link GLOSSARY} are matched. Pure + testable.
 */
export function tokenizeGlossary(
  text: string,
  seen: Set<GlossaryKey> = new Set(),
): GlossarySegment[] {
  const segments: GlossarySegment[] = [];
  let rest = text;
  // Longest phrase first so multi-word terms win over any substring.
  const candidates = AUTO_LINK.flatMap(([key, phrases]) =>
    phrases.map((p) => ({ key, phrase: p })),
  ).sort((a, b) => b.phrase.length - a.phrase.length);

  while (rest.length > 0) {
    let best: { index: number; length: number; key: GlossaryKey; text: string } | null =
      null;
    for (const { key, phrase } of candidates) {
      if (seen.has(key)) continue;
      const m = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i").exec(rest);
      if (m && (best === null || m.index < best.index)) {
        best = { index: m.index, length: m[0].length, key, text: m[0] };
      }
    }
    if (!best) {
      segments.push(rest);
      break;
    }
    if (best.index > 0) segments.push(rest.slice(0, best.index));
    segments.push({ term: best.key, text: best.text });
    seen.add(best.key);
    rest = rest.slice(best.index + best.length);
  }
  return segments;
}
