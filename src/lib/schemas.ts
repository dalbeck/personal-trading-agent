import { z } from "zod";

/**
 * Runtime contracts for everything the engine writes into `data/` and the
 * dashboard reads back. Zod schemas are the single source of truth; the
 * TypeScript types in `./types.ts` are inferred from these, so the validated
 * shape and the compile-time shape can never drift.
 *
 * All money values are plain numbers in the account currency (USD). Ratios
 * (e.g. `totalPlPct`) are fractions, not percentages: 0.0482 === +4.82%.
 */

const money = z.number().finite();
const ratio = z.number().finite();
const symbol = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .regex(/^[A-Z0-9.\-]+$/, "ticker must be uppercase letters/digits");
const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();

export const AccountKind = z.enum(["paper", "live"]);

/* --------------------------------------------------------------------------
 * Position — a single open holding within a snapshot.
 * ------------------------------------------------------------------------ */
export const PositionSchema = z
  .object({
    symbol,
    side: z.enum(["long", "short"]).default("long"),
    qty: z.number().positive(),
    avgCost: money,
    lastPrice: money,
    marketValue: money,
    costBasis: money,
    unrealizedPl: money,
    unrealizedPlPct: ratio,
    stopPrice: money.nullable().default(null),
    openedAt: isoDate,
  })
  .strict();

/* --------------------------------------------------------------------------
 * PortfolioSnapshot — point-in-time account state captured by the engine.
 * ------------------------------------------------------------------------ */
export const EquityPointSchema = z
  .object({ date: isoDate, equity: money })
  .strict();

export const BenchmarkSchema = z
  .object({
    symbol, // e.g. "SPY"
    portfolioReturnPct: ratio,
    benchmarkReturnPct: ratio,
  })
  .strict();

export const PortfolioSnapshotSchema = z
  .object({
    account: AccountKind,
    asOf: isoDateTime,
    currency: z.string().length(3).default("USD"),
    equity: money,
    cash: money,
    buyingPower: money,
    totalPl: money,
    totalPlPct: ratio,
    dayPl: money,
    dayPlPct: ratio,
    positions: z.array(PositionSchema),
    benchmark: BenchmarkSchema.optional(),
    equityCurve: z.array(EquityPointSchema).default([]),
  })
  .strict();

/* --------------------------------------------------------------------------
 * JournalEntry — one entry per trade AND per rejection, written at decision
 * time. Discriminated on `kind`.
 * ------------------------------------------------------------------------ */
const JournalBase = {
  id: z.string().min(1),
  timestamp: isoDateTime,
  symbol,
  // Which book the entry belongs to. Paper desk decisions default to `paper`;
  // a `live` entry is a trade the human placed manually in Robinhood, ingested
  // read-only for coaching (see `manual` on the trade entry). Older entries
  // without the field read as `paper`.
  account: AccountKind.default("paper"),
  reviewDate: isoDate,
  tags: z.array(z.string()).default([]),
  // The narrative (thesis + reasoning) is the markdown body of the `.md` file;
  // the fields above are its YAML frontmatter. See `.agents/data-format.md`.
  body: z.string().min(1),
};

export const TradeJournalEntrySchema = z
  .object({
    ...JournalBase,
    kind: z.literal("trade"),
    action: z.enum(["buy", "sell"]),
    side: z.enum(["long", "short"]).default("long"),
    qty: z.number().positive(),
    price: money,
    stopPrice: money.nullable().default(null),
    takeProfit: money.nullable().default(null),
    riskPct: ratio.nullable().default(null),
    // True when the human executed this trade by hand (live account) rather than
    // the paper desk placing it. Manual live trades are ingested read-only from
    // Robinhood order history for coaching — never executed by this app.
    manual: z.boolean().default(false),
  })
  .strict();

export const RejectionJournalEntrySchema = z
  .object({
    ...JournalBase,
    kind: z.literal("rejection"),
    proposedAction: z.enum(["buy", "sell"]),
    rejectedBy: z.enum(["codex-redteam", "rules", "human"]),
  })
  .strict();

export const JournalEntrySchema = z.discriminatedUnion("kind", [
  TradeJournalEntrySchema,
  RejectionJournalEntrySchema,
]);

