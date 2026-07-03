import { randomUUID } from "crypto";
import { dvrConfigured, isapiFetch, xmlBlocks, xmlText } from "@/lib/isapi";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export interface RecordingClip {
  start: string;
  end: string;
  sizeBytes: number | null;
}

function searchXml(channel: number, start: string, end: string, position: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<CMSearchDescription>
<searchID>${randomUUID()}</searchID>
<trackList><trackID>${channel}01</trackID></trackList>
<timeSpanList><timeSpan>
<startTime>${start}</startTime>
<endTime>${end}</endTime>
</timeSpan></timeSpanList>
<maxResults>40</maxResults>
<searchResultPostion>${position}</searchResultPostion>
<metadataList><metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor></metadataList>
</CMSearchDescription>`;
}

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

  const clips: RecordingClip[] = [];
  try {
    for (let page = 0; page < 10; page++) {
      const res = await isapiFetch("/ISAPI/ContentMgmt/search", {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: searchXml(channel, start, end, clips.length),
      });
      if (!res.ok) return Response.json({ error: `DVR HTTP ${res.status}` }, { status: 502 });
      const xml = await res.text();
      for (const item of xmlBlocks(xml, "searchMatchItem")) {
        const clipStart = xmlText(item, "startTime");
        const clipEnd = xmlText(item, "endTime");
        if (!clipStart || !clipEnd) continue;
        const uri = xmlText(item, "playbackURI") || "";
        const size = uri.match(/size=(\d+)/);
        clips.push({ start: clipStart, end: clipEnd, sizeBytes: size ? parseInt(size[1], 10) : null });
      }
      if (xmlText(xml, "responseStatusStrg") !== "MORE") break;
    }
    return Response.json({ clips });
  } catch {
    return Response.json({ error: "DVR unreachable" }, { status: 502 });
  }
}
