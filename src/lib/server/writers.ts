import "server-only";

import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  bankedLessonBullet,
  composeCoachingBody,
  composeJournalBody,
  formatRiskRejectionReason,
  insertBankedLesson,
} from "@/lib/journal-format";
import type { RiskDecision } from "@/lib/risk";
import {
  CoachingEntrySchema,
  JournalEntrySchema,
  NewsFileSchema,
  PortfolioSnapshotSchema,
  RunLogSchema,
  TradeProposalSchema,
  WatchlistSchema,
} from "@/lib/schemas";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";
import { DISCOVERY_LIMITS } from "@strategy/charter.config";
import type { WatchlistEntry } from "@/lib/types";
import { readWatchlistEntries } from "./data";
import type {
  MaterialNewsItem,
  PortfolioSnapshot,
  RedTeamVerdict,
  RunLog,
  TradeProposal,
} from "@/lib/types";
import type { z } from "zod";
import { readStrategyDoc, writeStrategyDoc } from "./strategy";
import { stringifyFrontmatter } from "./frontmatter";

/**
 * Engine-side writers for the narrative `data/` artifacts (decision journal,
 * coaching log) and the playbook lesson promotion. Every artifact is validated
 * against its zod contract **before** it is written, so a malformed write fails
 * loudly instead of poisoning the data dir. Format: Markdown + YAML frontmatter
 * (see `.agents/data-format.md`).
 *
 * `server-only`: these touch the filesystem and must never run in the browser.
 */

function dataRoot(opts?: { dataDir?: string }): string {
  return (
    opts?.dataDir ??
    process.env.TRADING_DATA_DIR ??
    path.join(process.cwd(), "data")
  );
}

function symbolSlug(symbol: string): string {
  return symbol.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Resolve a non-colliding `<base><ext>` path, appending -2, -3, … if needed. */
async function uniquePath(
  dir: string,
  base: string,
  ext = ".md",
): Promise<string> {
  let candidate = path.join(dir, `${base}${ext}`);
  let n = 2;
  while (await exists(candidate)) {
    candidate = path.join(dir, `${base}-${n}${ext}`);
    n += 1;
  }
  return candidate;
}

/** Validate `{ ...frontmatter, body }`, serialize, and write it atomically-ish. */
async function writeNarrative<S extends z.ZodType>(
  absPath: string,
  schema: S,
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<void> {
  const parsed = schema.safeParse({ ...frontmatter, body });
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(
      `Refusing to write invalid artifact ${path.basename(absPath)}: ${detail}`,
    );
  }
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, stringifyFrontmatter(frontmatter, body), "utf8");
}

/** Validate a structured record and write it as pretty JSON. */
async function writeStructured<S extends z.ZodType>(
  absPath: string,
  schema: S,
  record: unknown,
): Promise<z.infer<S>> {
  const parsed = schema.safeParse(record);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(
      `Refusing to write invalid artifact ${path.basename(absPath)}: ${detail}`,
    );
  }
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
  return parsed.data;
}

export interface WriteResult {
  id: string;
  file: string;
}

/* ------------------------------ Decision journal ----------------------------- */

export interface TradeDecisionInput {
  timestamp: string;
  symbol: string;
  action: "buy" | "sell";
  side?: "long" | "short";
  qty: number;
  price: number;
  stopPrice?: number | null;
  takeProfit?: number | null;
  riskPct?: number | null;
  reviewDate: string;
  tags?: string[];
  thesis: string;
  research?: string;
  redTeam?: string;
  decision: string;
  /** Which book the trade belongs to (default paper). */
  account?: "paper" | "live";
  /** True for a live trade the human executed by hand (ingested read-only). */
  manual?: boolean;
}

/** Journal a placed trade at decision time. */
export async function recordTradeDecision(
  input: TradeDecisionInput,
  opts?: { dataDir?: string },
): Promise<WriteResult> {
  const date = input.timestamp.slice(0, 10);
  const slug = symbolSlug(input.symbol);
  const id = `j-${date}-${slug}`;
  const dir = path.join(dataRoot(opts), "decision-journal");
  const file = await uniquePath(dir, `${date}-${slug}-${input.action}`);

  const frontmatter = {
    kind: "trade",
    id,
    timestamp: input.timestamp,
    symbol: input.symbol,
    account: input.account ?? "paper",
    action: input.action,
    side: input.side ?? "long",
    qty: input.qty,
    price: input.price,
    stopPrice: input.stopPrice ?? null,
    takeProfit: input.takeProfit ?? null,
    riskPct: input.riskPct ?? null,
    manual: input.manual ?? false,
    reviewDate: input.reviewDate,
    tags: input.tags ?? [],
  };
  const body = composeJournalBody({
    thesis: input.thesis,
    research: input.research,
    redTeam: input.redTeam,
    verdictLabel: "Decision",
    verdict: input.decision,
  });

  await writeNarrative(file, JournalEntrySchema, frontmatter, body);
  return { id, file };
}

