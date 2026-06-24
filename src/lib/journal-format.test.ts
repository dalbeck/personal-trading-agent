import { describe, expect, it } from "vitest";
import {
  bankedLessonBullet,
  composeCoachingBody,
  composeJournalBody,
  formatRiskRejectionReason,
  insertBankedLesson,
} from "./journal-format";

describe("composeJournalBody", () => {
  it("leads with the thesis and labels each provided section", () => {
    const body = composeJournalBody({
      thesis: "Megacap leadership intact.",
      research: "Azure guidance rising.",
      redTeam: "Concern on valuation, not fatal.",
      verdictLabel: "Decision",
      verdict: "Bought 9 shares with a stop under the 50-day.",
    });
    expect(body).toBe(
      [
        "Megacap leadership intact.",
        "",
        "**Research.** Azure guidance rising.",
        "",
        "**Red-team.** Concern on valuation, not fatal.",
        "",
        "**Decision.** Bought 9 shares with a stop under the 50-day.",
      ].join("\n"),
    );
  });

  it("omits sections that are absent", () => {
    const body = composeJournalBody({
      thesis: "Thesis.",
      verdictLabel: "Rejected",
      verdict: "Risk cap breached.",
    });
    expect(body).toBe("Thesis.\n\n**Rejected.** Risk cap breached.");
    expect(body).not.toContain("Research");
    expect(body).not.toContain("Red-team");
  });
});

describe("composeCoachingBody", () => {
  it("labels expected / actual / lesson", () => {
    const body = composeCoachingBody({
      expected: "Base and resume.",
      actual: "Faded to -5%.",
      lesson: "Honor the trim trigger.",
    });
    expect(body).toBe(
      "**Expected.** Base and resume.\n\n**Actual.** Faded to -5%.\n\n**Lesson.** Honor the trim trigger.",
    );
  });
});

describe("formatRiskRejectionReason", () => {
  it("lists each violation as a bullet", () => {
    const reason = formatRiskRejectionReason({
      ok: false,
      violations: [
        { rule: "position-size", message: "size $25,000 exceeds 20%" },
        { rule: "emergency-stop", message: "VIX 32 above 30 — no new buys" },
      ],
    });
    expect(reason).toContain("**position-size** — size $25,000 exceeds 20%");
    expect(reason).toContain("**emergency-stop** — VIX 32 above 30");
  });
});

describe("bankedLessonBullet", () => {
  it("renders the lesson with promotion provenance", () => {
    expect(
      bankedLessonBullet("Prefer pullbacks.", "2026-06-24", "c-2026-06-24"),
    ).toBe("- Prefer pullbacks. _(Promoted 2026-06-24, from c-2026-06-24.)_");
  });
});

describe("insertBankedLesson", () => {
  const playbook = [
    "# Playbook",
    "",
    "## Pre-trade checklist",
    "",
    "1. Thesis",
    "",
    "## Banked lessons",
    "",
    "Durable lessons promoted from the coaching log. Newest first.",
    "",
    "- **Existing lesson.** Old one.",
    "",
  ].join("\n");

  it("inserts the new bullet as the newest (first) banked lesson", () => {
    const bullet = bankedLessonBullet("New lesson.", "2026-06-24", "c-1");
    const out = insertBankedLesson(playbook, bullet);
    const lines = out.split("\n");
    const firstBullet = lines.findIndex((l) => l.startsWith("- "));
    expect(lines[firstBullet]).toBe(bullet);
    // The previously-existing lesson is still present, after the new one.
    expect(out).toContain("- **Existing lesson.** Old one.");
    expect(out.indexOf(bullet)).toBeLessThan(
      out.indexOf("- **Existing lesson.**"),
    );
  });

  it("keeps the checklist section untouched", () => {
    const out = insertBankedLesson(playbook, "- x");
    expect(out).toContain("## Pre-trade checklist");
    expect(out).toContain("1. Thesis");
  });

  it("throws if there is no Banked lessons section", () => {
    expect(() => insertBankedLesson("# Playbook\n\nno section", "- x")).toThrow(
      /banked lessons/i,
    );
  });
});