/* --------------------------------------------------------------------------
 * TradeProposal — a pending agent idea surfaced in the Proposals view.
 * ------------------------------------------------------------------------ */
/**
 * One keyed factor in the red-team's structured rationale — the prosecutor's
 * short take on a single dimension (entry, target, stop, edge, reward/risk, …).
 * `stance` colours the row: `refutes` is an objection, `supports` held up,
 * `neutral` is mixed. See `.agents/data-format.md`.
 */
export const RedTeamFactorSchema = z
  .object({
    label: z.string().min(1),
    assessment: z.string().min(1),
    stance: z.enum(["supports", "refutes", "neutral"]).default("neutral"),
  })
  .strict();

export const RedTeamVerdictSchema = z
  .object({
    verdict: z.enum(["approve", "reject", "concern"]),
    // The prosecutor's primary objection (or, when approving, why the thesis
    // survived). Required + kept for back-compatibility with pre-structured
    // verdicts that carried only `verdict` + `notes`.
    notes: z.string().min(1),
    // Keyed factor assessments (entry/target/stop/edge/…). Defaults to `[]` so
    // older records still validate and the UI falls back to `notes`.
    factors: z.array(RedTeamFactorSchema).default([]),
    // One-line "how it decided" / conviction summary. Null for older records.
    basis: z.string().nullable().default(null),
  })
  .strict();

/**
 * How a proposal's profit target is anchored (M3). A target must be technically
 * or fundamentally grounded — `analyst_price` (a sell-side price target) is the
 * **weak** kind the red-team / checklist flags, since it isn't the desk's own
 * thesis. Surfaced on the proposal card.
 */
export const TargetType = z.enum([
  "prior_high",
  "measured_move",
  "atr_multiple",
  "fundamental",
  "analyst_price",
]);

/**
 * Why *now* — the named catalyst behind a proposal (M3). The desk wants a
 * catalyst on every entry; `none` (trend alone, no catalyst) is the **weak**
 * kind a momentum chase has, flagged by the checklist / red-team.
 */
export const CatalystType = z.enum([
  "earnings_momentum",
  "product_news",
  "sector_rotation",
  "guidance",
  "other",
  "none",
]);

/**
 * One **catalyst source** behind a proposal (catalyst-news-sources M1) — a
 * headline that informed the named catalyst, kept so the catalyst is verifiable
 * on the proposal + export and surfaced to the red-team. Sourced primarily from
 * Alpaca's News API (free, Benzinga-powered, no daily cap). `publisher` is the
 * outlet (e.g. "Benzinga"); `publishedAt` is the raw timestamp; `url` links out.
 * Defaults keep older records valid.
 */
export const CatalystSourceSchema = z
  .object({
    headline: z.string().min(1),
    publisher: z.string().default(""),
    url: z.string().nullable().default(null),
    publishedAt: z.string().nullable().default(null),
  })
  .strict();

/**
 * The **catalyst capture state** (catalyst-state-honesty M2) — three states that
 * must never be conflated, because a failed fetch is not the same as a real
 * "none." `found` — a named catalyst with sources (checklist ✓). `none` — the
 * sources were searched and nothing material came back (checklist ⚑ "no catalyst
 * found"). `unavailable` — the catalyst/news fetch FAILED (checklist ⚑ "data
 * unavailable — retry"); the red-team is told the data is **unavailable, not
 * absent**, and must NOT reject for "no catalyst" on a failed fetch. Nullable for
 * back-compat: a null state is derived from catalyst presence (never fabricated as
 * `unavailable`).
 */
export const CatalystState = z.enum(["found", "none", "unavailable"]);

/**
 * Conviction tier for the diversified-discovery funnel (M1). A discovery run
 * surfaces a larger, ranked candidate set than the daily order cap; the tier
 * buckets a proposal's composite conviction so the queue can sort strongest
 * first. It is a **review-funnel preference**, not a safety rail — every tier
 * is shown by default and every proposal still clears the rails + red-team.
 * Nullable for back-compat (older records, and any path that doesn't score).
 */
export const ConvictionTier = z.enum(["high", "moderate", "watch"]);