export interface RejectionInput {
  timestamp: string;
  symbol: string;
  proposedAction: "buy" | "sell";
  rejectedBy: "codex-redteam" | "rules" | "human";
  reviewDate: string;
  tags?: string[];
  thesis: string;
  research?: string;
  redTeam?: string;
  reason: string;
}

/** Journal a rejected proposal at decision time. */
export async function recordRejection(
  input: RejectionInput,
  opts?: { dataDir?: string },
): Promise<WriteResult> {
  const date = input.timestamp.slice(0, 10);
  const slug = symbolSlug(input.symbol);
  const id = `j-${date}-${slug}`;
  const dir = path.join(dataRoot(opts), "decision-journal");
  const file = await uniquePath(dir, `${date}-${slug}-rejection`);

  const frontmatter = {
    kind: "rejection",
    id,
    timestamp: input.timestamp,
    symbol: input.symbol,
    proposedAction: input.proposedAction,
    rejectedBy: input.rejectedBy,
    reviewDate: input.reviewDate,
    tags: input.tags ?? [],
  };
  const body = composeJournalBody({
    thesis: input.thesis,
    research: input.research,
    redTeam: input.redTeam,
    verdictLabel: "Rejected",
    verdict: input.reason,
  });

  await writeNarrative(file, JournalEntrySchema, frontmatter, body);
  return { id, file };
}

/** Journal a risk-engine block: a `rules` rejection whose reason is the
 *  failing rails. Wires the M2 risk decision into a journaled rejection. */
export async function recordRiskRejection(
  meta: {
    timestamp: string;
    symbol: string;
    proposedAction: "buy" | "sell";
    reviewDate: string;
    tags?: string[];
    thesis: string;
    research?: string;
  },
  decision: RiskDecision,
  opts?: { dataDir?: string },
): Promise<WriteResult> {
  // Tag each violated rule (`rule:<id>`) so the governance scorecard (M4) can
  // count per-rule rejections without parsing the prose reason.
  const ruleTags = decision.violations.map((v) => `rule:${v.rule}`);
  return recordRejection(
    {
      ...meta,
      tags: [...(meta.tags ?? []), ...ruleTags],
      rejectedBy: "rules",
      reason: formatRiskRejectionReason(decision),
    },
    opts,
  );
}

/* ------------------------------- Coaching log -------------------------------- */

export interface CoachingInput {
  date: string;
  period: "daily" | "weekly";
  account?: "paper" | "live";
  symbol?: string | null;
  relatedJournalIds?: string[];
  grade: "A" | "B" | "C" | "D" | "F";
  expected: string;
  actual: string;
  lesson: string;
  promotedToPlaybook?: boolean;
}

/** Write a next-morning coaching self-review. */
export async function recordCoaching(
  input: CoachingInput,
  opts?: { dataDir?: string },
): Promise<WriteResult> {
  const id = `c-${input.date}`;
  const dir = path.join(dataRoot(opts), "coaching-log");
  const file = await uniquePath(dir, `${input.date}-${input.period}`);

  const frontmatter = {
    id,
    date: input.date,
    period: input.period,
    account: input.account ?? "paper",
    symbol: input.symbol ?? null,
    relatedJournalIds: input.relatedJournalIds ?? [],
    grade: input.grade,
    promotedToPlaybook: input.promotedToPlaybook ?? false,
  };
  const body = composeCoachingBody({
    expected: input.expected,
    actual: input.actual,
    lesson: input.lesson,
  });

  await writeNarrative(file, CoachingEntrySchema, frontmatter, body);
  return { id, file };
}

/* -------------------------------- Run logs ---------------------------------- */

