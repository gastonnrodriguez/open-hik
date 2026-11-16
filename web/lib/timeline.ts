import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/config";
import { isapiFetch, xmlText } from "@/lib/isapi";
import { fetchMotionEvents, type MotionEvent } from "@/lib/motionLog";
import { searchRecordings } from "@/lib/recordings";

/**
 * One day of a camera as the playback timeline draws it: where there is
 * recorded video and where the DVR logged motion. All values are seconds since
 * 00:00 on the DVR's own clock.
 */

export interface TimelineSpan {
  start: number;
  end: number;
}

export interface TimelineEvent extends TimelineSpan {
  target: MotionEvent["target"];
}

export interface TimelineDay {
  date: string;
  /** DVR clock right now, as seconds into `date`; null when `date` isn't today. */
  now: number | null;
  recordings: TimelineSpan[];
  /** null when the caller asked for recordings only. */
  events: TimelineEvent[] | null;
}

const DAY = 86400;
/** How long today's data is reused before asking the DVR again. */
const LIVE_TTL_MS = 60000;
/** Length drawn for an event the DVR never closed (still running, or stop lost). */
const OPEN_EVENT_SECONDS = 10;

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Seconds from `date` 00:00 to a DVR timestamp, clamped to the day. */
function secondsInto(date: string, stamp: string): number {
  const secs = (Date.parse(stamp.slice(0, 19) + "Z") - Date.parse(`${date}T00:00:00Z`)) / 1000;
  return Math.min(Math.max(secs, 0), DAY);
}

/** The DVR's wall clock as "YYYY-MM-DDTHH:MM:SS" (no zone: every DVR time is local). */
async function dvrClock(): Promise<string> {
  try {
    const res = await isapiFetch("/ISAPI/System/time");
    const local = res.ok ? xmlText(await res.text(), "localTime") : null;
    if (local) return local.slice(0, 19);
  } catch {
    // fall through to the server clock
  }
  return new Date().toISOString().slice(0, 19);
}

const eventsMemo = new Map<string, { at: number; events: MotionEvent[] }>();
const eventsInflight = new Map<string, Promise<MotionEvent[]>>();

/**
 * Motion events of one day, all channels. Reading a full day from the DVR log
 * takes several seconds, so finished days are kept on disk for good and the
 * current day is reused for a minute.
 */
async function dayEvents(date: string, isPast: boolean): Promise<MotionEvent[]> {
  const memo = eventsMemo.get(date);
  if (memo && (isPast || Date.now() - memo.at < LIVE_TTL_MS)) return memo.events;

  const dir = path.join(DATA_DIR, "timeline");
  const file = path.join(dir, `events-${date}.json`);
  if (isPast) {
    try {
      const events = JSON.parse(await readFile(file, "utf8")) as MotionEvent[];
      eventsMemo.set(date, { at: Date.now(), events });
      return events;
    } catch {
      // not cached yet
    }
  }

  const pending = eventsInflight.get(date);
  if (pending) return pending;

  const job = (async () => {
    try {
      const events = await fetchMotionEvents(`${date}T00:00:00Z`, `${nextDay(date)}T00:00:00Z`);
      eventsMemo.set(date, { at: Date.now(), events });
      if (eventsMemo.size > 40) eventsMemo.delete(eventsMemo.keys().next().value!);
      if (isPast) {
        await mkdir(dir, { recursive: true });
        await writeFile(file, JSON.stringify(events));
      }
      return events;
    } finally {
      eventsInflight.delete(date);
    }
  })();
  eventsInflight.set(date, job);
  return job;
}

/** Joins the DVR's back-to-back recording files into continuous spans. */
function mergeSpans(spans: TimelineSpan[]): TimelineSpan[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: TimelineSpan[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span.start <= last.end + 2) last.end = Math.max(last.end, span.end);
    else out.push({ ...span });
  }
  return out;
}

/**
 * `withEvents: false` skips the motion log, which can take many seconds the
 * first time a busy day is read; the UI draws the recordings first and asks
 * again for the events.
 */
export async function timelineDay(
  channel: number,
  date: string,
  withEvents = true
): Promise<TimelineDay> {
  const clock = await dvrClock();
  const today = clock.slice(0, 10);
  const isPast = date < today;
  const now = date === today ? secondsInto(date, clock) : null;

  const [clips, allEvents] = await Promise.all([
    searchRecordings(channel, `${date}T00:00:00Z`, `${nextDay(date)}T00:00:00Z`),
    // the motion log is a nice-to-have: the timeline still works without it
    withEvents ? dayEvents(date, isPast).catch(() => [] as MotionEvent[]) : null,
  ]);

  const recordings = mergeSpans(
    clips.map((c) => ({ start: secondsInto(date, c.start), end: secondsInto(date, c.end) }))
  );

  if (!allEvents) return { date, now, recordings, events: null };

  const events: TimelineEvent[] = [];
  for (const evt of allEvents) {
    if (evt.channel !== channel) continue;
    const start = secondsInto(date, evt.start);
    const end = evt.end
      ? Math.max(secondsInto(date, evt.end), start + 1)
      : Math.min(start + OPEN_EVENT_SECONDS, now ?? DAY);
    events.push({ start, end: Math.max(end, start + 1), target: evt.target });
  }

  return { date, now, recordings, events };
}
