import { isapiFetch, xmlBlocks, xmlText } from "@/lib/isapi";
import { searchRecordings } from "@/lib/recordings";

/** Health snapshot of the DVR: device, load, disks and how far back recordings go. */

export interface DiskStatus {
  id: string;
  name: string;
  type: string;
  /** As the DVR reports it: "ok", "unformatted", "error", "idle", "mismatch", "offline", ... */
  status: string;
  capacityMB: number;
  freeMB: number;
}

export interface DvrStatus {
  model: string | null;
  firmware: string | null;
  uptimeSeconds: number | null;
  cpuPercent: number | null;
  /** Share of RAM in use, 0-100. */
  memoryPercent: number | null;
  disks: DiskStatus[];
  /** Oldest footage still on disk, DVR local time ("YYYY-MM-DDTHH:MM:SS"). */
  oldestRecording: string | null;
  /** DVR clock when this was read. */
  deviceTime: string | null;
  /** True when no disk is present or any disk reports something other than ok/idle. */
  diskProblem: boolean;
}

const TTL_MS = 60000;
let cached: { at: number; status: DvrStatus } | null = null;

async function getXml(path: string): Promise<string | null> {
  try {
    const res = await isapiFetch(path);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

const num = (s: string | null): number | null => {
  const n = s === null ? NaN : Number(s.trim());
  return Number.isFinite(n) ? n : null;
};

/** Start of the oldest file across the cameras (each camera's files come back oldest first). */
async function oldestRecording(channels: number[], until: string): Promise<string | null> {
  const firsts = await Promise.all(
    channels.map((ch) =>
      searchRecordings(ch, "1970-01-01T00:00:00Z", until, 1)
        .then((clips) => clips[0]?.start ?? null)
        .catch(() => null)
    )
  );
  const found = firsts.filter((s): s is string => !!s).sort();
  return found[0]?.slice(0, 19) ?? null;
}

export async function dvrStatus(): Promise<DvrStatus> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.status;

  const [info, sys, storage, inputs] = await Promise.all([
    getXml("/ISAPI/System/deviceInfo"),
    getXml("/ISAPI/System/status"),
    getXml("/ISAPI/ContentMgmt/Storage"),
    getXml("/ISAPI/System/Video/inputs/channels"),
  ]);
  if (!info && !sys && !storage) throw new Error("DVR unreachable");

  const disks: DiskStatus[] = storage
    ? xmlBlocks(storage, "hdd").map((hdd) => ({
        id: xmlText(hdd, "id") || "?",
        name: xmlText(hdd, "hddName") || "disk",
        type: xmlText(hdd, "hddType") || "",
        status: xmlText(hdd, "status") || "unknown",
        capacityMB: num(xmlText(hdd, "capacity")) ?? 0,
        freeMB: num(xmlText(hdd, "freeSpace")) ?? 0,
      }))
    : [];

  const used = sys ? num(xmlText(sys, "memoryUsage")) : null;
  const free = sys ? num(xmlText(sys, "memoryAvailable")) : null;
  const deviceTime = sys ? (xmlText(sys, "currentDeviceTime") || "").slice(0, 19) || null : null;

  const channels = inputs
    ? xmlBlocks(inputs, "VideoInputChannel")
        .map((b) => parseInt(xmlText(b, "id") || "", 10))
        .filter((n) => n >= 1 && n <= 64)
    : [1];
  const until = `${(deviceTime || new Date().toISOString()).slice(0, 19)}Z`;

  const status: DvrStatus = {
    model: info ? xmlText(info, "model") : null,
    firmware: info
      ? [xmlText(info, "firmwareVersion"), xmlText(info, "firmwareReleasedDate")].filter(Boolean).join(" ") || null
      : null,
    uptimeSeconds: sys ? num(xmlText(sys, "deviceUpTime")) : null,
    cpuPercent: sys ? num(xmlText(sys, "cpuUtilization")) : null,
    memoryPercent: used !== null && free !== null && used + free > 0 ? Math.round((used / (used + free)) * 100) : null,
    disks,
    oldestRecording: await oldestRecording(channels, until),
    deviceTime,
    // only judge the disks when the DVR actually answered about them
    diskProblem: storage !== null && (disks.length === 0 || disks.some((d) => !/^(ok|idle)$/i.test(d.status))),
  };
  cached = { at: Date.now(), status };
  return status;
}
