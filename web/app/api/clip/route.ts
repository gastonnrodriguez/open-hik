import { Readable } from "stream";
import { dvrConfigured } from "@/lib/isapi";
import { clipStream, compactTime } from "@/lib/media";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_CLIP_SECONDS = 300;

/** MP4 download of a recording range: /api/clip?channel=1&start=...&end=... */
export async function GET(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const url = new URL(req.url);
  const channel = parseInt(url.searchParams.get("channel") || "", 10);
  const start = url.searchParams.get("start") || "";
  const end = url.searchParams.get("end") || "";
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  const durationSec = (Date.parse(end) - Date.parse(start)) / 1000;
  if (
    !Number.isInteger(channel) || channel < 1 || channel > 64 ||
    !iso.test(start) || !iso.test(end) ||
    !(durationSec > 0 && durationSec <= MAX_CLIP_SECONDS) ||
    !dvrConfigured()
  ) {
    return new Response("Bad parameters", { status: 400 });
  }

  const proc = clipStream(channel, start, end);
  const body = Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>;
  const filename = `cam${channel}-${compactTime(start)}.mp4`;
  return new Response(body, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
