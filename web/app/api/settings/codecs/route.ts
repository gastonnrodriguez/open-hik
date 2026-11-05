import { requireAuth } from "@/lib/auth";
import { getDvr } from "@/lib/config";
import { getStreamCodecs, probeDvr, setStreamCodec, syncGo2rtcStreams } from "@/lib/go2rtcSync";

export const dynamic = "force-dynamic";

/** GET: main/sub stream codec of every DVR channel. */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const dvr = getDvr();
  if (!dvr) return Response.json({ error: "DVR not configured" }, { status: 503 });
  try {
    const probe = await probeDvr(dvr);
    const channels = await getStreamCodecs(dvr, probe.channels.map((c) => c.id));
    return Response.json({ channels });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}

/**
 * PUT: switches every channel's SUB stream (the live grid) to H.264 on the DVR,
 * then re-registers the go2rtc streams so the grid plays without transcoding.
 * The main stream (what the DVR records) is left untouched, so H.265 keeps
 * saving disk space.
 */
export async function PUT() {
  const denied = await requireAuth();
  if (denied) return denied;
  const dvr = getDvr();
  if (!dvr) return Response.json({ error: "DVR not configured" }, { status: 503 });
  try {
    const probe = await probeDvr(dvr);
    const ids = probe.channels.map((c) => c.id);
    for (const id of ids) await setStreamCodec(dvr, `${id}02`, "H.264");
    await syncGo2rtcStreams(dvr, ids);
    return Response.json({ channels: await getStreamCodecs(dvr, ids) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