/** Write a structured run-log record for a routine execution (data/logs/). */
export async function recordRunLog(
  input: RunLog,
  opts?: { dataDir?: string },
): Promise<WriteResult> {
  const dir = path.join(dataRoot(opts), "logs");
  const stamp = input.startedAt.replace(/[:.]/g, "-");
  const file = await uniquePath(dir, `${stamp}-${input.routine}`, ".json");
  await writeStructured(file, RunLogSchema, input);
  return { id: `${input.routine}@${input.startedAt}`, file };
}

/* ---------------------------------- News ------------------------------------ */

/** Append material news items into per-day files (data/news/<date>.json),
 *  deduped by link. Returns the number of newly-added items. */
export async function recordNewsItems(
  items: MaterialNewsItem[],
  opts?: { dataDir?: string },
): Promise<number> {
  if (items.length === 0) return 0;
  const dir = path.join(dataRoot(opts), "news");
  // Group incoming items by their seen-date.
  const byDate = new Map<string, MaterialNewsItem[]>();
  for (const it of items) {
    const date = it.seenAt.slice(0, 10);
    (byDate.get(date) ?? byDate.set(date, []).get(date)!).push(it);
  }

  let added = 0;
  for (const [date, incoming] of byDate) {
    const file = path.join(dir, `${date}.json`);
    let existing: MaterialNewsItem[] = [];
    try {
      existing = NewsFileSchema.parse(JSON.parse(await readFile(file, "utf8")));
    } catch {
      existing = []; // missing or unreadable — start fresh
    }
    const seen = new Set(existing.map((e) => e.link));
    const merged = [...existing];
    for (const it of incoming) {
      if (seen.has(it.link)) continue;
      seen.add(it.link);
      merged.push(it);
      added += 1;
    }
    await writeStructured(file, NewsFileSchema, merged);
  }
  return added;
}

/* -------------------------------- Snapshots --------------------------------- */

/** Persist a portfolio snapshot (data/snapshots/) as the shared source of
 *  truth for the dashboard and the agent. */
export async function recordSnapshot(
  snapshot: PortfolioSnapshot,
  opts?: { dataDir?: string },
): Promise<WriteResult> {
  const dir = path.join(dataRoot(opts), "snapshots");
  const date = snapshot.asOf.slice(0, 10);
  const file = await uniquePath(dir, date, ".json");
  await writeStructured(file, PortfolioSnapshotSchema, snapshot);
  return { id: `snapshot-${date}`, file };
}

/* ------------------------------- Proposals ---------------------------------- */

/** Update a proposal's `status` in place (data/proposals/), preserving every
 *  other field. Returns the file written, or `null` if no proposal matches the
 *  id. Used by the per-trade approval flow so the queue reflects decisions. */
export async function setProposalStatus(
  id: string,
  status: TradeProposal["status"],
  opts?: { dataDir?: string },
): Promise<WriteResult | null> {
  const dir = path.join(dataRoot(opts), "proposals");
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    const file = path.join(dir, name);
    const parsed = TradeProposalSchema.safeParse(
      JSON.parse(await readFile(file, "utf8")),
    );
    if (parsed.success && parsed.data.id === id) {
      await writeStructured(file, TradeProposalSchema, {
        ...parsed.data,
        status,
      });
      return { id, file };
    }
  }
  return null;
}

/** Attach a red-team verdict to a proposal in place (data/proposals/),
 *  preserving every other field. Used by the post-discovery red-team sweep so
 *  the verdict is visible at review. Returns the file, or `null` if no match. */
export async function setProposalRedTeam(
  id: string,
  redTeam: RedTeamVerdict,
  opts?: { dataDir?: string },
): Promise<WriteResult | null> {
  const dir = path.join(dataRoot(opts), "proposals");
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    const file = path.join(dir, name);
    const parsed = TradeProposalSchema.safeParse(
      JSON.parse(await readFile(file, "utf8")),
    );
    if (parsed.success && parsed.data.id === id) {
      await writeStructured(file, TradeProposalSchema, {
        ...parsed.data,
        redTeam,
      });
      return { id, file };
    }
  }
  return null;
}

/** The fields a caller supplies to emit a live-advisory proposal. The
 *  account/advisory/status stamps are forced by the writer — a caller can never
 *  produce a paper or executable proposal through this path. */
