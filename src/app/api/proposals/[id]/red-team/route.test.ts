import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The re-run endpoint always re-judges (even a proposal that already has a
 * verdict) and overwrites the stored verdict — the deliberate "second look".
 * Mocks keep it hermetic: no codex spawn, no filesystem.
 */
const readProposals = vi.fn();
const runRedTeam = vi.fn();
const setProposalRedTeam = vi.fn();

vi.mock("@/lib/server/data", () => ({
  readProposals: (...a: unknown[]) => readProposals(...a),
}));
vi.mock("@/lib/server/red-team", () => ({
  runRedTeam: (...a: unknown[]) => runRedTeam(...a),
  // The route validates the optional model from the body; keep the real default
  // behavior (anything but "claude" → "codex").
  parseRedTeamModel: (raw: unknown) => (raw === "claude" ? "claude" : "codex"),
}));
vi.mock("@/lib/server/writers", () => ({
  setProposalRedTeam: (...a: unknown[]) => setProposalRedTeam(...a),
}));

import { POST } from "./route";

const OLD_VERDICT = { verdict: "approve", notes: "Old take.", factors: [], basis: null };
const NEW_VERDICT = { verdict: "reject", notes: "Fresh take — thesis fails.", factors: [], basis: null };

function proposal() {
  return {
    id: "p-1",
    symbol: "MSFT",
    action: "buy",
    side: "long",
    qty: 5,
    limitPrice: 400,
    stopPrice: 380,
    takeProfit: 460,
    thesis: "Megacap leadership.",
    reasoning: "Pullback held.",
    redTeam: OLD_VERDICT,
  };
}

const TOKEN = "test-trigger-token";
const AUTH = { host: "localhost", authorization: `Bearer ${TOKEN}` };

const call = (id: string) =>
  POST(new Request("http://localhost/x", { method: "POST", headers: AUTH }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  process.env.ROUTINE_TRIGGER_TOKEN = TOKEN;
});
afterEach(() => {
  vi.clearAllMocks();
  delete process.env.ROUTINE_TRIGGER_TOKEN;
});

describe("POST /api/proposals/[id]/red-team", () => {
  it("re-runs the prosecutor and overwrites the stored verdict", async () => {
    readProposals.mockResolvedValue([proposal()]);
    runRedTeam.mockResolvedValue(NEW_VERDICT);
    setProposalRedTeam.mockResolvedValue({ id: "p-1", file: "x.json" });

    const res = await call("p-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verdict: NEW_VERDICT });
    // The prosecutor ran even though a verdict already existed.
    expect(runRedTeam).toHaveBeenCalledOnce();
    // The NEW verdict was persisted over the old one.
    expect(setProposalRedTeam).toHaveBeenCalledWith("p-1", NEW_VERDICT);
  });

  it("passes the body's model to the prosecutor (red-team-model-toggle)", async () => {
    readProposals.mockResolvedValue([proposal()]);
    runRedTeam.mockResolvedValue(NEW_VERDICT);
    setProposalRedTeam.mockResolvedValue({ id: "p-1", file: "x.json" });

    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json", ...AUTH },
        body: JSON.stringify({ model: "claude" }),
      }),
      { params: Promise.resolve({ id: "p-1" }) },
    );
    expect(res.status).toBe(200);
    // Second arg carries the selected model.
    expect(runRedTeam).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "MSFT" }),
      { model: "claude" },
    );
  });

  it("defaults to GPT when the body has no/invalid model", async () => {
    readProposals.mockResolvedValue([proposal()]);
    runRedTeam.mockResolvedValue(NEW_VERDICT);
    setProposalRedTeam.mockResolvedValue({ id: "p-1", file: "x.json" });

    // The shared `call` helper sends no body at all.
    const res = await call("p-1");
    expect(res.status).toBe(200);
    expect(runRedTeam).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "MSFT" }),
      { model: "codex" },
    );
  });

  it("404s an unknown proposal and never runs the prosecutor", async () => {
    readProposals.mockResolvedValue([proposal()]);
    const res = await call("nope");
    expect(res.status).toBe(404);
    expect(runRedTeam).not.toHaveBeenCalled();
  });

  it("500s when the verdict can't be persisted", async () => {
    readProposals.mockResolvedValue([proposal()]);
    runRedTeam.mockResolvedValue(NEW_VERDICT);
    setProposalRedTeam.mockResolvedValue(null); // no matching file
    const res = await call("p-1");
    expect(res.status).toBe(500);
  });
});
