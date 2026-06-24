import type { RiskDecision } from "@/lib/risk";

/**
 * Pure formatting helpers for the journal/coaching writers and the lesson
 * promotion. No I/O — kept separate from the `server-only` writers so they can
 * be unit-tested directly. Body conventions follow `.agents/data-format.md`.
 */

export interface JournalBodyParts {
  thesis: string;
  research?: string;
  redTeam?: string;
  /** "Decision" for trades, "Rejected" for rejections. */
  verdictLabel: "Decision" | "Rejected";
  verdict: string;
}

/** Compose a decision-journal body: thesis lead, then labelled sections. */
export function composeJournalBody(parts: JournalBodyParts): string {
  const sections = [parts.thesis.trim()];
  if (parts.research?.trim()) {
    sections.push(`**Research.** ${parts.research.trim()}`);
  }
  if (parts.redTeam?.trim()) {
    sections.push(`**Red-team.** ${parts.redTeam.trim()}`);
  }
  sections.push(`**${parts.verdictLabel}.** ${parts.verdict.trim()}`);
  return sections.join("\n\n");
}

export interface CoachingBodyParts {
  expected: string;
  actual: string;
  lesson: string;
}

/** Compose a coaching-log body: expected / actual / lesson. */
export function composeCoachingBody(parts: CoachingBodyParts): string {
  return [
    `**Expected.** ${parts.expected.trim()}`,
    `**Actual.** ${parts.actual.trim()}`,
    `**Lesson.** ${parts.lesson.trim()}`,
  ].join("\n\n");
}

/** Turn a blocked risk decision into the prose reason for a rejection entry. */
export function formatRiskRejectionReason(decision: RiskDecision): string {
  const bullets = decision.violations
    .map((v) => `- **${v.rule}** — ${v.message}`)
    .join("\n");
  return `Blocked by the risk engine:\n\n${bullets}`;
}

/** A banked-lesson bullet with promotion provenance (date + source entry id). */
export function bankedLessonBullet(
  lesson: string,
  date: string,
  sourceId: string,
): string {
  const text = lesson.trim().replace(/\s+/g, " ");
  return `- ${text} _(Promoted ${date}, from ${sourceId}.)_`;
}

const BANKED_HEADING = /^##\s+Banked lessons\s*$/im;

/**
 * Insert a banked-lesson bullet as the newest (first) item under the
 * "## Banked lessons" heading of the playbook markdown. Pure — returns the new
 * document. Throws if the section is missing.
 */
export function insertBankedLesson(playbook: string, bullet: string): string {
  const lines = playbook.split("\n");
  const headingIdx = lines.findIndex((l) => BANKED_HEADING.test(l));
  if (headingIdx === -1) {
    throw new Error("playbook has no `## Banked lessons` section");
  }

  // Find where the existing list starts: skip the heading, blank lines, and any
  // intro paragraph, stopping at the first list item or the next heading.
  let insertAt = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("- ") || /^##\s/.test(line)) {
      insertAt = i;
      break;
    }
  }

  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  // Ensure a blank line separates the intro from the new bullet.
  if (before.length && before[before.length - 1].trim() !== "") {
    before.push("");
  }
  const block =
    after.length && after[0].startsWith("- ") ? [bullet] : [bullet, ""];
  return [...before, ...block, ...after].join("\n");
}
