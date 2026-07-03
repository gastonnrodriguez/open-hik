import { rtspUrl, type DvrConfig } from "@/lib/config";
import { isapiFetch, xmlBlocks, xmlText } from "@/lib/isapi";

const GO2RTC = process.env.GO2RTC_INTERNAL_URL || "http://localhost:1984";

export interface DvrProbeResult {
  model: string;
  serial: string;
  channels: { id: number; name: string }[];
}

/** Validates credentials against the DVR and returns what was found. */
export async function probeDvr(dvr: DvrConfig): Promise<DvrProbeResult> {
  const info = await isapiFetch("/ISAPI/System/deviceInfo", undefined, dvr);
  if (info.status === 401) throw new Error("Wrong username or password");
  if (!info.ok) throw new Error(`DVR answered HTTP ${info.status} — is this a Hikvision device?`);
  const infoXml = await info.text();
  const model = xmlText(infoXml, "model") || "unknown model";
  const serial = xmlText(infoXml, "serialNumber") || "";

  const chRes = await isapiFetch("/ISAPI/System/Video/inputs/channels", undefined, dvr);
  const channels: DvrProbeResult["channels"] = [];
  if (chRes.ok) {
    for (const block of xmlBlocks(await chRes.text(), "VideoInputChannel")) {
      const id = xmlText(block, "id");
      const name = xmlText(block, "name");
      if (id) channels.push({ id: parseInt(id, 10), name: name || `CH ${id}` });
    }
  }
  return { model, serial, channels };
}

/**
 * Registers every DVR channel in go2rtc: cam-N (sub stream, for the grid)
 * and cam-N-hd (main stream, for fullscreen).
 */
export async function syncGo2rtcStreams(dvr: DvrConfig, channelIds: number[]): Promise<void> {
  for (const id of channelIds) {
    const defs = [
      { name: `cam-${id}`, path: `/Streaming/Channels/${id}02#backchannel=0` },
      { name: `cam-${id}-hd`, path: `/Streaming/Channels/${id}01#backchannel=0` },
    ];
    for (const def of defs) {
      const url = `${GO2RTC}/api/streams?name=${encodeURIComponent(def.name)}&src=${encodeURIComponent(rtspUrl(dvr, def.path))}`;
      const res = await fetch(url, { method: "PUT" });
      if (!res.ok) throw new Error(`go2rtc rejected stream ${def.name} (HTTP ${res.status})`);
    }
  }
}
