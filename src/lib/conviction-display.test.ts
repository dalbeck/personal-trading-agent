import { describe, expect, it } from "vitest";
import { convictionDisplay } from "@/lib/conviction-display";

describe("convictionDisplay", () => {
  it("frames the tier as a ranking signal, not a verdict", () => {
    expect(convictionDisplay("high", "approve")?.label).toBe("High signal");
    expect(convictionDisplay("moderate", "concern")?.label).toBe("Moderate signal");
    expect(convictionDisplay("watch", null)?.label).toBe("Watch signal");
  });

  it("uses the calm tier tone when the red-team has not rejected", () => {
    expect(convictionDisplay("high", "approve")?.tone).toBe("accent");
    expect(convictionDisplay("high", "concern")?.tone).toBe("accent");
    expect(convictionDisplay("high", null)?.tone).toBe("accent");
  });

  it("never shows a reassuring tone on a red-team REJECT — mutes + flags the conflict", () => {
    const r = convictionDisplay("high", "reject");
    expect(r?.tone).toBe("muted"); // no bare green/accent "high" on a rejected proposal
    expect(r?.conflicted).toBe(true);
    expect(r?.note).toMatch(/red-team reject/i);
  });

  it("is null for an unscored (no-tier) proposal", () => {
    expect(convictionDisplay(null, "approve")).toBeNull();
    expect(convictionDisplay(null, null)).toBeNull();
  });
});