export interface AdvisoryProposalInput {
  id: string;
  createdAt: string;
  symbol: string;
  action: "buy" | "sell";
  side?: "long" | "short";
  /** Which mandate the proposal is judged under (value-sleeve M1). Optional —
   *  the schema defaults to `trend`, so a caller may carry `value` through or
   *  omit it for the trend desk. */
  strategy?: TradeProposal["strategy"];
  qty: number;
  limitPrice: number;
  stopPrice?: number | null;
  takeProfit?: number | null;
  riskPct: number;
  confidence?: number | null;
  thesis: string;
  reasoning: string;
  redTeam?: TradeProposal["redTeam"];
  reviewByDate?: string | null;
  // Optional author-set fields (M1/M2). All schema-backed + default null, so a
  // caller may carry them through without re-validating: the proposal's GICS
  // sector + target anchoring, the relative-volume read, the named catalyst, and
  // the conviction ranking.
  targetType?: TradeProposal["targetType"];
  sector?: string | null;
  relativeVolume?: number | null;
  catalyst?: string | null;
  catalystType?: TradeProposal["catalystType"];
  convictionScore?: number | null;
  convictionTier?: TradeProposal["convictionTier"];
  // Dual-lens breakdowns (dual-lens M1) — a manual analyze carries both the trend
  // and value lens. Empty/omitted = single-lens (the top-level fields are it).
  lenses?: TradeProposal["lenses"];
}

/**
 * Emit a **live-advisory** proposal against the Robinhood Agentic account
 * (Phase 3 — read-only advisory). The proposal is stamped `account: "live"`,
 * `advisory: true`, `status: "pending"` by construction, validated against the
 * contract, and written to `data/proposals/`. It reuses the same thesis /
 * reasoning / red-team fields as a paper proposal — but it carries NO execution
 * path: the approval endpoint refuses it and the UI offers only review/dismiss.
 */
export async function recordAdvisoryProposal(
  input: AdvisoryProposalInput,
  opts?: { dataDir?: string },
): Promise<WriteResult> {
  const proposal = TradeProposalSchema.parse({
    ...input,
    side: input.side ?? "long",
    account: "live",
    advisory: true,
    status: "pending",
  });
  const dir = path.join(dataRoot(opts), "proposals");
  const file = await uniquePath(dir, input.id, ".json");
  await writeStructured(file, TradeProposalSchema, proposal);
  return { id: input.id, file };
}

/**
 * Emit an **approvable live** proposal (Phase 3 M5a) — a live idea the human can
 * approve so the app places it. Stamped `account: "live"`, `advisory: false`,
 * `status: "pending"`. Unlike an advisory proposal, this flows the approval path
 * — but the **order gate** is the real-money boundary: with the gate closed
 * (the shipped state) an approval routes to the dry-run sink (paper/mock), never
 * Robinhood. Per-trade human approval is always required; the app never
 * auto-trades. Use {@link recordAdvisoryProposal} for manual guidance instead.
 */
export async function recordApprovableLiveProposal(
  input: AdvisoryProposalInput,
  opts?: { dataDir?: string },
): Promise<WriteResult> {
  const proposal = TradeProposalSchema.parse({
    ...input,
    side: input.side ?? "long",
    account: "live",
    advisory: false,
    status: "pending",
  });
  const dir = path.join(dataRoot(opts), "proposals");
  const file = await uniquePath(dir, input.id, ".json");
  await writeStructured(file, TradeProposalSchema, proposal);
  return { id: input.id, file };
}

/**
 * Emit a **manual-request** proposal (Phase 3 M2) — a review candidate produced
 * by the on-demand "analyze a symbol" pipeline for a human-entered ticker. It is
 * stamped `origin: "manual-request"`, `status: "pending"`, and validated. The
 * `account` and `advisory` flags are passed by the caller so it works per book:
 * a **paper** request is a normal paper proposal; a **live** request is approvable
 * (`advisory: false`) and flows the same gated approval path (gate closed →
 * dry-run sink). A manual pick is **never** rubber-stamped — the route runs the
 * risk rails + red-team over it before this writes the verdict in `redTeam`.
 */
export async function recordManualProposal(
  input: AdvisoryProposalInput,
  meta: { account: "paper" | "live"; advisory?: boolean },
  opts?: { dataDir?: string },
): Promise<WriteResult> {
  const proposal = TradeProposalSchema.parse({
    ...input,
    side: input.side ?? "long",
    account: meta.account,
    advisory: meta.advisory ?? false,
    origin: "manual-request",
    status: "pending",
  });
  const dir = path.join(dataRoot(opts), "proposals");
  const file = await uniquePath(dir, input.id, ".json");
  await writeStructured(file, TradeProposalSchema, proposal);
  return { id: input.id, file };
}

