"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import PlaybackControls from "@/components/PlaybackControls";
import StreamPlayer from "@/components/StreamPlayer";
import { resolveGo2rtcUrl } from "@/lib/client";

interface Clip {
  start: string;
  end: string;
  sizeBytes: number | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function hhmmss(iso: string): string {
  return iso.slice(11, 19);
}

function duration(a: string, b: string): string {
  const mins = Math.round((Date.parse(b) - Date.parse(a)) / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function addSeconds(iso: string, secs: number): string {
  return new Date(Date.parse(iso) + secs * 1000).toISOString().slice(0, 19) + "Z";
}

export default function PlaybackView() {
  const [channels, setChannels] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState(1);
  const [date, setDate] = useState(todayISO());
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ stream: string; clip: Clip } | null>(null);
  const [mode, setMode] = useState("");
  const [anchor, setAnchor] = useState(0); // seconds into the clip where the stream starts
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    resolveGo2rtcUrl().then(setBase);
    fetch("/api/channels")
      .then((r) => r.json())
      .then(setChannels)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setClips(null);
    setError(null);
    setPlaying(null);
    const params = new URLSearchParams({
      channel: String(channel),
      start: `${date}T00:00:00Z`,
      end: `${nextDay(date)}T00:00:00Z`,
    });
    fetch(`/api/recordings?${params}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setClips(data.clips);
      })
      .catch((e: Error) => setError(e.message));
  }, [channel, date]);

  const anchorAt = useCallback(
    async (clip: Clip, seconds: number) => {
      const res = await fetch("/api/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          start: addSeconds(clip.start, Math.floor(seconds)),
          end: clip.end,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data.name as string;
    },
    [channel]
  );

  const play = async (clip: Clip) => {
    setPlaying(null);
    setMode("");
    setAnchor(0);
    try {
      const name = await anchorAt(clip, 0);
      setPlaying({ stream: name, clip });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const seek = async (seconds: number) => {
    if (!playing) return;
    try {
      await anchorAt(playing.clip, seconds);
      setAnchor(seconds); // key change remounts the player against the new anchor
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onMode = useCallback((m: string) => setMode(m), []);
  const onVideo = useCallback((v: HTMLVideoElement | null) => setVideo(v), []);

  const channelIds = Object.keys(channels).length > 0 ? Object.keys(channels) : ["1", "2", "3", "4"];

  return (
    <>
      <Header />
      <div className="playback">
        <aside className="clips-pane">
          <div className="clips-controls">
            <select value={channel} onChange={(e) => setChannel(Number(e.target.value))}>
              {channelIds.map((id) => (
                <option key={id} value={id}>
                  {channels[id] || `CH ${id}`}
                </option>
              ))}
            </select>
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </div>

          {error && <p className="clips-empty">Recording search failed: {error}</p>}
          {!error && clips === null && <p className="clips-empty">Searching recordings…</p>}
          {!error && clips !== null && clips.length === 0 && (
            <p className="clips-empty">No recordings on this day.</p>
          )}

          <ul className="clip-list">
            {(clips || []).map((clip) => (
              <li key={clip.start}>
                <button
                  className={playing?.clip.start === clip.start ? "clip selected" : "clip"}
                  onClick={() => play(clip)}
                >
                  <span className="clip-time">
                    {hhmmss(clip.start)} – {hhmmss(clip.end)}
                  </span>
                  <span className="clip-meta">
                    {duration(clip.start, clip.end)}
                    {clip.sizeBytes !== null && ` · ${(clip.sizeBytes / 1048576).toFixed(0)} MB`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="player-pane">
          {playing && base ? (
            <>
              <div className="player-video">
                <StreamPlayer
                  key={`${playing.stream}-${anchor}`}
                  base={base}
                  name={playing.stream}
                  onMode={onMode}
                  onVideo={onVideo}
                />
                <div className="osd">
                  <span className="ch">CH {String(channel).padStart(2, "0")}</span>
                  <span className="name">
                    {channels[channel] || `cam-${channel}`} · {date} {hhmmss(playing.clip.start)}
                  </span>
                  <span className="state">{mode || "loading"}</span>
                </div>
              </div>
              <PlaybackControls
                video={video}
                duration={(Date.parse(playing.clip.end) - Date.parse(playing.clip.start)) / 1000}
                base={anchor}
                onSeek={seek}
              />
            </>
          ) : (
            <div className="player-hint">
              <p>Pick a recording from the list to play it.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
