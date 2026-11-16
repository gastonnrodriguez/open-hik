import { spawn } from "child_process";
import { once } from "events";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { getDvr } from "@/lib/config";
import { isapiFetch } from "@/lib/isapi";

/**
 * Clip export through the DVR's HTTP download instead of RTSP playback.
 * RTSP delivers a recording at real time (a 5 minute clip takes 5 minutes);
 * the download endpoint hands over the same footage as fast as the disk and
 * the network allow — roughly 30x real time on a LAN.
 */

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
/** Download + remux budget. Generous: the request itself is capped by clip length. */
const TIMEOUT_MS = 5 * 60000;

/**
 * The range has to be written with dashes and colons here. With the compact
 * form RTSP uses (20260701T013103Z) the DVR answers "Device Error", and when a
 * file name is included it ignores the range and sends the whole file.
 */
function downloadXml(host: string, channel: number, start: string, end: string): string {
  const uri = `rtsp://${host}/Streaming/tracks/${channel}01?starttime=${start}&amp;endtime=${end}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<downloadRequest version="1.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<playbackURI>${uri}</playbackURI>
</downloadRequest>`;
}

/** Video codec from the MPEG-PS program stream map, when it's in the first bytes. */
function videoCodec(head: Buffer): "hevc" | "h264" | null {
  const psm = head.indexOf(Buffer.from([0, 0, 1, 0xbc]));
  if (psm < 0 || psm + 12 > head.length) return null;
  const infoLen = head.readUInt16BE(psm + 8);
  let pos = psm + 10 + infoLen;
  if (pos + 2 > head.length) return null;
  const mapEnd = Math.min(pos + 2 + head.readUInt16BE(pos), head.length);
  pos += 2;
  while (pos + 4 <= mapEnd) {
    const type = head[pos];
    const id = head[pos + 1];
    if (id >= 0xe0 && id <= 0xef) return type === 0x24 ? "hevc" : type === 0x1b ? "h264" : null;
    pos += 4 + head.readUInt16BE(pos + 2);
  }
  return null;
}

/**
 * Downloads [start, end) of a channel's recording and remuxes it into a
 * regular MP4 (video untouched, G.711 audio to AAC). Resolves to the path of a
 * temporary file the caller must delete, or null when this DVR can't serve the
 * range this way — callers then fall back to RTSP.
 */
export async function downloadClip(channel: number, start: string, end: string): Promise<string | null> {
  const dvr = getDvr();
  if (!dvr) return null;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let dir: string | null = null;
  try {
    const res = await isapiFetch("/ISAPI/ContentMgmt/download", {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: downloadXml(dvr.host, channel, start, end),
      signal: abort.signal,
    });
    if (!res.ok || !res.body || /xml|html/i.test(res.headers.get("content-type") || "")) {
      await res.body?.cancel().catch(() => {});
      return null;
    }

    // Buffer the start: the stream opens with a 24-byte transfer header ahead
    // of Hikvision's "IMKH" file header. ffmpeg only recognises the stream
    // (and its G.711 audio) when it begins exactly at IMKH.
    const reader = res.body.getReader();
    let head = Buffer.alloc(0);
    while (head.length < 4096) {
      const { done, value } = await reader.read();
      if (done) break;
      head = Buffer.concat([head, value]);
    }
    const magic = head.subarray(0, 256).indexOf("IMKH");
    if (magic < 0) {
      await reader.cancel().catch(() => {});
      return null;
    }
    head = head.subarray(magic);

    dir = await mkdtemp(path.join(os.tmpdir(), "openhik-clip-"));
    const file = path.join(dir, "clip.mp4");
    const proc = spawn(
      FFMPEG,
      [
        "-v", "error",
        "-f", "mpeg",
        "-i", "pipe:0",
        "-c:v", "copy",
        // Apple players only open HEVC in MP4 under the hvc1 tag
        ...(videoCodec(head) === "hevc" ? ["-tag:v", "hvc1"] : []),
        "-c:a", "aac",
        "-b:a", "64k",
        // index up front, so the file seeks and shares like any other MP4
        "-movflags", "+faststart",
        "-y", file,
      ],
      { stdio: ["pipe", "ignore", "ignore"] }
    );
    abort.signal.addEventListener("abort", () => proc.kill("SIGKILL"));
    const exited = new Promise<number | null>((resolve) => {
      proc.on("error", () => resolve(-1));
      proc.on("close", resolve);
    });
    proc.stdin.on("error", () => {});

    try {
      if (!proc.stdin.write(head)) await once(proc.stdin, "drain");
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!proc.stdin.write(value)) await once(proc.stdin, "drain");
      }
    } catch {
      // DVR dropped the connection or ffmpeg went away; the exit code decides
    } finally {
      proc.stdin.end();
      await reader.cancel().catch(() => {});
    }

    if ((await exited) !== 0) throw new Error("remux failed");
    const done = dir;
    dir = null;
    return path.join(done, "clip.mp4");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
