import { spawn } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { DATA_DIR, getDvr, rtspUrl } from "@/lib/config";

/** ffmpeg access to DVR recordings: thumbnails for the motion grid, MP4 clip export. */

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

/** e.g. 2026-07-01T01:31:03Z -> 20260701T013103Z (Hikvision tracks URI format) */
export function compactTime(iso: string): string {
  return iso.replace(/[-:]/g, "");
}

export function trackUrl(channel: number, start: string, end: string): string {
  const dvr = getDvr();
  if (!dvr) throw new Error("DVR not configured");
  return rtspUrl(
    dvr,
    `/Streaming/tracks/${channel}01?starttime=${compactTime(start)}&endtime=${compactTime(end)}`
  );
}

/**
 * The DVR has a hard outgoing-bandwidth budget shared with live view and
 * playback ("453 Not Enough Bandwidth" when exceeded). Start with 2 parallel
 * playback sessions and drop to 1 for a while when the DVR pushes back.
 * Browser-visible requests ("high") always jump ahead of prefetch ("low").
 */
type Priority = "high" | "low";

let maxConcurrent = 2;
let running = 0;
const highQ: (() => void)[] = [];
const lowQ: (() => void)[] = [];

function pump(): void {
  while (running < maxConcurrent) {
    const next = highQ.shift() ?? lowQ.shift();
    if (!next) return;
    running++;
    next();
  }
}

async function withSlot<T>(priority: Priority, fn: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve) => {
    (priority === "high" ? highQ : lowQ).push(resolve);
    pump();
  });
  try {
    return await fn();
  } finally {
    running--;
    pump();
  }
}

function noteBandwidthPushback(): void {
  if (maxConcurrent === 1) return;
  maxConcurrent = 1;
  const timer = setTimeout(() => {
    maxConcurrent = 2;
    pump();
  }, 15 * 60000);
  timer.unref?.();
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => {
      if (stderr.length < 4096) stderr += c.toString();
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks);
      if (out.length > 0) resolve(out);
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

function addSeconds(iso: string, secs: number): string {
  return new Date(Date.parse(iso) + secs * 1000).toISOString().slice(0, 19) + "Z";
}

/** Requests for the same frame (browser + prefetch) share one extraction. */
const inflight = new Map<string, Promise<Buffer | null>>();

/**
 * JPEG frame from the recording at `time`, ~360px wide, cached on disk.
 * Returns null when the DVR has no decodable video there.
 */
export async function recordingThumbnail(
  channel: number,
  time: string,
  priority: Priority = "high"
): Promise<Buffer | null> {
  const dir = path.join(DATA_DIR, "thumbs");
  const file = path.join(dir, `${channel}-${compactTime(time)}.jpg`);
  try {
    return await readFile(file);
  } catch {
    // not cached yet
  }

  const key = `${channel}@${time}`;
  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    const extract = () =>
      withSlot(priority, () =>
        runFfmpeg(
          [
            "-v", "error",
            // keep stream analysis short: we only need the first keyframe
            "-probesize", "1000000",
            "-analyzeduration", "1000000",
            "-rtsp_transport", "tcp",
            "-i", trackUrl(channel, time, addSeconds(time, 12)),
            "-frames:v", "1",
            "-vf", "scale=360:-2",
            "-f", "image2",
            "pipe:1",
          ],
          20000
        )
      );
    try {
      let jpeg: Buffer;
      try {
        jpeg = await extract();
      } catch (err) {
        if (!/453|Not Enough Bandwidth/i.test((err as Error).message)) throw err;
        // DVR is out of playback bandwidth: back off and retry once
        noteBandwidthPushback();
        await new Promise((r) => setTimeout(r, 3000));
        jpeg = await extract();
      }
      await mkdir(dir, { recursive: true });
      await writeFile(file, jpeg);
      return jpeg;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

let prefetchToken = 0;

/**
 * Warms the thumbnail cache for a search result in display order, at low
 * priority. A newer search supersedes the previous prefetch run.
 */
export function prefetchThumbnails(items: { channel: number; time: string }[]): void {
  const token = ++prefetchToken;
  void (async () => {
    for (const item of items) {
      if (token !== prefetchToken) return;
      await recordingThumbnail(item.channel, item.time, "low");
    }
  })();
}

/** MP4 clip of a recording (stream copy, no re-encode), as a Node stream. */
export function clipStream(channel: number, start: string, end: string) {
  const proc = spawn(
    FFMPEG,
    [
      "-v", "error",
      "-rtsp_transport", "tcp",
      "-i", trackUrl(channel, start, end),
      // video untouched; PCMU audio isn't valid in MP4, so transcode it to AAC
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "64k",
      "-movflags", "frag_keyframe+empty_moov",
      "-f", "mp4",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "ignore"] }
  );
  // recordings play back in real time: allow duration + handshake margin
  const durationMs = Date.parse(end) - Date.parse(start);
  const timer = setTimeout(() => proc.kill("SIGKILL"), durationMs + 30000);
  proc.on("close", () => clearTimeout(timer));
  return proc;
}