/**
 * Which mandate a proposal is judged under (value-sleeve M1). `trend` is the
 * desk's primary **technical trend-following** strategy — the default and every
 * older record. `value` is a deliberately **separate second mandate**: a
 * value / mean-reversion sleeve where **fundamentals lead**, counter-trend is
 * *expected* (below the moving averages is normal, not a strike), and the
 * red-team is briefed with the matching lens. The two are **never merged** —
 * each proposal carries the strategy it is judged under, and the **hard risk
 * rails are shared and unchanged** for both. Defaults to `trend` so older
 * records still validate. See `strategy/playbook.md` (Value sleeve section).
 */
export const Strategy = z.enum(["trend", "value"]);

/**
 * Cash-flow quality — the value-lens floor-vs-trap discriminator
 * (value-cashflow M1). For a value / mean-reversion call, cash flow is the key
 * tell between "hitting a floor with upside" and a value trap: durable, positive
 * **free cash flow** with manageable leverage SUPPORTS the floor thesis, while
 * negative / declining FCF and rising leverage are a strong value-trap signal.
 * Folded into the SAME capped Perplexity value research fetch (no extra calls).
 *
 * `operatingCashFlow` / `freeCashFlow` / `netDebt` are USD (net debt may be
 * negative = net cash); `fcfYield` is a **fraction** (0.041 === 4.1%, FCF ÷
 * market cap); `debtToEquity` / `interestCoverage` are plain multiples.
 * `fcfTrend` is the recent direction of FCF. Every field is nullable — research
 * is best-effort and the UI renders "—" rather than fabricating one. Value lens
 * only; the whole block defaults to null so trend records and older proposals
 * still validate.
 */
export const CashFlowQualitySchema = z
  .object({
    operatingCashFlow: money.nullable().default(null),
    freeCashFlow: money.nullable().default(null),
    fcfTrend: z
      .enum(["growing", "stable", "declining"])
      .nullable()
      .default(null),
    fcfYield: ratio.nullable().default(null),
    netDebt: money.nullable().default(null),
    debtToEquity: money.nullable().default(null),
    interestCoverage: money.nullable().default(null),
  })
  .strict();

/**
 * Dividend-sustainability signals — the value lens's "is the dividend a real
 * floor?" tell (dividend-floor M1). A durable, well-covered dividend is a value
 * **floor** (downside protection / paid to wait); an uncovered or stretched one
 * is a value-trap red flag. Pulled in the SAME capped value research fetch (no
 * extra call). `dividendYield` / `payoutRatio` / `fcfPayout` / `dividendCagr`
 * are **fractions** (0.031 === 3.1%); `fcfCoverage` is a multiple (FCF ÷
 * dividends, 2.4 === 2.4×, derived from `fcfPayout` when absent);
 * `growthStreakYears` is the count of consecutive annual increases. Every field
 * nullable; value lens only; defaults to null so older records still validate.
 */
export const DividendSignalsSchema = z
  .object({
    dividendYield: ratio.nullable().default(null),
    payoutRatio: ratio.nullable().default(null),
    fcfPayout: ratio.nullable().default(null),
    fcfCoverage: z.number().finite().nullable().default(null),
    growthStreakYears: z.number().int().nonnegative().nullable().default(null),
    dividendCagr: ratio.nullable().default(null),
  })
  .strict();

/**
 * Whether the metered (Perplexity) research that backs a proposal's value-quality
 * data was actually obtained (research-unavailable-state M3). `ok` — research ran
 * and supplied data; `off` — the provider is disabled; `capped` — the daily call
 * cap was hit; `unavailable` — the fetch failed / returned nothing. Anything but
 * `ok` means the cash-flow / quality fields are **"data unavailable"** (rendered
 * explicitly, never a silent `—`), drags conviction, and is flagged to the
 * red-team as "quality unverified". Mirrors `PerplexityStatus`.
 */
export const ResearchStatus = z.enum(["ok", "off", "capped", "unavailable"]);

/**
 * Which provider supplied a value-quality block — cash-flow / dividend
 * (proposal-source-footnotes M1). Mirrors the research merge's `ResearchOrigin`
 * so the proposal can carry the **provenance** of those figures for the source
 * footnotes; `null` when the block is absent or the source isn't tracked (older
 * records). Provenance only — it never changes a value.
 */
export const ResearchSourceTag = z.enum(["fmp", "perplexity", "robinhood"]);

