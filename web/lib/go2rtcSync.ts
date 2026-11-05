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
 * Asks the DVR which codec a stream (e.g. "102") is encoded with. Returns null
 * when the DVR doesn't say, so the caller can fall back to a direct stream.
 */
async function streamCodec(dvr: DvrConfig, streamId: string): Promise<string | null> {
  try {
    const res = await isapiFetch(`/ISAPI/Streaming/channels/${streamId}`, undefined, dvr);
    if (!res.ok) return null;
    return xmlText(await res.text(), "videoCodecType");
  } catch {
    return null;
  }
}

export interface ChannelCodecs {
  id: number;
  /** Codec of the main stream (x01, recorded + fullscreen), e.g. "H.265". */
  main: string | null;
  /** Codec of the sub stream (x02, live grid), e.g. "H.264". */
  sub: string | null;
}

/** Reads the main/sub stream codec of every channel from the DVR. */
export async function getStreamCodecs(dvr: DvrConfig, channelIds: number[]): Promise<ChannelCodecs[]> {
  return Promise.all(
    channelIds.map(async (id) => ({
      id,
      main: await streamCodec(dvr, `${id}01`),
      sub: await streamCodec(dvr, `${id}02`),
    }))
  );
}

/**
 * Switches one DVR stream (e.g. "102") to the given codec. Reads the stream's
 * current XML and only rewrites <videoCodecType>, so resolution, frame rate and
 * bitrate stay as they were. No-op when it already uses that codec.
 */
export async function setStreamCodec(
  dvr: DvrConfig,
  streamId: string,
  codec: "H.264" | "H.265"
): Promise<void> {
  const path = `/ISAPI/Streaming/channels/${streamId}`;
  const res = await isapiFetch(path, undefined, dvr);
  if (!res.ok) throw new Error(`Could not read stream ${streamId} (HTTP ${res.status})`);
  const xml = await res.text();
  if (xmlText(xml, "videoCodecType") === codec) return;
  const updated = xml.replace(
    /<videoCodecType>[^<]*<\/videoCodecType>/,
    `<videoCodecType>${codec}</videoCodecType>`
  );
  const put = await isapiFetch(
    path,
    { method: "PUT", headers: { "Content-Type": "application/xml" }, body: updated },
    dvr
  );
  const reply = await put.text();
  if (!put.ok || xmlText(reply, "statusString") !== "OK") {
    const why = xmlText(reply, "subStatusCode") || `HTTP ${put.status}`;
    throw new Error(`DVR rejected the codec change on stream ${streamId} (${why})`);
  }
}

/**
 * Registers every DVR channel in go2rtc: cam-N (sub stream, for the grid)
 * and cam-N-hd (main stream, for fullscreen).
 *
 * Browsers can't decode H265 over WebRTC/MSE, so H265 streams are wrapped in
 * go2rtc's ffmpeg source and transcoded to H264 on demand, using the bitrate-
 * capped `h264` (sub) and `hd` (main) templates from go2rtc.yaml. H264 streams
 * are passed through directly.
 */
export async function syncGo2rtcStreams(dvr: DvrConfig, channelIds: number[]): Promise<void> {
  for (const id of channelIds) {
    const defs = [
      { name: `cam-${id}`, stream: `${id}02`, template: "h264" },
      { name: `cam-${id}-hd`, stream: `${id}01`, template: "hd" },
    ];
    for (const def of defs) {
      const direct = rtspUrl(dvr, `/Streaming/Channels/${def.stream}#backchannel=0`);
      const codec = (await streamCodec(dvr, def.stream)) || "";
      const src = /265|hevc/i.test(codec) ? `ffmpeg:${direct}#video=${def.template}` : direct;
      const url = `${GO2RTC}/api/streams?name=${encodeURIComponent(def.name)}&src=${encodeURIComponent(src)}`;
      const res = await fetch(url, { method: "PUT" });
      if (!res.ok) throw new Error(`go2rtc rejected stream ${def.name} (HTTP ${res.status})`);
    }
  }
}
