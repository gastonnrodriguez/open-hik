import { dvrConfigured } from "@/lib/isapi";
import { fetchMotionEvents, type MotionEvent } from "@/lib/motionLog";
import { prefetchThumbnails } from "@/lib/media";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export type { MotionEvent } from "@/lib/motionLog";

/**
 * Motion events from the DVR log, AcuSense-classified when available.
 * GET /api/motion-events?start=...&end=...&channel=2&target=human
 */
export async function GET(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!dvrConfigured()) return Response.json({ error: "DVR not configured" }, { status: 503 });

  const url = new URL(req.url);
  const start = url.searchParams.get("start") || "";
  const end = url.searchParams.get("end") || "";
  const channelFilter = url.searchParams.get("channel");
  const targetFilter = url.searchParams.get("target"); // human | vehicle | all
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  if (!iso.test(start) || !iso.test(end)) {
    return Response.json({ error: "Bad parameters" }, { status: 400 });
  }

  let events: MotionEvent[];
  try {
    events = await fetchMotionEvents(start, end);
  } catch (e) {
    const msg = (e as Error).message;
    return Response.json({ error: msg.startsWith("DVR HTTP") ? msg : "DVR unreachable" }, { status: 502 });
  }

  let out = events;
  if (channelFilter) out = out.filter((e) => e.channel === parseInt(channelFilter, 10));
  if (targetFilter && targetFilter !== "all") out = out.filter((e) => e.target === targetFilter);

  // warm the thumbnail cache in display order while the user browses
  prefetchThumbnails(out.slice(0, 300).map((e) => ({ channel: e.channel, time: e.start })));

  return Response.json({ events: out });
}
