import { describe, expect, it } from "vitest";
import { ROUTINE_ALLOWED_TOOLS, buildRoutineCliArgs } from "./routine-cli";

describe("routine CLI args", () => {
  const args = buildRoutineCliArgs("do the scan");

  it("runs claude in print mode with the prompt and an allow-list", () => {
    expect(args[0]).toBe("-p");
    expect(args[1]).toBe("do the scan");
    expect(args[2]).toBe("--allowedTools");
    expect(args.slice(3)).toEqual([...ROUTINE_ALLOWED_TOOLS]);
  });

  it("grants the safe research + write surface", () => {
    for (const t of ["Read", "WebSearch", "Write(data/**)", "Bash(curl:*)"]) {
      expect(args).toContain(t);
    }
  });

  it("never grants order tools, broad bash, broad write, or a skip-permissions flag", () => {
    const joined = args.join(" ");
    // No Robinhood order tools.
    expect(joined).not.toMatch(/place_equity_order|cancel_equity_order/);
    // Bash is scoped to curl only — never an unrestricted Bash grant.
    expect(args).not.toContain("Bash");
    expect(args).not.toContain("Bash(*)");
    // Writes are scoped to data/** — never a repo-wide write/edit.
    expect(args).not.toContain("Write");
    expect(args).not.toContain("Edit");
    // Never the YOLO flag (it would bypass the deny-list).
    expect(joined).not.toMatch(/dangerously-skip-permissions/);
  });
});
