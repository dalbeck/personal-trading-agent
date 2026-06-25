import { describe, expect, it } from "vitest";
import { buildReadiness, type ReadinessInput } from "./go-live";

const CLOSED: ReadinessInput = {
  connected: false,
  brokerGateOpen: false,
  harnessGateOpen: false,
  disconnected: false,
  liveEnabled: false,
  staleToolIds: true,
  funded: false,
};

const OPEN: ReadinessInput = {
  connected: true,
  brokerGateOpen: true,
  harnessGateOpen: true,
  disconnected: false,
  liveEnabled: true,
  staleToolIds: false,
  funded: true,
};

function state(items: ReturnType<typeof buildReadiness>, id: string) {
  return items.find((x) => x.id === id)?.state;
}

describe("buildReadiness", () => {
  it("shipped/closed state: gates are todo, stale ids flagged, funding is info", () => {
    const items = buildReadiness(CLOSED);
    expect(state(items, "tool-ids")).toBe("todo");
    expect(state(items, "connected")).toBe("todo");
    expect(state(items, "broker-gate")).toBe("todo");
    expect(state(items, "harness-gate")).toBe("todo");
    expect(state(items, "not-halted")).toBe("done"); // no halt = done
    expect(state(items, "funded")).toBe("info"); // optional, not a hard blocker
  });

  it("fully open: every gate is done", () => {
    const items = buildReadiness(OPEN);
    for (const id of ["tool-ids", "connected", "broker-gate", "harness-gate", "not-halted", "funded"]) {
      expect(state(items, id)).toBe("done");
    }
  });

  it("a latched halt shows as todo", () => {
    expect(state(buildReadiness({ ...OPEN, disconnected: true }), "not-halted")).toBe(
      "todo",
    );
  });
});
