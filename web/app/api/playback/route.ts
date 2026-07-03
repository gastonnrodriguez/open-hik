import { getDvr, rtspUrl } from "@/lib/config";
import { dvrConfigured } from "@/lib/isapi";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const GO2RTC = process.env.GO2RTC_INTERNAL_URL || "http://localhost:1984";

/** e.g. 2026-07-01T01:31:03Z -> 20260701T013103Z (Hikvision tracks URI format) */
function compactTime(iso: string): string {
  return iso.replace(/[-:]/g, "");
}

/**
 * Registers a recording clip as an on-demand stream in go2rtc and returns its
 * name for the player. Credentials are injected server-side; the browser only
 * ever sees the stream name.
 * POST { channel, start, end }
 */
export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!dvrConfigured()) return Response.json({ error: "DVR not configured" }, { status: 503 });

  let body: { channel?: number; start?: string; end?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  const { channel, start, end } = body;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  if (!Number.isInteger(channel) || channel! < 1 || channel! > 64 || !iso.test(start || "") || !iso.test(end || "")) {
    return Response.json({ error: "Bad parameters" }, { status: 400 });
  }

  const src = rtspUrl(
    getDvr()!,
    `/Streaming/tracks/${channel}01?starttime=${compactTime(start!)}&endtime=${compactTime(end!)}`
  );
  const name = `playback-${channel}`;

  try {
    const res = await fetch(
      `${GO2RTC}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(src)}`,
      { method: "PUT" }
    );
    if (!res.ok) return Response.json({ error: `go2rtc HTTP ${res.status}` }, { status: 502 });
    return Response.json({ name });
  } catch {
    return Response.json({ error: "go2rtc unreachable" }, { status: 502 });
  }
}
