import { randomUUID } from "crypto";
import { isapiFetch, xmlBlocks, xmlText } from "@/lib/isapi";

export interface RecordingClip {
  start: string;
  end: string;
  sizeBytes: number | null;
}

function searchXml(channel: number, start: string, end: string, position: number, max: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<CMSearchDescription>
<searchID>${randomUUID()}</searchID>
<trackList><trackID>${channel}01</trackID></trackList>
<timeSpanList><timeSpan>
<startTime>${start}</startTime>
<endTime>${end}</endTime>
</timeSpan></timeSpanList>
<maxResults>${max}</maxResults>
<searchResultPostion>${position}</searchResultPostion>
<metadataList><metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor></metadataList>
</CMSearchDescription>`;
}

/**
 * Recorded files for a channel in a time window, as the DVR stores them (it
 * splits continuous recording into fixed-size files). Times use the DVR's own
 * clock, which it reports with a Z suffix regardless of zone.
 */
export async function searchRecordings(
  channel: number,
  start: string,
  end: string,
  /** Stop after this many files (the DVR returns them oldest first). */
  limit = Infinity
): Promise<RecordingClip[]> {
  const clips: RecordingClip[] = [];
  for (let page = 0; page < 10; page++) {
    const res = await isapiFetch("/ISAPI/ContentMgmt/search", {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: searchXml(channel, start, end, clips.length, Math.min(40, limit)),
    });
    if (!res.ok) throw new Error(`DVR HTTP ${res.status}`);
    const xml = await res.text();
    for (const item of xmlBlocks(xml, "searchMatchItem")) {
      const clipStart = xmlText(item, "startTime");
      const clipEnd = xmlText(item, "endTime");
      if (!clipStart || !clipEnd) continue;
      const uri = xmlText(item, "playbackURI") || "";
      const size = uri.match(/size=(\d+)/);
      clips.push({ start: clipStart, end: clipEnd, sizeBytes: size ? parseInt(size[1], 10) : null });
    }
    if (clips.length >= limit) return clips.slice(0, limit);
    if (xmlText(xml, "responseStatusStrg") !== "MORE") break;
  }
  return clips;
}