/**
 * One **lens breakdown** carried by a dual-lens proposal (dual-lens M1). The
 * manual analyze-a-symbol pipeline now evaluates a ticker under **both** the
 * trend and value mandates and produces **one** proposal holding both
 * breakdowns. Each lens carries its own levels, sizing, conviction, narrative,
 * and **red-team verdict** (judged by its matching mandate) — they may differ.
 * The proposal's **top-level fields mirror the active lens** (for the slim list
 * + execution + back-compat); this array holds every lens for the detail page's
 * toggle and for the acting-lens approval. Empty for single-lens proposals
 * (discovery, older records) — then the top-level fields ARE the one lens.
 */
export const ProposalLensSchema = z
  .object({
    strategy: Strategy,
    limitPrice: money,
    stopPrice: money.nullable().default(null),
    takeProfit: money.nullable().default(null),
    targetType: TargetType.nullable().default(null),
    qty: z.number().positive(),
    riskPct: ratio,
    relativeVolume: z.number().nonnegative().nullable().default(null),
    catalyst: z.string().nullable().default(null),
    catalystType: CatalystType.nullable().default(null),
    // The headlines that informed the catalyst (catalyst-news-sources M1) — kept
    // so the catalyst is verifiable. Empty when none/unavailable. Default keeps
    // older records valid.
    catalystSources: z.array(CatalystSourceSchema).default([]),
    // The catalyst capture state (catalyst-state-honesty M2): found / none /
    // unavailable — distinguishing "searched, none found" from "fetch failed" so a
    // failure never reads as "no catalyst". Null (older records) → derived from
    // catalyst presence, never fabricated as `unavailable`.
    catalystState: CatalystState.nullable().default(null),
    convictionScore: z.number().min(0).max(1).nullable().default(null),
    convictionTier: ConvictionTier.nullable().default(null),
    confidence: z.number().min(0).max(1).nullable().default(null),
    thesis: z.string().min(1),
    reasoning: z.string().min(1),
    redTeam: RedTeamVerdictSchema.nullable().default(null),
    // Cash-flow quality — the value lens's floor-vs-trap signal (value-cashflow
    // M1). Populated for the **value** lens only (trend stays null); folded into
    // the one shared, capped research fetch. Drives the "Cash-flow quality"
    // value-checklist item, the value red-team's floor-vs-trap weighting, and the
    // cash-flow stat block. Defaults to null so trend lenses + older records
    // still validate.
    cashFlow: CashFlowQualitySchema.nullable().default(null),
    // Dividend-sustainability signals — the value lens's floor tell (dividend-floor
    // M1). Value lens only; when coverage is durable it registers a named dividend
    // floor in the catalyst, feeds the value red-team, and lifts conviction.
    dividend: DividendSignalsSchema.nullable().default(null),
    // Whether the value-quality research was obtained (research-unavailable-state
    // M3). Anything but `ok` → the cash-flow/quality fields are "data unavailable"
    // (explicit, not a silent —). Value lens only; null for trend / older records.
    researchStatus: ResearchStatus.nullable().default(null),
    // The specific failure reason when research wasn't `ok` (research-observability
    // M1) — e.g. "HTTP 402 (check API billing)". Surfaced on the detail view +
    // export. Null when ok / older records.
    researchStatusReason: z.string().nullable().default(null),
    // Which provider supplied `cashFlow` / `dividend` (proposal-source-footnotes
    // M1) — for the source footnotes. Value lens only; null for trend / older
    // records or when the block is absent. Provenance only — never a value.
    cashFlowSource: ResearchSourceTag.nullable().default(null),
    dividendSource: ResearchSourceTag.nullable().default(null),
  })
  .strict();

/**
 * One tranche of a staged-entry (DCA / scale-in) plan (staged-entry-plan M2).
 * `fraction` is its share of the full position (0.33 === a third); `qty` is the
 * concrete share count; `offsetDays` is the suggested schedule offset from the
 * first tranche (tranche 0 = now). `status` tracks per-tranche fills — each
 * tranche is a separate gated human approval (no auto-execution).
 */
export const StagedTrancheSchema = z
  .object({
    index: z.number().int().nonnegative(),
    fraction: z.number().min(0).max(1),
    qty: z.number().positive(),
    offsetDays: z.number().int().nonnegative(),
    status: z.enum(["pending", "filled", "skipped"]).default("pending"),
  })
  .strict();

