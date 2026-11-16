import { dvrConfigured } from "@/lib/isapi";
import { searchRecordings } from "@/lib/recordings";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export type { RecordingClip } from "@/lib/recordings";

/**
 * Recorded clips for a channel in a time window.
 * GET /api/recordings?channel=1&start=2026-07-01T00:00:00Z&end=2026-07-02T00:00:00Z
 * Times use the DVR's own clock (it reports them with a Z suffix regardless of zone).
 */
export async function GET(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!dvrConfigured()) return Response.json({ error: "DVR not configured" }, { status: 503 });

  const url = new URL(req.url);
  const channel = parseInt(url.searchParams.get("channel") || "", 10);
  const start = url.searchParams.get("start") || "";
  const end = url.searchParams.get("end") || "";
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  if (!Number.isInteger(channel) || channel < 1 || channel > 64 || !iso.test(start) || !iso.test(end)) {
    return Response.json({ error: "Bad parameters" }, { status: 400 });
  }

  try {
    return Response.json({ clips: await searchRecordings(channel, start, end) });
  } catch (e) {
    const msg = (e as Error).message;
    return Response.json({ error: msg.startsWith("DVR HTTP") ? msg : "DVR unreachable" }, { status: 502 });
  }
}
