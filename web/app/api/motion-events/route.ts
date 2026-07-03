import { randomUUID } from "crypto";
import { dvrConfigured, isapiFetch, xmlBlocks, xmlText } from "@/lib/isapi";
import { prefetchThumbnails } from "@/lib/media";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export interface MotionEvent {
  channel: number;
  start: string;
  end: string | null;
  target: "human" | "vehicle" | "motion";
}

function searchXml(start: string, end: string, position: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<CMSearchDescription version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<searchID>${randomUUID()}</searchID>
<metaId>log.std-cgi.com</metaId>
<timeSpanList><timeSpan>
<startTime>${start}</startTime>
<endTime>${end}</endTime>
</timeSpan></timeSpanList>
<maxResults>40</maxResults>
<searchResultPostion>${position}</searchResultPostion>
</CMSearchDescription>`;
}

function classify(info: string): MotionEvent["target"] {
  const s = info.toLowerCase();
  if (s.includes("human")) return "human";
  if (s.includes("vehicle")) return "vehicle";
  return "motion";
}

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

  const events: MotionEvent[] = [];
  const openByChannel = new Map<number, MotionEvent>();
  let scanned = 0;

  try {
    for (let page = 0; page < 50; page++) {
      const res = await isapiFetch("/ISAPI/ContentMgmt/logSearch", {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: searchXml(start, end, scanned),
      });
      if (!res.ok) return Response.json({ error: `DVR HTTP ${res.status}` }, { status: 502 });
      const xml = await res.text();
      const items = xmlBlocks(xml, "searchMatchItem");
      scanned += items.length;

      for (const item of items) {
        const metaId = xmlText(item, "metaId") || "";
        const time = xmlText(item, "StartDateTime");
        const local = (xmlText(item, "localID") || "").match(/(\d+)$/);
        if (!time || !local) continue;
        const channel = parseInt(local[1], 10);

        if (metaId.includes("/Alarm/motionStart")) {
          const info = xmlText(item, "additionInformation") || "";
          const evt: MotionEvent = { channel, start: time, end: null, target: classify(info) };
          events.push(evt);
          openByChannel.set(channel, evt);
        } else if (metaId.includes("/Alarm/motionStop")) {
          const open = openByChannel.get(channel);
          if (open && !open.end) open.end = time;
          openByChannel.delete(channel);
        }
      }

      if (xmlText(xml, "responseStatusStrg") !== "MORE" || items.length === 0) break;
    }
  } catch {
    return Response.json({ error: "DVR unreachable" }, { status: 502 });
  }

  let out = events;
  if (channelFilter) out = out.filter((e) => e.channel === parseInt(channelFilter, 10));
  if (targetFilter && targetFilter !== "all") out = out.filter((e) => e.target === targetFilter);

  // warm the thumbnail cache in display order while the user browses
  prefetchThumbnails(out.slice(0, 300).map((e) => ({ channel: e.channel, time: e.start })));

  return Response.json({ events: out });
}
