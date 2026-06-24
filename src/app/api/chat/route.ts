import { spawn } from "node:child_process";
import { z } from "zod";
import { isChatModel } from "@/lib/chat";
import { assistantCommand, buildGroundingContext } from "@/lib/server/chat";

// Must run in the Node runtime (spawns child processes); never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
  model: z.string(),
});

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success || !isChatModel(parsed.data.model)) {
    return new Response("Invalid request", { status: 400 });
  }
  const { prompt, model } = parsed.data;

  const context = await buildGroundingContext();
  const fullPrompt = `${context}\n\nUser question: ${prompt}`;
  const { cmd, args } = assistantCommand(model, fullPrompt);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
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

      // argv is passed directly (no shell) → user prompt can't inject commands.
      const child = spawn(cmd, args, { cwd: process.cwd() });
      child.stdin.end(); // `codex exec` reads stdin; close it so it won't hang.

      let stderr = "";
      child.stdout.on("data", (d: Buffer) =>
        send({ type: "chunk", text: d.toString() }),
      );
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      child.on("error", (err) => {
        send({
          type: "error",
          message: `Could not run "${cmd}": ${err.message}`,
        });
        close();
      });
      child.on("close", (code) => {
        if (code === 0) send({ type: "done" });
        else
          send({
            type: "error",
            message:
              stderr.trim().slice(0, 500) || `${cmd} exited with code ${code}`,
          });
        close();
      });

      req.signal.addEventListener("abort", () => {
        try {
          child.kill("SIGTERM");
        } catch {
          /* already gone */
        }
        close();
      });
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
