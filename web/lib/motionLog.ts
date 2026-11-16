import { randomUUID } from "crypto";
import { isapiFetch, xmlBlocks, xmlText } from "@/lib/isapi";

/** Motion events read from the DVR's own log (AcuSense-classified when available). */

export interface MotionEvent {
  channel: number;
  start: string;
  end: string | null;
  target: "human" | "vehicle" | "motion";
}

const PAGE_SIZE = 40;
/** The DVR silently ends a log search after this many entries, however many match. */
const SEARCH_CAP = 2000;
const MAX_ROUNDS = 15;

function searchXml(start: string, end: string, position: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<CMSearchDescription version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<searchID>${randomUUID()}</searchID>
<metaId>log.std-cgi.com</metaId>
<timeSpanList><timeSpan>
<startTime>${start}</startTime>
<endTime>${end}</endTime>
</timeSpan></timeSpanList>
<maxResults>${PAGE_SIZE}</maxResults>
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
 * Every motion event (all channels) between two DVR-clock timestamps, oldest
 * first. A busy day easily exceeds the DVR's per-search cap, so when a search
 * hits it a new one resumes from the last timestamp seen; entries from the
 * overlapping second are de-duplicated.
 */
export async function fetchMotionEvents(start: string, end: string): Promise<MotionEvent[]> {
  const events: MotionEvent[] = [];
  const openByChannel = new Map<number, MotionEvent>();
  const seen = new Set<string>();
  let from = start;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let scanned = 0;
    let lastTime = from;

    for (let page = 0; page < SEARCH_CAP / PAGE_SIZE; page++) {
      const res = await isapiFetch("/ISAPI/ContentMgmt/logSearch", {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: searchXml(from, end, scanned),
      });
      if (!res.ok) throw new Error(`DVR HTTP ${res.status}`);
      const xml = await res.text();
      const items = xmlBlocks(xml, "searchMatchItem");
      scanned += items.length;

      for (const item of items) {
        const metaId = xmlText(item, "metaId") || "";
        const time = xmlText(item, "StartDateTime");
        const localId = xmlText(item, "localID") || "";
        if (!time) continue;
        lastTime = time;

        const key = `${metaId}|${time}|${localId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const local = localId.match(/(\d+)$/);
        if (!local) continue;
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

    // under the cap: the search really reached the end of the range
    if (scanned < SEARCH_CAP || lastTime === from) break;
    from = lastTime;
  }

  return events;
}