/* -------------------------------- Watchlist --------------------------------- */

/** Normalize + dedupe entries by symbol (first occurrence wins), dropping
 *  invalid tickers. Provenance of the kept entry is preserved. */
function dedupeEntries(entries: WatchlistEntry[]): WatchlistEntry[] {
  const seen = new Set<string>();
  const out: WatchlistEntry[] = [];
  for (const e of entries) {
    const s = normalizeSymbol(e.symbol);
    if (!isValidSymbol(s) || seen.has(s)) continue;
    seen.add(s);
    out.push({ ...e, symbol: s });
  }
  return out;
}

/** Validate + persist the watchlist entries (data/control/watchlist.json),
 *  stamping `updatedAt`. Returns the persisted entries. */
async function persistWatchlist(
  entries: WatchlistEntry[],
  opts?: { dataDir?: string; at?: string },
): Promise<WatchlistEntry[]> {
  const cleaned = dedupeEntries(entries);
  const file = path.join(dataRoot(opts), "control", "watchlist.json");
  await writeStructured(file, WatchlistSchema, {
    entries: cleaned,
    updatedAt: opts?.at ?? new Date().toISOString(),
  });
  return cleaned;
}

/** Add one symbol to the watchlist as a **manual** entry (idempotent). A human
 *  re-adding a `discovery` symbol promotes it to `manual` (explicit interest).
 *  Returns the updated entries. */
export async function addToWatchlist(
  symbol: string,
  opts?: { dataDir?: string; at?: string },
): Promise<WatchlistEntry[]> {
  const s = normalizeSymbol(symbol);
  const current = await readWatchlistEntries(opts);
  const existing = current.find((e) => e.symbol === s);
  if (existing) {
    if (existing.source === "manual") return persistWatchlist(current, opts);
    return persistWatchlist(
      current.map((e) => (e.symbol === s ? { ...e, source: "manual" } : e)),
      opts,
    );
  }
  return persistWatchlist(
    [
      ...current,
      { symbol: s, source: "manual", addedAt: opts?.at ?? new Date().toISOString() },
    ],
    opts,
  );
}

/** Remove one symbol from the watchlist (idempotent). Returns the updated entries. */
export async function removeFromWatchlist(
  symbol: string,
  opts?: { dataDir?: string; at?: string },
): Promise<WatchlistEntry[]> {
  const target = normalizeSymbol(symbol);
  const current = await readWatchlistEntries(opts);
  return persistWatchlist(
    current.filter((e) => e.symbol !== target),
    opts,
  );
}

/**
 * Auto-add discovered candidates to the watchlist as `discovery` entries — the
 * autonomous-discovery path (M3). **Bounded**: never grows the watchlist past
 * `DISCOVERY_LIMITS.maxWatchlistSymbols`, never duplicates an existing symbol,
 * and never evicts a manual entry. Returns the updated entries and the symbols
 * actually added (tracking-only — no order, no execution path).
 */
export async function addDiscoveredToWatchlist(
  symbols: string[],
  opts?: { dataDir?: string; at?: string },
): Promise<{ entries: WatchlistEntry[]; added: string[] }> {
  const current = await readWatchlistEntries(opts);
  const have = new Set(current.map((e) => e.symbol));
  const cap = DISCOVERY_LIMITS.maxWatchlistSymbols;
  const next = [...current];
  const added: string[] = [];
  for (const raw of symbols) {
    const s = normalizeSymbol(raw);
    if (!isValidSymbol(s) || have.has(s)) continue;
    if (next.length >= cap) break; // bounded — stop at the ceiling
    have.add(s);
    next.push({
      symbol: s,
      source: "discovery",
      addedAt: opts?.at ?? new Date().toISOString(),
    });
    added.push(s);
  }
  const entries = await persistWatchlist(next, opts);
  return { entries, added };
}

/** Promote a durable lesson into the playbook's Banked lessons, with the date
 *  and source coaching id as provenance. */
export async function promoteLessonToPlaybook(
  input: { lesson: string; date: string; sourceId: string },
  opts?: { strategyDir?: string },
): Promise<void> {
  const playbook = await readStrategyDoc("playbook", opts);
  if (!playbook.trim()) {
    throw new Error("playbook.md is empty — nothing to promote into");
  }
  const bullet = bankedLessonBullet(input.lesson, input.date, input.sourceId);
  await writeStrategyDoc("playbook", insertBankedLesson(playbook, bullet), opts);
}
