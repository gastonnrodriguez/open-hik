import { createReadStream } from "fs";
import { rm, stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { dvrConfigured } from "@/lib/isapi";
import { downloadClip } from "@/lib/download";
import { clipStream, compactTime } from "@/lib/media";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Through the DVR's file download, which runs far faster than real time. */
const MAX_CLIP_SECONDS = 1800;
/** Through RTSP playback (the fallback), which takes as long as the clip lasts. */
const MAX_RTSP_SECONDS = 300;

/** MP4 download of a recording range: /api/clip?channel=1&start=...&end=...[&name=Front] */
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

  // the camera name is only used for the file name: keep it header-safe
  const label =
    (url.searchParams.get("name") || "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) || `cam${channel}`;
  const headers = {
    "Content-Type": "video/mp4",
    "Content-Disposition": `attachment; filename="${label}-${compactTime(start).replace("Z", "")}.mp4"`,
    "Cache-Control": "no-store",
  };

  const file = await downloadClip(channel, start, end);
  if (file) {
    const { size } = await stat(file);
    const stream = createReadStream(file);
    stream.on("close", () => void rm(path.dirname(file), { recursive: true, force: true }).catch(() => {}));
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: { ...headers, "Content-Length": String(size) },
    });
  }

  if (durationSec > MAX_RTSP_SECONDS) {
    return new Response("The DVR refused the fast download; clips over 5 minutes need it.", { status: 502 });
  }
  const proc = clipStream(channel, start, end);
  return new Response(Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>, { headers });
}
