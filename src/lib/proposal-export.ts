/**
 * Pure serializers for **exporting a proposal** (proposal-export M2) — the full
 * point-in-time context as a Markdown (`.md`) file and as a pdfmake document
 * definition (rendered to a deterministic PDF server-side). Both cover the
 * complete context — frontmatter/header, thesis, technicals, the strategy-aware
 * checklist, sizing math, research, and the red-team reasoning **per lens** (both
 * lenses when a proposal is dual-lens) — and both end with the snapshot/disclaimer
 * footer.
 *
 * These are **pure** (no I/O): they take the proposal + a `generatedAt` stamp and
 * return a string / a plain object, so they are fully unit-tested and the PDF is
 * deterministic for a given input. The actual PDF byte rendering (pdfmake printer
 * + fonts) is the only side-effecting step and lives in the export route.
 *
 * Plain module — the Markdown frontmatter reuses the isomorphic
 * `stringifyFrontmatter`; the PDF builder only constructs a plain doc-definition.
 */
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { stringifyFrontmatter } from "@/lib/server/frontmatter";
import { buildProposalLenses, type ProposalLensView } from "@/lib/proposal-lens";
import { STRATEGY_LABEL } from "@/lib/strategy";
import { targetTypeLabel } from "@/lib/target-type";
import { catalystTypeLabel } from "@/lib/catalyst";
import { formatRelativeVolume } from "@/lib/volume";
import { formatCurrency, formatPercent, formatQty } from "@/lib/format";
import { trancheConditionText } from "@/lib/staged-entry";
import { computeRiskReward, formatRatio } from "@/lib/risk-reward";
import { confidenceBucket } from "@/lib/confidence";
import { catalystSourceLine } from "@/lib/catalyst-source";
import { catalystStateProse, resolveCatalystState } from "@/lib/catalyst-state";
import { isResearchUnavailable, researchUnavailableLabel } from "@/lib/research-availability";
import type { TradeProposal } from "@/lib/types";

export const EXPORT_DISCLAIMER =
  "point-in-time snapshot — not investment advice.";

/** The Research-section catalyst text with the three distinct states
 *  (catalyst-state-honesty M2): the catalyst itself when found, else an explicit
 *  "No catalyst found" (searched) or "Catalyst data unavailable — retry" (failed
 *  fetch) — never a silent blank or a misleading "no catalyst" on a failure. */
function catalystResearchText(p: TradeProposal): string {
  if (p.catalyst) return p.catalyst.trim();
  const state = resolveCatalystState({
    catalyst: p.catalyst,
    catalystState: p.catalystState,
  });
  return catalystStateProse(state) ?? "No catalyst found.";
}

export interface ExportOpts {
  /** ISO timestamp the export was generated — stamped into the footer + the PDF
   *  metadata so the artifact is deterministic for a given input. */
  generatedAt: string;
}

const CHECK_MARK: Record<"pass" | "flag" | "na", string> = {
  pass: "✓",
  flag: "⚑",
  na: "–",
};

/** A stable, human file name base: `proposal-<SYMBOL>-<YYYY-MM-DD>`. */
export function exportFilenameBase(p: TradeProposal): string {
  return `proposal-${p.symbol}-${p.createdAt.slice(0, 10)}`;
}

/** `[label, value]` rows describing the order's technical levels. */
function technicalRows(p: TradeProposal): [string, string][] {
  const rr = computeRiskReward({
    action: p.action,
    entry: p.limitPrice,
    stop: p.stopPrice,
    target: p.takeProfit,
  });
  return [
    ["Sector", p.sector ?? "—"],
    ["Action / side", `${p.action} ${p.side}`],
    ["Entry (marketable-limit)", formatCurrency(p.limitPrice)],
    ["Protective stop", p.stopPrice === null ? "—" : formatCurrency(p.stopPrice)],
    [
      "Profit target",
      p.takeProfit === null
        ? "—"
        : `${formatCurrency(p.takeProfit)} (${targetTypeLabel(p.targetType)})`,
    ],
    ["Reward : risk", rr ? formatRatio(rr.ratio) : "—"],
    [
      "Relative volume",
      p.relativeVolume == null ? "—" : formatRelativeVolume(p.relativeVolume),
    ],
    ["Catalyst type", catalystTypeLabel(p.catalystType)],
  ];
}

