import { dvrConfigured } from "@/lib/isapi";
import { recordedDays } from "@/lib/calendar";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Days of a month that have recordings: GET /api/calendar?channel=1&month=2026-07 -> { days: [1, 2, ...] } */
export async function GET(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!dvrConfigured()) return Response.json({ error: "DVR not configured" }, { status: 503 });

  const url = new URL(req.url);
  const channel = parseInt(url.searchParams.get("channel") || "", 10);
  const m = (url.searchParams.get("month") || "").match(/^(\d{4})-(\d{2})$/);
  const month = m ? Number(m[2]) : 0;
  if (!Number.isInteger(channel) || channel < 1 || channel > 64 || !m || month < 1 || month > 12) {
    return Response.json({ error: "Bad parameters" }, { status: 400 });
  }
  try {
    return Response.json({ days: await recordedDays(channel, Number(m[1]), month) });
  } catch (e) {
    const msg = (e as Error).message;
    return Response.json({ error: msg.startsWith("DVR HTTP") ? msg : "DVR unreachable" }, { status: 502 });
  }
}
