import { describe, expect, it } from "vitest";
import { getPaperAccount } from "./account";

// No ALPACA_* keys are set in the test environment, so the resolver must fall
// back to the seed snapshot with a non-blocking notice.
describe("getPaperAccount", () => {
  it("falls back to seed data when no Alpaca credentials are present", async () => {
    const res = await getPaperAccount();
    expect(res.source).toBe("seed");
    expect(res.notice).toMatch(/sample data/i);
    expect(res.snapshot).not.toBeNull();
    expect(res.snapshot?.account).toBe("paper");
  });
});