/** `[label, value]` rows for the sizing math. */
function sizingRows(p: TradeProposal): [string, string][] {
  const rr = computeRiskReward({
    action: p.action,
    entry: p.limitPrice,
    stop: p.stopPrice,
    target: p.takeProfit,
  });
  const riskPerShare =
    p.stopPrice === null ? null : Math.abs(p.limitPrice - p.stopPrice);
  const totalRisk = riskPerShare === null ? null : riskPerShare * p.qty;
  const conf = p.confidence === null ? null : confidenceBucket(p.confidence);
  return [
    ["Quantity × limit", `${p.qty} × ${formatCurrency(p.limitPrice)}`],
    ["Estimated cost", formatCurrency(p.qty * p.limitPrice)],
    ["Risk per share", riskPerShare === null ? "—" : formatCurrency(riskPerShare)],
    ["Total risk to stop", totalRisk === null ? "—" : formatCurrency(totalRisk)],
    ["Risk (% equity)", formatPercent(p.riskPct, { signed: false })],
    ["Reward : risk", rr ? formatRatio(rr.ratio) : "—"],
    ["Model confidence", conf ? `${conf.level} · ${conf.pct}%` : "—"],
  ];
}

/** The footer line carried by both exports: the data snapshot time, the export
 *  time, and the standing disclaimer. */
function footerText(p: TradeProposal, opts: ExportOpts): string {
  return `Snapshot: ${p.createdAt} · Exported: ${opts.generatedAt} · ${EXPORT_DISCLAIMER}`;
}

/* ------------------------------- Markdown -------------------------------- */

/** Serialize a proposal to a full-context Markdown document (frontmatter +
 *  sections), per `.agents/data-format.md` narrative conventions. Pure. */
export function proposalToMarkdown(p: TradeProposal, opts: ExportOpts): string {
  const lenses = buildProposalLenses(p);
  const verdicts: Record<string, string> = {};
  for (const l of lenses) {
    verdicts[l.strategy] = l.redTeam?.verdict ?? "not run";
  }

  const frontmatter: Record<string, unknown> = {
    id: p.id,
    symbol: p.symbol,
    action: p.action,
    side: p.side,
    strategy: p.strategy,
    account: p.account,
    status: p.status,
    createdAt: p.createdAt,
    convictionTier: p.convictionTier,
    convictionScore: p.convictionScore,
    verdicts,
    exportedAt: opts.generatedAt,
  };

  const lines: string[] = [];
  lines.push(`# ${p.action.toUpperCase()} ${p.symbol}`, "");

  lines.push("## Thesis", "", p.thesis.trim(), "");
  if (p.reasoning.trim()) lines.push(p.reasoning.trim(), "");

  lines.push("## Technicals", "");
  for (const [label, value] of technicalRows(p)) {
    lines.push(`- **${label}:** ${value}`);
  }
  lines.push("");

  for (const lens of lenses) {
    const label = STRATEGY_LABEL[lens.strategy];
    lines.push(`## Checklist — ${label} mandate`, "");
    for (const c of lens.checklist) {
      lines.push(`- ${CHECK_MARK[c.status]} ${c.label} — ${c.detail}`);
    }
    lines.push("");
  }

  lines.push("## Sizing math", "");
  for (const [label, value] of sizingRows(p)) {
    lines.push(`- **${label}:** ${value}`);
  }
  lines.push("");

  if (p.stagedPlan) {
    lines.push(...stagedPlanMarkdown(p.stagedPlan));
  }

  lines.push("## Research", "");
  lines.push(catalystResearchText(p), "");
  if (isResearchUnavailable(p.researchStatus)) {
    const reason = p.researchStatusReason ?? researchUnavailableLabel(p.researchStatus);
    lines.push("", `_Value-quality research unavailable — ${reason}._`, "");
  }
  if (p.catalystSources.length > 0) {
    lines.push("**Catalyst sources**", "");
    for (const s of p.catalystSources) {
      lines.push(`- ${catalystSourceLine(s)}`);
    }
    lines.push("");
  }

  for (const lens of lenses) {
    const label = STRATEGY_LABEL[lens.strategy];
    lines.push(`## Red-team reasoning — ${label} mandate`, "");
    lines.push(...redTeamMarkdown(lens));
    lines.push("");
  }

  lines.push("---", "", `_${footerText(p, opts)}_`);

  return stringifyFrontmatter(frontmatter, lines.join("\n"));
}

