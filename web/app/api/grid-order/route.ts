import { loadConfig, saveConfig } from "@/lib/config";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The saved live-wall order, as an array of go2rtc stream names. */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  return Response.json({ order: loadConfig().gridOrder ?? [] });
}

/** Persist a new live-wall order. Body: { order: string[] }. */
export async function PUT(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const order = (body as { order?: unknown }).order;
  if (!Array.isArray(order) || !order.every((s) => typeof s === "string")) {
    return new Response("order must be an array of strings", { status: 400 });
  }
  saveConfig({ gridOrder: order as string[] });
  return Response.json({ order });
}
