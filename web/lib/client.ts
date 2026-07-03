"use client";

/** URL where the BROWSER reaches go2rtc: env override or <page-host>:1984. */
export async function resolveGo2rtcUrl(): Promise<string> {
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    if (cfg.go2rtcUrl) return cfg.go2rtcUrl;
  } catch {
    // fall through to default
  }
  return `${location.protocol}//${location.hostname}:1984`;
}

/** Channel number encoded in a Hikvision RTSP path (/Streaming/Channels/101 -> 1). */
export function channelFromProducerUrl(url: string): number | null {
  const m = url.match(/\/Streaming\/Channels\/(\d+)/i);
  return m ? Math.floor(parseInt(m[1], 10) / 100) : null;
}