/** The staged-entry (DCA) plan section for the Markdown export. */
function stagedPlanMarkdown(plan: NonNullable<TradeProposal["stagedPlan"]>): string[] {
  const band = Math.round(plan.driftBandPct * 100);
  const out: string[] = [
    "## Staged entry (DCA / scale-in)",
    "",
    `Full position split into ${plan.trancheCount} tranches ~${plan.intervalDays} days apart (add within ±${band}% of the prior fill). Risk is sized on the **full** position; each tranche is a separate gated approval — no auto-execution.`,
    "",
    "| Tranche | Size | When & condition | Status |",
    "| --- | --- | --- | --- |",
  ];
  for (const t of plan.tranches) {
    out.push(
      `| ${t.index + 1}/${plan.tranches.length} | ${formatQty(t.qty)} sh (${formatPercent(t.fraction, { signed: false })}) | ${trancheConditionText(plan, t)} | ${t.status} |`,
    );
  }
  out.push("");
  return out;
}

function redTeamMarkdown(lens: ProposalLensView): string[] {
  const rt = lens.redTeam;
  if (!rt) return ["_The cross-model red-team has not judged this lens yet._"];
  const out: string[] = [`**Verdict:** ${rt.verdict}`, ""];
  if (rt.basis) out.push(`**Basis:** ${rt.basis}`, "");
  out.push(rt.notes.trim(), "");
  if (rt.factors.length > 0) {
    for (const f of rt.factors) {
      out.push(`- **${f.label}** (${f.stance}): ${f.assessment}`);
    }
  }
  return out;
}

/* --------------------------------- PDF ----------------------------------- */

/** Build the pdfmake document definition for a full-context proposal PDF. Pure —
 *  returns a plain object; the export route renders it to bytes. Both lenses are
 *  included when the proposal is dual-lens. Deterministic for a given input. */
export function buildProposalPdfDocDefinition(
  p: TradeProposal,
  opts: ExportOpts,
): TDocumentDefinitions {
  const lenses = buildProposalLenses(p);
  const content: Content[] = [];

  content.push({
    text: `${p.action.toUpperCase()} ${p.symbol}`,
    style: "h1",
  });
  content.push({
    text: lenses.map((l) => `${STRATEGY_LABEL[l.strategy]}: ${l.redTeam?.verdict ?? "not run"}`).join("   ·   "),
    style: "subtle",
    margin: [0, 0, 0, 10],
  });

  content.push({ text: "Thesis", style: "h2" });
  content.push({ text: p.thesis.trim(), style: "body" });
  if (p.reasoning.trim())
    content.push({ text: p.reasoning.trim(), style: "muted" });

  content.push({ text: "Technicals", style: "h2" });
  content.push(rowsTable(technicalRows(p)));

  for (const lens of lenses) {
    content.push({
      text: `Checklist — ${STRATEGY_LABEL[lens.strategy]} mandate`,
      style: "h2",
    });
    content.push({
      ul: lens.checklist.map(
        (c) => `${CHECK_MARK[c.status]}  ${c.label} — ${c.detail}`,
      ),
      style: "body",
    });
  }

  content.push({ text: "Sizing math", style: "h2" });
  content.push(rowsTable(sizingRows(p)));

  if (p.stagedPlan) {
    content.push({ text: "Staged entry (DCA / scale-in)", style: "h2" });
    content.push(...stagedPlanPdf(p.stagedPlan));
  }

  content.push({ text: "Research", style: "h2" });
  content.push({ text: catalystResearchText(p), style: "body" });
  if (isResearchUnavailable(p.researchStatus)) {
    const reason = p.researchStatusReason ?? researchUnavailableLabel(p.researchStatus);
    content.push({ text: `Value-quality research unavailable — ${reason}.`, style: "muted" });
  }
  if (p.catalystSources.length > 0) {
    content.push({ text: "Catalyst sources", style: "body", bold: true });
    content.push({
      ul: p.catalystSources.map(catalystSourceLine),
      style: "body",
    });
  }

  for (const lens of lenses) {
    content.push({
      text: `Red-team reasoning — ${STRATEGY_LABEL[lens.strategy]} mandate`,
      style: "h2",
    });
    content.push(...redTeamPdf(lens));
  }

  return {
    info: {
      title: `${p.action.toUpperCase()} ${p.symbol} — proposal`,
      author: "Personal trading desk",
      creationDate: new Date(opts.generatedAt),
    },
    pageSize: "LETTER",
    pageMargins: [48, 56, 48, 64],
    content,
    footer: () => ({
      text: footerText(p, opts),
      style: "footer",
      margin: [48, 16, 48, 0],
    }),
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#1a1a1a" },
    styles: {
      h1: { fontSize: 20, bold: true, margin: [0, 0, 0, 2] },
      h2: { fontSize: 13, bold: true, margin: [0, 14, 0, 6] },
      body: { fontSize: 10, margin: [0, 0, 0, 4], lineHeight: 1.3 },
      muted: { fontSize: 10, color: "#555555", margin: [0, 0, 0, 4], lineHeight: 1.3 },
      subtle: { fontSize: 11, color: "#555555" },
      footer: { fontSize: 8, color: "#777777" },
      cellLabel: { fontSize: 9, color: "#555555" },
      cellValue: { fontSize: 9, bold: true, alignment: "right" },
    },
  };
}