/**
 * An optional **staged-entry plan** on a proposal (staged-entry-plan M2). It
 * splits the proposal's **full intended position** into tranches with a schedule
 * (`intervalDays`) and a drift condition (`driftBandPct` — add only within ±band
 * of the prior fill). **Risk is sized on the full position** — the tranche qtys
 * sum back to the proposal's full qty, so the stop + ≤2% rail bind the completed
 * position. **No auto-execution:** each tranche is approved through the normal
 * gated per-trade approval when due. Null when the proposal has no plan.
 */
export const StagedEntryPlanSchema = z
  .object({
    trancheCount: z.number().int().positive(),
    intervalDays: z.number().int().nonnegative(),
    driftBandPct: ratio,
    tranches: z.array(StagedTrancheSchema).min(1),
  })
  .strict();

export const TradeProposalSchema = z
  .object({
    id: z.string().min(1),
    createdAt: isoDateTime,
    symbol,
    action: z.enum(["buy", "sell"]),
    side: z.enum(["long", "short"]).default("long"),
    // Which mandate this proposal is judged under (M1). `trend` (default) =
    // the technical trend-following desk; `value` = the separate value /
    // mean-reversion sleeve (fundamentals lead, counter-trend expected). Drives
    // the strategy-aware checklist + red-team lens; the hard risk rails are
    // shared and unchanged. Defaults to `trend` so older records still validate.
    strategy: Strategy.default("trend"),
    qty: z.number().positive(),
    limitPrice: money, // marketable-limit only (charter)
    stopPrice: money.nullable().default(null),
    takeProfit: money.nullable().default(null),
    // How the profit target is anchored. A well-formed proposal sets this; older
    // records (and a missing/analyst_price target) are flagged weak, not blocked.
    targetType: TargetType.nullable().default(null),
    // GICS sector for the concentration rail; null when unknown. Resolved from
    // research at proposal time so the rail can see correlated names.
    sector: z.string().nullable().default(null),
    // Relative volume = entry-day volume ÷ the trailing average (M2). A volume
    // confirmation: breakouts want above-average (≥ ~1.3×), pullbacks want
    // below-average. Soft signal weighed by the checklist/red-team, not a rail.
    // Null when unknown/insufficient history (older records, thin names).
    relativeVolume: z.number().nonnegative().nullable().default(null),
    // The named catalyst — why *now* (M3). `catalyst` is the one-line reason;
    // `catalystType` buckets it. A `none` (trend alone) or a missing one is
    // flagged weak by the checklist/red-team, not hard-blocked. Both default to
    // null so older records still validate.
    catalyst: z.string().nullable().default(null),
    catalystType: CatalystType.nullable().default(null),
    // The headlines that informed the catalyst (catalyst-news-sources M1) —
    // mirrors the active lens; surfaced on the proposal + export + red-team so the
    // catalyst is verifiable. Defaults to `[]` so older records still validate.
    catalystSources: z.array(CatalystSourceSchema).default([]),
    // The catalyst capture state (catalyst-state-honesty M2) — mirrors the active
    // lens. found / none / unavailable, kept distinct everywhere. Null (older
    // records) → derived from catalyst presence.
    catalystState: CatalystState.nullable().default(null),
    // Diversified-discovery ranking (M1). `convictionScore` is the 0–1 composite
    // of the playbook signals the discovery analyst assigns; `convictionTier`
    // (`high | moderate | watch`) is its labelled bucket, used to sort the queue
    // (strongest first) and drive an optional filter. A review-funnel preference,
    // never a rail — all tiers show by default, all still clear rails + red-team.
    // Both default to null so older records (and unscored paths) still validate.
    convictionScore: z.number().min(0).max(1).nullable().default(null),
    convictionTier: ConvictionTier.nullable().default(null),
    riskPct: ratio,
    confidence: z.number().min(0).max(1).nullable().default(null),
    thesis: z.string().min(1),
    reasoning: z.string().min(1),
    // `reviewed` / `dismissed` are the terminal states for **advisory** (live)
    // proposals — the human acted on (or set aside) guidance they execute
    // manually. They are NEVER produced by the order/approval path, which only
    // ever writes `approved` / `rejected`. See `.agents/data-format.md`.
    status: z
      .enum(["pending", "approved", "rejected", "reviewed", "dismissed"])
      .default("pending"),
    // Which account the proposal is for. `live` proposals are advisory-only in
    // this phase (the harness order gate is closed) and must never route to any
    // execution path. Live records written for the paper desk omit this.
    account: z.enum(["paper", "live"]).default("paper"),
    // Advisory-only marker: guidance for the human to execute manually in
    // Robinhood — there is no approve-to-execute action and no order path can be
    // reached from it. Tagged `live · advisory · execute manually` in the UI.
    advisory: z.boolean().default(false),
    // Where the idea came from (M2). `manual-request` = a human asked the desk to
    // analyze this ticker on demand (the full pipeline still ran: research →
    // proposal → rails → red-team); `discovery` = the autonomous pre-market run.
    // Surfaced as a badge and carried into the journal as a `manual-request` tag
    // on approval. Nullable/`null` default = unknown (older records, treated as
    // discovery) so older proposals still validate.
    origin: z.enum(["discovery", "manual-request"]).nullable().default(null),
    redTeam: RedTeamVerdictSchema.nullable().default(null),
    // Dual-lens breakdowns (dual-lens M1). A **manual** analyze-a-symbol proposal
    // now carries BOTH the trend and value lens here; the top-level fields above
    // mirror the **active** lens (default + execution). Empty `[]` = single-lens
    // (discovery candidates, older manual records) — the top-level fields are the
    // lone lens. Discovery stays single-lens; only manual analyze is dual.
    lenses: z.array(ProposalLensSchema).default([]),
    // Cash-flow quality (value-cashflow M1) — mirrors the **active** lens, so a
    // value-active proposal carries its value cash-flow block here and a
    // trend-active one carries null. Value lens only. Defaults to null so older
    // records still validate.
    cashFlow: CashFlowQualitySchema.nullable().default(null),
    // Dividend-sustainability signals (dividend-floor M1) — mirrors the active
    // lens (carried only when value is active). Value lens only; null otherwise.
    dividend: DividendSignalsSchema.nullable().default(null),
    // Research availability for the value-quality data (research-unavailable-state
    // M3) — mirrors the active lens. Anything but `ok` → "data unavailable".
    researchStatus: ResearchStatus.nullable().default(null),
    // The specific failure reason when research wasn't `ok` (research-observability
    // M1) — mirrors the active lens. Null when ok / older records.
    researchStatusReason: z.string().nullable().default(null),
    // Provenance of `cashFlow` / `dividend` (proposal-source-footnotes M1) —
    // mirrors the active lens (carried only when value is active). Null otherwise.
    cashFlowSource: ResearchSourceTag.nullable().default(null),
    dividendSource: ResearchSourceTag.nullable().default(null),
    // When the levels (entry/stop/target/sizing) were anchored to the live Alpaca
    // quote (fresh-entry-levels M1). Set at analysis and updated on a "Refresh
    // levels" re-anchor; drives the "levels as of …" freshness indicator and the
    // approval staleness guard (entry vs the current quote). Null for older
    // records → the UI falls back to `createdAt`.
    pricedAt: isoDateTime.nullable().default(null),
    // When the proposal's value-lens research (cashFlow / dividend / catalyst /
    // conviction / red-team) was last derived from a research fetch
    // (proposal-refresh-rebuilds M3). Set at analysis and updated by the
    // "Refresh research" rebuild; drives the proposal's research-freshness label
    // + "stale — refresh" indicator. Null for older records → the UI falls back
    // to `createdAt`.
    researchAt: isoDateTime.nullable().default(null),
    // Optional staged-entry (DCA / scale-in) plan (staged-entry-plan M2) — splits
    // the full position into separately-approved tranches. Null when none.
    stagedPlan: StagedEntryPlanSchema.nullable().default(null),
    reviewByDate: isoDate.nullable().default(null),
    // Seeded/demo content. Live records written by the routines/scout omit this
    // (or set it false). Any view rendering a sample record flags it so demo
    // data is never shown as if it were live. See `.agents/data-format.md`.
    sample: z.boolean().default(false),
  })
  .strict();

