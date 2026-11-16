import { dvrConfigured } from "@/lib/isapi";
import { timelineDay } from "@/lib/timeline";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * One day of a camera for the playback timeline: recorded spans plus motion
 * events, as seconds since midnight on the DVR's clock.
 * GET /api/timeline?channel=1&date=2026-07-01[&events=0]
 * `events=0` returns the recordings alone, without waiting for the motion log.
 */
export async function GET(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!dvrConfigured()) return Response.json({ error: "DVR not configured" }, { status: 503 });

  const url = new URL(req.url);
  const channel = parseInt(url.searchParams.get("channel") || "", 10);
  const date = url.searchParams.get("date") || "";
  if (
    !Number.isInteger(channel) ||
    channel < 1 ||
    channel > 64 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`))
  ) {
    return Response.json({ error: "Bad parameters" }, { status: 400 });
  }

  try {
    return Response.json(await timelineDay(channel, date, url.searchParams.get("events") !== "0"));
  } catch (e) {
    const msg = (e as Error).message;
    return Response.json({ error: msg.startsWith("DVR HTTP") ? msg : "DVR unreachable" }, { status: 502 });
  }
}
