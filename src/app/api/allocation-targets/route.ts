import {
  readAllocationTargets,
  writeAllocationTargets,
} from "@/lib/server/allocation-targets";

/**
 * Read/write the human's target allocation across sleeves (portfolio M5). The
 * agent never POSTs here — it is the human's edit surface, mirroring the
 * risk/discovery settings routes. Validation is in the schema (no duplicate
 * sleeves; targets sum ≤ 100%).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ targets: await readAllocationTargets() });
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  try {
    const targets = await writeAllocationTargets(body);
    return Response.json({ targets });
  } catch (err) {
    return Response.json(
      { error: `invalid allocation targets: ${(err as Error).message}` },
      { status: 400 },
    );
  }
}