/* --------------------------------------------------------------------------
 * MaterialNews — a headline the news scout judged material to a held name
 * (data/news/<date>.json holds an array of these).
 * ------------------------------------------------------------------------ */
export const MaterialNewsItemSchema = z
  .object({
    symbol, // the held ticker this is material to
    title: z.string().min(1),
    link: z.url(),
    source: z.string().min(1),
    publishedAt: z.string().nullable().default(null), // raw RFC-822 from RSS
    reason: z.string().min(1),
    seenAt: isoDateTime, // when the scout caught it
    // Seeded/demo content (see `TradeProposalSchema.sample`). Live scout output
    // omits this; the News view flags any file containing sample items.
    sample: z.boolean().default(false),
  })
  .strict();

export const NewsFileSchema = z.array(MaterialNewsItemSchema);

/* --------------------------------------------------------------------------
 * CoachingEntry — self-graded review vs. actual prices (coaching-log).
 * ------------------------------------------------------------------------ */
/* --------------------------------------------------------------------------
 * RunLog — one structured record per routine run (data/logs/). Drives the
 * Routines + Logs dashboard views and the dead-man switch.
 * ------------------------------------------------------------------------ */
export const ROUTINE_IDS = [
  "live-snapshot-refresh",
  "pre-market-research",
  "market-open-execution",
  "midday-scan",
  "live-position-management",
  "end-of-day-summary",
  "weekly-review",
] as const;

