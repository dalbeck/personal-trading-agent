import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROUTINE_IDS } from "@/lib/schemas";
import type { RunLog } from "@/lib/types";
import { placePaperOrder, hasAlpacaCredentials } from "@/lib/server/alpaca";
import { executePendingProposals } from "@/lib/server/execute";
import { isTradingHalted } from "@/lib/server/gate";
import { withLock } from "@/lib/server/lockfile";
import { pingDeadMan, sendHeartbeat } from "@/lib/server/notify";
import { recordRunLog } from "@/lib/server/writers";

/**
 * The single engine entrypoint the launchd jobs trigger (one curl per routine).
 * Runs in the always-on Next server, so it has the lockfile, the code-gated
 * execution pipeline, Alpaca paper, and the `codex` red-team — no fragile
 * standalone binary. Everything runs under a single-instance lock so a manual
 * fire can't trade over a scheduled one.
 *
 * LOCAL ONLY. Optionally gated by `ROUTINE_TRIGGER_TOKEN` so a stray localhost
 * page can't trigger trading. Never expose this server publicly.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRoutineId(id: string): id is (typeof ROUTINE_IDS)[number] {
  return (ROUTINE_IDS as readonly string[]).includes(id);
}

/** ISO timestamp in US/Eastern with offset (the desk's trading clock). */
function nowET(): string {
  // Server runs natively on the Mac (typically ET); fall back to host time.
  return new Date().toISOString();
}

/** Spawn a headless `claude -p` analysis session and resolve its stdout. */
function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", prompt], { cwd: process.cwd() });
    child.stdin.end();
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("claude -p timed out"));
    }, 600_000);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim().slice(0, 500) || `claude exited ${code}`));
    });
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!isRoutineId(id)) {
    return Response.json({ error: "unknown routine" }, { status: 404 });
  }

  const token = process.env.ROUTINE_TRIGGER_TOKEN;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = nowET();

  // Kill switch (M6): if trading is halted, refuse to run — log it and 503.
  // Defense in depth alongside unloading the launchd jobs; even a manual fire
  // can't trade while the halt is latched.
  if (await isTradingHalted()) {
    await recordRunLog({
      routine: id,
      startedAt,
      finishedAt: nowET(),
      status: "skipped",
      summary: "Trading halted (kill switch) — routine execution skipped.",
      proposalsConsidered: 0,
      ordersPlaced: 0,
      rejections: 0,
    });
    return Response.json({ status: "halted" }, { status: 503 });
  }

  const result = await withLock(id, async () => {
    let status: RunLog["status"] = "ok";
    let summary = "";
    let proposalsConsidered = 0;
    let ordersPlaced = 0;
    let rejections = 0;

    // Dead-man switch + phone heartbeat on start.
    await pingDeadMan(id, "start");
    await sendHeartbeat(`Routine started: ${id}`, `Started ${startedAt}`);

    try {
      if (id === "market-open-execution") {
        if (!hasAlpacaCredentials()) {
          status = "skipped";
          summary = "No Alpaca credentials — execution skipped.";
        } else {
          const run = await executePendingProposals({
            placeOrder: (order) => placePaperOrder(order),
            timestamp: startedAt,
          });
          proposalsConsidered = run.considered;
          ordersPlaced = run.placed;
          rejections = run.rejected;
          summary = `Considered ${run.considered} proposals → placed ${run.placed}, rejected ${run.rejected}.`;
        }
      } else {
        const promptPath = path.join(process.cwd(), "routines", `${id}.md`);
        const prompt = await readFile(promptPath, "utf8");
        const out = await runClaude(prompt);
        summary = out.trim().split("\n").slice(-1)[0]?.slice(0, 280) || "Run complete.";
      }
    } catch (err) {
      status = "error";
      summary = (err as Error).message.slice(0, 280);
    }

    const log: RunLog = {
      routine: id,
      startedAt,
      finishedAt: nowET(),
      status,
      summary: summary || "Run complete.",
      proposalsConsidered,
      ordersPlaced,
      rejections,
    };
    await recordRunLog(log);

    // Dead-man switch + phone heartbeat on completion.
    if (status === "error") {
      await pingDeadMan(id, "fail");
      await sendHeartbeat(`Routine FAILED: ${id}`, log.summary, { priority: 5 });
    } else {
      await pingDeadMan(id, "success");
      await sendHeartbeat(`Routine finished: ${id}`, log.summary);
      if (rejections > 0) {
        await sendHeartbeat(
          `Orders blocked: ${id}`,
          `${rejections} order(s) blocked by risk rails / red-team.`,
          { priority: 4 },
        );
      }
    }
    return log;
  });

  if (result === null) {
    // Another instance holds the lock — a duplicate fire. Log it and 409.
    await recordRunLog({
      routine: id,
      startedAt,
      finishedAt: nowET(),
      status: "locked",
      summary: "Skipped — another run holds the lock.",
      proposalsConsidered: 0,
      ordersPlaced: 0,
      rejections: 0,
    });
    return Response.json({ status: "locked" }, { status: 409 });
  }

  return Response.json(result);
}
