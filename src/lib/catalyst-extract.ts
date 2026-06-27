/**
 * Catalyst extraction (catalyst-extraction-quality M2). The desk wants a
 * **specific why-now** behind every entry — not a company description. The
 * analyze pipeline used to stuff the AI narrative summary (a company blurb) into
 * the catalyst field, where it green-checked the catalyst checklist item. This
 * module pulls a catalyst from the structured `catalysts[]` why-now phrases
 * instead, rejects anything that looks like a company description, and classifies
 * the phrase into a `catalystType`. When nothing real is available it returns
 * null — so the catalyst surfaces as missing (flagged ⚑), never a passing blurb.
 *
 * Plain module (no `server-only`) so it is pure + unit-tested.
 */
import { truncateOnWord } from "@/lib/truncate";
import type { CatalystType } from "@/lib/catalyst";

/** A catalyst phrase is kept this short for display (word-truncated). */
const CATALYST_MAX = 160;

/**
 * True when the text reads like a company **description / profile** rather than a
 * why-now catalyst — the boilerplate the analyst should NOT pass off as a
 * catalyst. Matches profile verbs ("provides / operates / manufactures /
 * is a … company") or an over-long narrative.
 */
export function isCompanyDescription(text: string): boolean {
  const s = (text ?? "").trim();
  if (!s) return false;
  // A very long narrative is a profile, not a crisp catalyst (a real why-now is
  // brief; a long genuine catalyst is still extracted, just word-truncated).
  if (s.length > 220) return true;
  return /\b(provides|operates|engages in|specializes in|manufactures|designs and|headquartered|incorporated|together with|is an? [a-z].{0,40}\b(company|corporation|provider|firm|bank|maker|holding))\b/i.test(
    s,
  );
}

/** Best-effort classify a why-now phrase into a specific catalyst type; a genuine
 *  catalyst with no enum bucket stays `other` (still a passing, named why-now).
 *
 *  Order matters: regulatory/approval/M&A keywords are checked FIRST so that an
 *  EMA-approval or acquisition headline is never mis-bucketed as earnings_momentum
 *  (the earnings rule would otherwise grab it because "revenue" or other financial
 *  terms may co-appear). Guidance is checked AFTER product so a pure guidance
 *  headline ("raises outlook") still lands in guidance — the product regex contains
 *  no guidance words. (catalyst-selection-quality M3) */
export function classifyCatalyst(phrase: string): CatalystType {
  const s = (phrase ?? "").toLowerCase();
  // 1. Regulatory / approval / M&A / clinical / product — checked FIRST so an
  //    approval or acquisition headline is never grabbed by the earnings rule.
  if (
    /\b(approv\w*|clears?|cleared|fda|ema|chmp|acquir\w*|acquisition|merger|buyout|takeover|launch\w*|unveil\w*|partnership|contract|deal|product)\b/.test(
      s,
    )
  ) {
    return "product_news";
  }
  // 2. Earnings / revenue results.
  if (/\b(earnings|eps|beat|miss|quarter|results|revenue|print)\b/.test(s)) {
    return "earnings_momentum";
  }
  // 3. Guidance / outlook (no product words, so pure guidance phrases land here).
  if (/\b(guidance|outlook|forecast|raised|raises|reaffirm|reiterat)\w*\b/.test(s)) {
    return "guidance";
  }
  // 4. Sector rotation.
  if (/\b(sector|rotation|peers|industry)\b/.test(s)) {
    return "sector_rotation";
  }
  return "other";
}

export interface ExtractedCatalyst {
  catalyst: string;
  catalystType: CatalystType;
}

/**
 * Pull the first REAL catalyst out of the structured why-now phrases, skipping
 * any company-description boilerplate, word-truncating it for display. Returns
 * null when there's nothing usable — the caller then leaves the catalyst empty
 * (flagged), never a description masquerading as a catalyst.
 */
export function extractCatalyst(
  catalysts: string[] | undefined | null,
): ExtractedCatalyst | null {
  for (const raw of catalysts ?? []) {
    const phrase = (raw ?? "").trim();
    if (!phrase || isCompanyDescription(phrase)) continue;
    return {
      catalyst: truncateOnWord(phrase, CATALYST_MAX),
      catalystType: classifyCatalyst(phrase),
    };
  }
  return null;
}