export const RunLogSchema = z
  .object({
    routine: z.enum(ROUTINE_IDS),
    startedAt: isoDateTime,
    finishedAt: isoDateTime,
    status: z.enum(["ok", "error", "skipped", "locked"]),
    summary: z.string().min(1),
    proposalsConsidered: z.number().int().nonnegative().default(0),
    ordersPlaced: z.number().int().nonnegative().default(0),
    rejections: z.number().int().nonnegative().default(0),
  })
  .strict();

/* --------------------------------------------------------------------------
 * ResearchUsage — per-day metered-API call counter (data/research/) that
 * enforces the Perplexity daily cap in code (Phase 2 M8).
 * ------------------------------------------------------------------------ */
export const ResearchUsageSchema = z
  .object({
    date: isoDate,
    count: z.number().int().nonnegative(),
    // Cumulative real per-call cost (USD) the Agent API reported, when
    // available. The count remains the hard daily guardrail; cost is visibility
    // only. Optional for backward compatibility with pre-cost usage files.
    costUsd: z.number().nonnegative().optional(),
  })
  .strict();

export const CoachingEntrySchema = z
  .object({
    id: z.string().min(1),
    date: isoDate,
    period: z.enum(["daily", "weekly"]),
    // Which book this self-review covers. `paper` = the autonomous desk's own
    // decisions (the default and the bulk of coaching); `live` = a review of
    // the human's manually-placed live trades. Coaching stays behavior-driven
    // either way — it reviews decisions, not mere ownership.
    account: AccountKind.default("paper"),
    symbol: symbol.nullable().default(null),
    relatedJournalIds: z.array(z.string()).default([]),
    grade: z.enum(["A", "B", "C", "D", "F"]),
    promotedToPlaybook: z.boolean().default(false),
    // The self-review prose (expected / actual / lesson) is the markdown body
    // of the `.md` file; the fields above are its frontmatter.
    body: z.string().min(1),
  })
  .strict();

/* --------------------------------------------------------------------------
 * Watchlist — the editable half of the tracked universe (data/control/
 * watchlist.json). The other half is the active book's holdings. Together they
 * feed the news scout and the research routine, and drive symbol auto-surfacing
 * (see `src/lib/server/universe.ts`). A single small JSON state file, like the
 * funding tracker / live-halt latch.
 *
 * Each entry carries its **provenance**: `manual` (the human typed it) or
 * `discovery` (the autonomous discovery run auto-tracked it). Discovery adds are
 * bounded by `DISCOVERY_LIMITS.maxWatchlistSymbols`; the human can prune either.
 * ------------------------------------------------------------------------ */
export const WatchlistSource = z.enum(["manual", "discovery"]);

export const WatchlistEntrySchema = z
  .object({
    symbol,
    source: WatchlistSource.default("manual"),
    addedAt: isoDateTime.nullable().default(null),
  })
  .strict();

export const WatchlistSchema = z
  .object({
    entries: z.array(WatchlistEntrySchema).default([]),
    updatedAt: isoDateTime.nullable().default(null),
  })
  .strict();

