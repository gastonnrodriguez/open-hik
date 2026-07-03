import { dvrConfigured } from "@/lib/isapi";
import { recordingThumbnail } from "@/lib/media";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Frame from a recording at a given moment: /api/thumb?channel=1&time=2026-07-02T06:02:30Z */
export async function GET(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const url = new URL(req.url);
  const channel = parseInt(url.searchParams.get("channel") || "", 10);
  const time = url.searchParams.get("time") || "";
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  if (!Number.isInteger(channel) || channel < 1 || channel > 64 || !iso.test(time) || !dvrConfigured()) {
    return new Response("Bad parameters", { status: 400 });
  }
  const jpeg = await recordingThumbnail(channel, time);
  if (!jpeg) return new Response("No frame", { status: 404 });
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      // the recording never changes: cache aggressively
      "Cache-Control": "private, max-age=604800, immutable",
    },
  });
}
