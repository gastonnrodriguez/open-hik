"use client";

import { useCallback, useEffect, useState } from "react";
import CameraTile from "@/components/CameraTile";
import Header from "@/components/Header";
import { channelFromProducerUrl, resolveGo2rtcUrl } from "@/lib/client";
import { eventLabel, useEvents } from "@/lib/useEvents";

interface Camera {
  streamName: string;
  channel: number | null;
  displayName: string;
  hdStream: string | null;
}

type Status =
  | { kind: "loading" }
  | { kind: "error"; url: string }
  | { kind: "ready"; base: string; cameras: Camera[] };

interface Go2rtcStream {
  producers?: { url?: string }[] | null;
}

export default function VideoWall() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [liveMap, setLiveMap] = useState<Record<string, boolean>>({});
  const { alerts, lastEvent } = useEvents();

  const load = useCallback(async () => {
    setStatus({ kind: "loading" });
    const base = await resolveGo2rtcUrl();
    try {
      const [streamsRes, namesRes] = await Promise.all([
        fetch(new URL("/api/streams", base)),
        fetch("/api/channels"),
      ]);
      if (!streamsRes.ok) throw new Error(`HTTP ${streamsRes.status}`);
      const streams: Record<string, Go2rtcStream> = await streamsRes.json();
      const names: Record<string, string> = namesRes.ok ? await namesRes.json() : {};

      const cameras: Camera[] = Object.keys(streams)
        .filter((name) => !name.startsWith("playback-") && !name.endsWith("-hd"))
        .sort()
        .map((streamName) => {
          const producer = streams[streamName].producers?.find((p) => p.url)?.url || "";
          const channel = channelFromProducerUrl(producer);
          return {
            streamName,
            channel,
            displayName: (channel !== null && names[channel]) || streamName,
            hdStream: `${streamName}-hd` in streams ? `${streamName}-hd` : null,
          };
        });
      setStatus({ kind: "ready", base, cameras });
    } catch {
      setStatus({ kind: "error", url: base });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onLiveChange = useCallback((name: string, live: boolean) => {
    setLiveMap((prev) => (prev[name] === live ? prev : { ...prev, [name]: live }));
  }, []);

  const onRename = useCallback(async (channel: number, name: string) => {
    try {
      const res = await fetch(`/api/channels/${channel}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return false;
      setStatus((prev) =>
        prev.kind === "ready"
          ? {
              ...prev,
              cameras: prev.cameras.map((c) => (c.channel === channel ? { ...c, displayName: name } : c)),
            }
          : prev
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const cameras = status.kind === "ready" ? status.cameras : [];
  const liveCount = cameras.filter((c) => liveMap[c.streamName]).length;
  const columns = Math.ceil(Math.sqrt(cameras.length || 1));

  const ticker = lastEvent && (
    <span className="ticker" key={lastEvent.received}>
      {eventLabel(lastEvent.type)}
      {lastEvent.channel !== null &&
        ` · ${cameras.find((c) => c.channel === lastEvent.channel)?.displayName ?? `CH ${lastEvent.channel}`}`}
      {` · ${lastEvent.time.slice(11, 19)}`}
    </span>
  );

  return (
    <>
      <Header
        right={
          <>
            {ticker}
            {status.kind === "ready" && (
              <span className="online-count">
                <b>{liveCount}</b>/{cameras.length} live
              </span>
            )}
          </>
        }
      />

      {status.kind === "loading" && (
        <div className="notice">
          <div className="notice-card">
            <h2>Connecting…</h2>
            <p>Looking for go2rtc and your configured cameras.</p>
          </div>
        </div>
      )}

      {status.kind === "error" && (
        <div className="notice">
          <div className="notice-card">
            <h2>Can&apos;t reach go2rtc</h2>
            <p>
              Tried <code>{status.url}</code> from this browser and got no answer.
            </p>
            <p>
              Check that the go2rtc container is running (<code>docker compose ps</code>) and
              that port 1984 is reachable from this machine. If go2rtc lives on a different
              host or behind a proxy, set <code>GO2RTC_PUBLIC_URL</code> in your{" "}
              <code>.env</code> and restart.
            </p>
            <p>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  load();
                }}
                style={{ color: "var(--amber)" }}
              >
                Retry
              </a>
            </p>
          </div>
        </div>
      )}

      {status.kind === "ready" && cameras.length === 0 && (
        <div className="notice">
          <div className="notice-card">
            <h2>No cameras configured</h2>
            <p>
              go2rtc is up but has no streams. Add your cameras to{" "}
              <code>go2rtc/go2rtc.yaml</code> and restart:{" "}
              <code>docker compose restart go2rtc</code>.
            </p>
          </div>
        </div>
      )}

      {status.kind === "ready" && cameras.length > 0 && (
        <main className="wall" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {cameras.map((cam, i) => (
            <CameraTile
              key={cam.streamName}
              streamName={cam.streamName}
              hdStream={cam.hdStream}
              displayName={cam.displayName}
              channel={cam.channel}
              index={i}
              base={status.base}
              alert={cam.channel !== null ? (alerts[cam.channel]?.type ?? null) : null}
              onLiveChange={onLiveChange}
              onRename={onRename}
            />
          ))}
        </main>
      )}
    </>
  );
}