/* --------------------------------------------------------------------------
 * RiskSettings — the human's per-rail overrides of the charter RISK_LIMITS,
 * persisted in `data/control/risk-settings.json` (an internal state file, like
 * the halt latch / funding tracker — NOT a `data/` artifact contract). The
 * charter constants stay the **safe defaults**; this file only ever overrides
 * them, layered in at per-trade approval time (`src/lib/server/risk-settings.ts`).
 * Each rail can be disabled (`enabled: false`) or have its number adjusted
 * (`value`); `value` is ignored for the on/off rails (stopRequired, universe).
 * Defaults (all enabled, null value) == the charter rails unchanged. See
 * `.agents/infra.md`.
 * ------------------------------------------------------------------------ */
export const RiskRailSettingSchema = z
  .object({
    enabled: z.boolean().default(true),
    value: z.number().positive().nullable().default(null),
  })
  .strict();

const defaultRail = { enabled: true, value: null };

export const RiskSettingsSchema = z
  .object({
    /** Per-position size cap (`perPositionSizePct`, fraction). */
    positionSize: RiskRailSettingSchema.default(defaultRail),
    /** Daily order cap (`maxOrdersPerDay`, integer). */
    dailyOrderCap: RiskRailSettingSchema.default(defaultRail),
    /** Drawdown halt from high-water (`drawdownHaltPct`, fraction). */
    drawdownHalt: RiskRailSettingSchema.default(defaultRail),
    /** Require a protective stop on entries (on/off; `value` ignored). */
    stopRequired: RiskRailSettingSchema.default(defaultRail),
    /** Universe rule — listed US equities, no benchmark (on/off; `value` ignored). */
    universe: RiskRailSettingSchema.default(defaultRail),
    updatedAt: isoDateTime.nullable().default(null),
  })
  .strict();

/* --------------------------------------------------------------------------
 * DiscoverySettings — the human's tuning of the discovery **review funnel**
 * (M3), persisted in `data/control/discovery-settings.json` (an internal state
 * file, like risk-settings — NOT a `data/` artifact contract). These are
 * **preferences, NOT safety rails**: they shape how many ranked candidates a
 * run surfaces and how the queue is filtered for display. They are explicitly
 * **separate from the hard risk rails and the 6-order/day cap** (those live in
 * `RiskSettings` / the charter and are NOT tunable here). A null number means
 * "use the charter `DISCOVERY_LIMITS` default"; the overlay clamps every value
 * to the charter ceilings (e.g. the idea cap can never exceed `maxIdeaCap`), so
 * the agent can never widen the funnel past its bound. See
 * `src/lib/server/discovery-settings.ts` + `.agents/data-format.md`.
 * ------------------------------------------------------------------------ */
export const DiscoverySettingsSchema = z
  .object({
    /** Proposals per discovery run (`DISCOVERY_IDEA_CAP`). Null → charter
     *  default; clamped to [1, charter `maxIdeaCap`]. */
    ideaCap: z.number().int().positive().nullable().default(null),
    /** Best-in-sector cap: max proposals from any one sector. Null → charter
     *  default; clamped to ≥ 1. */
    maxProposalsPerSector: z.number().int().positive().nullable().default(null),
    /** Sector-spread target: aim to represent at least this many sectors. Null
     *  → charter default; clamped to ≥ 0. */
    minSectorsTarget: z.number().int().nonnegative().nullable().default(null),
    /** Minimum conviction tier the proposals queue surfaces by default
     *  (`watch` = show everything — the M1 default). A *view* preference; it
     *  filters the display, it never deletes a proposal. */
    minConvictionTier: ConvictionTier.default("watch"),
    /** Whether the discovery run may ALSO surface **value / mean-reversion**
     *  candidates (value-sleeve M1), separate from the trend universe. Off by
     *  default — the desk's primary mandate is trend; the human opts the value
     *  sleeve in here. A discovery preference (it widens the *kind* of idea
     *  surfaced), NOT a safety rail: every value candidate still carries
     *  `strategy: "value"`, is judged by the value red-team lens, and clears the
     *  same shared hard rails + 6-order/day cap. */
    valueSleeveEnabled: z.boolean().default(false),
    updatedAt: isoDateTime.nullable().default(null),
  })
  .strict();