/** The staged-entry (DCA) plan section for the PDF: an intro line + a tranche
 *  table (size / when+condition / status). */
function stagedPlanPdf(plan: NonNullable<TradeProposal["stagedPlan"]>): Content[] {
  const band = Math.round(plan.driftBandPct * 100);
  const header = ["Tranche", "Size", "When & condition", "Status"];
  const rows = plan.tranches.map((t) => [
    `${t.index + 1}/${plan.tranches.length}`,
    `${formatQty(t.qty)} sh (${formatPercent(t.fraction, { signed: false })})`,
    trancheConditionText(plan, t),
    t.status,
  ]);
  return [
    {
      text: `Full position split into ${plan.trancheCount} tranches ~${plan.intervalDays} days apart (add within ±${band}% of the prior fill). Risk is sized on the full position; each tranche is a separate gated approval — no auto-execution.`,
      style: "muted",
    },
    {
      table: {
        widths: ["auto", "auto", "*", "auto"],
        body: [
          header.map((h) => ({ text: h, style: "cellLabel" })),
          ...rows.map((r) => r.map((c) => ({ text: c, style: "body" }))),
        ],
      },
      layout: "lightHorizontalLines",
      margin: [0, 2, 0, 4],
    },
  ];
}

/** A borderless two-column [label, value] table. */
function rowsTable(rows: [string, string][]): Content {
  return {
    table: {
      widths: ["*", "auto"],
      body: rows.map(([label, value]) => [
        { text: label, style: "cellLabel" },
        { text: value, style: "cellValue" },
      ]),
    },
    layout: "noBorders",
    margin: [0, 0, 0, 4],
  };
}

function redTeamPdf(lens: ProposalLensView): Content[] {
  const rt = lens.redTeam;
  if (!rt)
    return [
      {
        text: "The cross-model red-team has not judged this lens yet.",
        style: "muted",
      },
    ];
  const out: Content[] = [
    { text: `Verdict: ${rt.verdict}`, style: "body", bold: true },
  ];
  if (rt.basis) out.push({ text: `Basis: ${rt.basis}`, style: "muted" });
  out.push({ text: rt.notes.trim(), style: "body" });
  if (rt.factors.length > 0) {
    out.push({
      ul: rt.factors.map((f) => `${f.label} (${f.stance}): ${f.assessment}`),
      style: "body",
    });
  }
  return out;
}
