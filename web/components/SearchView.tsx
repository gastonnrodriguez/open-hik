"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import StreamPlayer from "@/components/StreamPlayer";
import { resolveGo2rtcUrl } from "@/lib/client";

interface MotionEvent {
  channel: number;
  start: string;
  end: string | null;
  target: "human" | "vehicle" | "motion";
}

const PAGE_SIZE = 60;
const TARGET_LABEL: Record<MotionEvent["target"], string> = {
  human: "human",
  vehicle: "vehicle",
  motion: "motion",
};

/** datetime-local value ("2026-07-02T06:02") -> DVR time ("2026-07-02T06:02:00Z") */
function toDvrTime(local: string): string {
  return `${local}:00Z`;
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const from = new Date(now.getTime() - now.getTimezoneOffset() * 60000 - 24 * 3600000)
    .toISOString()
    .slice(0, 16);
  return { from, to };
}

function addSeconds(iso: string, secs: number): string {
  return new Date(Date.parse(iso) + secs * 1000).toISOString().slice(0, 19) + "Z";
}

/** Clip window around an event: a couple of seconds of context on each side. */
function clipRange(evt: MotionEvent): { start: string; end: string } {
  const start = addSeconds(evt.start, -3);
  const end = evt.end ? addSeconds(evt.end, 3) : addSeconds(evt.start, 10);
  // cap at 60s so a stuck motionStop can't produce huge clips
  if (Date.parse(end) - Date.parse(start) > 60000) {
    return { start, end: addSeconds(start, 60) };
  }
  return { start, end };
}

export default function SearchView() {
  const [channels, setChannels] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState<string>("all");
  const [target, setTarget] = useState<string>("all");
  const [{ from, to }, setRange] = useState(defaultRange());
  const [events, setEvents] = useState<MotionEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [base, setBase] = useState<string | null>(null);
  const [selected, setSelected] = useState<MotionEvent | null>(null);
  const [playbackStream, setPlaybackStream] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    resolveGo2rtcUrl().then(setBase);
    fetch("/api/channels")
      .then((r) => r.json())
      .then(setChannels)
      .catch(() => {});
  }, []);

  const search = useCallback(async () => {
    setSearching(true);
    setError(null);
    setEvents(null);
    setSelected(null);
    setVisible(PAGE_SIZE);
    try {
      const params = new URLSearchParams({ start: toDvrTime(from), end: toDvrTime(to) });
      if (channel !== "all") params.set("channel", channel);
      if (target !== "all") params.set("target", target);
      const res = await fetch(`/api/motion-events?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEvents(data.events);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }, [from, to, channel, target]);

  useEffect(() => {
    search();
    // initial search only; after that the user drives it with the button
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = async (evt: MotionEvent) => {
    setSelected(evt);
    setPlaybackStream(null);
    const range = clipRange(evt);
    try {
      const res = await fetch("/api/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: evt.channel, ...range }),
      });
      const data = await res.json();
      if (res.ok) setPlaybackStream(data.name);
    } catch {
      // player pane will keep showing "loading clip"
    }
  };

  const download = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      const range = clipRange(selected);
      const params = new URLSearchParams({ channel: String(selected.channel), ...range });
      const res = await fetch(`/api/clip?${params}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${channels[selected.channel] || `cam${selected.channel}`}-${selected.start.replace(/[:T]/g, "-").slice(0, 19)}.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("Clip download failed — the DVR may be out of bandwidth. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  const shown = (events || []).slice(0, visible);

  return (
    <>
      <Header />
      <div className="search">
        <div className="search-controls">
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="all">All cameras</option>
            {Object.entries(channels).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <input type="datetime-local" value={from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <span className="range-sep">→</span>
          <input type="datetime-local" value={to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="all">All motion</option>
            <option value="human">People only</option>
            <option value="vehicle">Vehicles only</option>
          </select>
          <button className="search-btn" onClick={search} disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </button>
          {events !== null && (
            <span className="search-count">
              {events.length} event{events.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {error && <p className="search-error">{error}</p>}

        <div className="event-grid">
          {shown.map((evt) => (
            <button
              key={`${evt.channel}-${evt.start}`}
              className={selected === evt ? "event-card selected" : "event-card"}
              onClick={() => open(evt)}
            >
              {/* thumbnails are extracted on demand; lazy loading keeps the DVR happy */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/thumb?channel=${evt.channel}&time=${encodeURIComponent(evt.start)}`}
                alt={`Motion on ${channels[evt.channel] || `CH ${evt.channel}`} at ${evt.start}`}
                loading="lazy"
                onError={(e) => {
                  // transient DVR bandwidth pushback: retry a couple of times
                  const img = e.currentTarget;
                  const tries = Number(img.dataset.retries || "0");
                  if (tries >= 2) return;
                  img.dataset.retries = String(tries + 1);
                  const base = img.src.split("&r=")[0];
                  setTimeout(() => {
                    img.src = `${base}&r=${tries + 1}`;
                  }, 8000 * (tries + 1));
                }}
              />
              <span className="event-info">
                <span className="event-time">{evt.start.slice(11, 19)}</span>
                <span className="event-cam">{channels[evt.channel] || `CH ${evt.channel}`}</span>
                <span className={`event-target ${evt.target}`}>{TARGET_LABEL[evt.target]}</span>
              </span>
              <span className="event-date">{evt.start.slice(0, 10)}</span>
            </button>
          ))}
        </div>

        {events !== null && visible < events.length && (
          <button className="load-more" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            Show more ({events.length - visible} left)
          </button>
        )}
        {events !== null && events.length === 0 && !error && (
          <p className="search-error">No motion events in this range.</p>
        )}
      </div>

      {selected && (
        <div className="event-modal" onClick={() => setSelected(null)}>
          <div className="event-modal-body" onClick={(e) => e.stopPropagation()}>
            <div className="event-player">
              {playbackStream && base ? (
                <StreamPlayer base={base} name={playbackStream} controls />
              ) : (
                <div className="player-hint">
                  <p>Loading clip…</p>
                </div>
              )}
            </div>
            <div className="event-modal-bar">
              <span className="event-modal-title">
                {channels[selected.channel] || `CH ${selected.channel}`} · {selected.start.replace("T", " ").slice(0, 19)}
                <span className={`event-target ${selected.target}`}> {TARGET_LABEL[selected.target]}</span>
              </span>
              <span className="event-modal-actions">
                <button onClick={download} disabled={downloading}>
                  {downloading ? "Preparing… (runs at playback speed)" : "Download MP4"}
                </button>
                <button onClick={() => setSelected(null)}>Close</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
