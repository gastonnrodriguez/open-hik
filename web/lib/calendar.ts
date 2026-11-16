import { isapiFetch, xmlBlocks, xmlText } from "@/lib/isapi";

/** Which days of a month have recordings for a channel, straight from the DVR's index. */

const cache = new Map<string, { at: number; days: number[] }>();
/** The current month still changes (a new day starts, old ones get overwritten). */
const TTL_MS = 5 * 60000;

export async function recordedDays(channel: number, year: number, month: number): Promise<number[]> {
  const key = `${channel}-${year}-${month}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.days;

  const res = await isapiFetch(`/ISAPI/ContentMgmt/record/tracks/${channel}01/dailyDistribution`, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: `<?xml version="1.0" encoding="utf-8"?>
<trackDailyParam><year>${year}</year><monthOfYear>${month}</monthOfYear></trackDailyParam>`,
  });
  if (!res.ok) throw new Error(`DVR HTTP ${res.status}`);
  const days: number[] = [];
  for (const day of xmlBlocks(await res.text(), "day")) {
    const n = parseInt(xmlText(day, "dayOfMonth") || "", 10);
    if (n >= 1 && n <= 31 && xmlText(day, "record") === "true") days.push(n);
  }
  cache.set(key, { at: Date.now(), days });
  return days;
}
