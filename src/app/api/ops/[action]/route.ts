import { spawn, type ChildProcess } from "node:child_process";
import { buildOpsSteps, resolveOpsAction } from "@/lib/server/ops";
import { authorize } from "@/lib/server/authorize";

/**
 * Operations control-panel runner. Runs a FIXED, allowlisted action ID's
 * server-side step(s) and streams stdout/stderr + exit code over SSE.
 *
 * Security contract (`.agents/nextjs.md` "Server-side command execution"):
 *  - **Allowlist only** — the `[action]` segment must resolve via
 *    `resolveOpsAction`; an unknown ID / path / traversal string is refused
 *    (404) before anything runs. No client string is ever interpolated into a
 *    command, and the request body is never read for command data.
 *  - **No shell** — every step is spawned with an args array and
 *    `shell: false`.
 *  - **Token-gated + localhost-only, fail closed** — see `authorize` below.
 *  - Destructive actions are confirm-gated in the UI (AlertDialog).
 *
 * This endpoint can never open the live-trading gate or fund the account — the
 * allowlist contains no such action by construction.
 *
 * LOCAL ONLY. Never expose this server publicly.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ action: string }> },
): Promise<Response> {
  const { action } = await ctx.params;

  // 1. Allowlist gate — unknown ID / path / traversal is refused before auth.
  const meta = resolveOpsAction(action);
  if (!meta) {
    return Response.json(
      { error: `unknown action: ${action}` },
      { status: 404 },
    );
  }

  // 2. Auth gate — fail closed, token or same-origin, localhost only.
  const auth = authorize(req);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let child: ChildProcess | null = null;

      const close = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };
      const send = (obj: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(sse(obj)));
      };
      const onAbort = () => {
        try {
          child?.kill("SIGTERM");
        } catch {
          /* already gone */
        }
        close();
      };
      req.signal.addEventListener("abort", onAbort);

      try {
        const steps = await buildOpsSteps(meta.id);
        send({ type: "start", action: meta.id, label: meta.label, steps: steps.length });

        if (steps.length === 0) {
          send({
            type: "chunk",
            text: "Nothing to do — no matching launchd plists found. Run “Install routine plists” first.\n",
          });
          send({ type: "exit", code: 0 });
          return;
        }

        let exitCode = 0;
        for (const step of steps) {
          if (steps.length > 1) {
            // Show each step's command when an action fans out over plists.
            send({ type: "chunk", text: `\n$ ${step.command} ${step.args.join(" ")}\n` });
          }
          // argv array + shell:false → no shell, no injection surface.
          exitCode = await new Promise<number>((resolve) => {
            const proc = spawn(step.command, step.args, {
              cwd: process.cwd(),
              shell: false,
            });
            child = proc;
            proc.stdout.on("data", (d: Buffer) => send({ type: "chunk", text: d.toString() }));
            proc.stderr.on("data", (d: Buffer) => send({ type: "chunk", text: d.toString() }));
            proc.on("error", (err) => {
              send({ type: "chunk", text: `\n[spawn error] ${err.message}\n` });
              resolve(127);
            });
            proc.on("close", (code) => resolve(code ?? 0));
          });
          if (exitCode !== 0) break; // stop the chain on first failure
        }
        send({ type: "exit", code: exitCode });
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
