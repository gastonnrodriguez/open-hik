"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DayPicker from "@/components/DayPicker";
import Header from "@/components/Header";
import PlaybackControls from "@/components/PlaybackControls";
import StreamPlayer from "@/components/StreamPlayer";
import Timeline, {
  clockTime,
  type TimelineEvent,
  type TimelineSpan,
  type TimelineTarget,
} from "@/components/Timeline";
import { resolveGo2rtcUrl } from "@/lib/client";

interface Day {
  date: string;
  now: number | null;
  recordings: TimelineSpan[];
  events: TimelineEvent[];
}

const DAY = 86400;
/** Seconds of lead-in when jumping to a motion event, so it isn't already underway. */
const EVENT_PREROLL = 3;

/** Today in the browser's zone, which is assumed to be the DVR's. */
function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Seconds since midnight -> the DVR's timestamp format (local time, Z suffix). */
function stamp(date: string, seconds: number): string {
  if (seconds >= DAY) return `${shiftDay(date, 1)}T00:00:00Z`;
  return `${date}T${clockTime(seconds)}Z`;
}

function parseClock(value: string): number | null {
  const m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
  return secs < DAY ? secs : null;
}

export default function PlaybackView() {
  const [channels, setChannels] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState(1);
  const [date, setDate] = useState(todayISO());
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [base, setBase] = useState<string | null>(null);
  /** `anchor`: time of day where the current RTSP session starts. */
  const [playing, setPlaying] = useState<{ stream: string; anchor: number; token: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("");
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [timeInput, setTimeInput] = useState("");
  const [eventsLoading, setEventsLoading] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<TimelineTarget>>(new Set());
  // every seek mounts a fresh <video>, so the sound setting lives up here
  const [sound, setSound] = useState({ muted: true, volume: 1 });

  const requestRef = useRef(0);
  /** Time of day to resume at once the next day/channel finishes loading. */
  const resumeRef = useRef<number | null>(null);
  const positionRef = useRef<number | null>(null);
  positionRef.current = position;

  useEffect(() => {
    resolveGo2rtcUrl().then(setBase);
    fetch("/api/channels")
      .then((r) => r.json())
      .then(setChannels)
      .catch(() => {});
  }, []);

  const loadDay = useCallback(async (ch: number, d: string, withEvents: boolean): Promise<Day> => {
    const res = await fetch(`/api/timeline?channel=${ch}&date=${d}${withEvents ? "" : "&events=0"}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return { ...data, events: data.events ?? [] } as Day;
  }, []);

  const playAt = useCallback(
    async (seconds: number, source?: Day) => {
      const d = source ?? day;
      if (!d) return;
      const wanted = Math.min(Math.max(Math.floor(seconds), 0), DAY - 1);
      // inside a recorded span, or else the start of the next one
      const span =
        d.recordings.find((r) => wanted >= r.start && wanted < r.end - 2) ??
        d.recordings.find((r) => r.start > wanted);
      if (!span) {
        setNotice(`No recording at or after ${clockTime(wanted)}.`);
        return;
      }
      const start = Math.max(wanted, span.start);
      const request = ++requestRef.current;

      // Unmount the player first so its go2rtc consumer is gone before the
      // server replaces the stream; otherwise the old RTSP session is orphaned
      // and holds the DVR's playback slot for this channel.
      setPlaying(null);
      setMode("");
      setNotice(start > wanted + 1 ? `Nothing recorded at ${clockTime(wanted)} — jumped to ${clockTime(start)}.` : null);
      setPosition(start);
      setLoading(true);
      try {
        const res = await fetch("/api/playback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, start: stamp(d.date, start), end: stamp(d.date, span.end) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (request !== requestRef.current) return;
        setPlaying({ stream: data.name as string, anchor: start, token: request });
      } catch (e) {
        if (request === requestRef.current) setNotice(`Playback failed: ${(e as Error).message}`);
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [channel, day]
  );

  // (re)load the timeline when the camera or the day changes
  useEffect(() => {
    let cancelled = false;
    requestRef.current++;
    setDay(null);
    setError(null);
    setNotice(null);
    setPlaying(null);
    setLoading(false);
    setEventsLoading(true);
    // recordings come back at once; the motion log can take a while on a busy day
    loadDay(channel, date, false)
      .then((d) => {
        if (cancelled) return;
        setDay((cur) => (cur && cur.date === d.date ? cur : d));
        const resume = resumeRef.current;
        resumeRef.current = null;
        if (resume !== null) void playAt(resume, d);
        else setPosition(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    loadDay(channel, date, true)
      .then((d) => !cancelled && setDay(d))
      .catch(() => {})
      .finally(() => !cancelled && setEventsLoading(false));
    return () => {
      cancelled = true;
    };
    // playAt is deliberately left out: it changes with `day`, which this effect sets
  }, [channel, date, loadDay]);

  // today keeps growing: refresh its recordings and events quietly
  useEffect(() => {
    if (!day || day.now === null) return;
    const id = setInterval(() => {
      loadDay(channel, date, true)
        .then((d) => setDay((cur) => (cur && cur.date === d.date ? d : cur)))
        .catch(() => {});
    }, 60000);
    return () => clearInterval(id);
  }, [day, channel, date, loadDay]);

  // playhead = where the session was anchored + how much of it has played
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setPosition(Math.min(playing.anchor + (video?.currentTime || 0), DAY));
    }, 500);
    return () => clearInterval(id);
  }, [playing, video]);

  const changeChannel = (next: number) => {
    // stay on the same moment when hopping between cameras
    resumeRef.current = playing || loading ? positionRef.current : null;
    setChannel(next);
  };

  const changeDate = (next: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || next > todayISO()) return;
    resumeRef.current = null;
    setDate(next);
  };

  const goToTime = () => {
    const secs = parseClock(timeInput);
    if (secs === null) return;
    void playAt(secs);
  };

  const downloadClip = (length: number) => {
    if (!day || position === null) return;
    const start = Math.floor(position);
    // never ask past what exists: end of day, or "now" when the day is today
    const end = Math.min(start + length, day.now ?? DAY, DAY);
    if (end - start < 1) return;
    const params = new URLSearchParams({
      channel: String(channel),
      start: stamp(day.date, start),
      end: stamp(day.date, end),
      name: channels[channel] || "",
    });
    // a plain link, so the browser streams the file to disk instead of holding it in memory
    const a = document.createElement("a");
    a.href = `/api/clip?${params}`;
    a.download = "";
    a.click();
    const wait = Math.ceil((end - start) / 25) + 3;
    setNotice(`Preparing clip ${clockTime(start)}–${clockTime(end)}; the download starts in about ${wait} s.`);
  };

  const toggleTarget = useCallback((target: TimelineTarget) => {
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      return next;
    });
  }, []);

  const visibleEvents = useMemo(
    () => (day ? day.events.filter((e) => !hidden.has(e.target)) : []),
    [day, hidden]
  );

  const ref = position ?? 0;
  const prevEvent = [...visibleEvents].reverse().find((e) => e.start < ref - EVENT_PREROLL - 2);
  const nextEvent = visibleEvents.find((e) => e.start > ref + 1);
  const jumpTo = (evt: TimelineEvent) => void playAt(Math.max(evt.start - EVENT_PREROLL, 0));

  const onMode = useCallback((m: string) => setMode(m), []);
  const onVideo = useCallback((v: HTMLVideoElement | null) => setVideo(v), []);

  const channelIds = Object.keys(channels).length > 0 ? Object.keys(channels) : ["1", "2", "3", "4"];
  const today = todayISO();

  return (
    <>
      <Header />
      <div className="playback">
        <div className="pb-toolbar">
          <select value={channel} onChange={(e) => changeChannel(Number(e.target.value))} aria-label="Camera">
            {channelIds.map((id) => (
              <option key={id} value={id}>
                {channels[id] || `CH ${id}`}
              </option>
            ))}
          </select>
          <div className="pb-date">
            <button onClick={() => changeDate(shiftDay(date, -1))} aria-label="Previous day" title="Previous day">
              ‹
            </button>
            <DayPicker value={date} max={today} channel={channel} onChange={changeDate} />
            <button
              onClick={() => changeDate(shiftDay(date, 1))}
              disabled={date >= today}
              aria-label="Next day"
              title="Next day"
            >
              ›
            </button>
          </div>
          <form
            className="pb-goto"
            onSubmit={(e) => {
              e.preventDefault();
              goToTime();
            }}
          >
            <input
              type="time"
              step={1}
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              aria-label="Time of day"
            />
            <button type="submit" disabled={!day || parseClock(timeInput) === null}>
              Go
            </button>
          </form>
          {notice && <span className="pb-notice">{notice}</span>}
        </div>

        <div className="player-pane">
          {playing && base ? (
            <div className="player-video">
              <StreamPlayer
                key={`${playing.stream}-${playing.token}`}
                base={base}
                name={playing.stream}
                muted={sound.muted}
                volume={sound.volume}
                onMode={onMode}
                onVideo={onVideo}
              />
              <div className="osd">
                <span className="ch">CH {String(channel).padStart(2, "0")}</span>
                <span className="name">
                  {channels[channel] || `cam-${channel}`} · {date} {clockTime(position ?? playing.anchor)}
                </span>
                <span className="state">{mode || "loading"}</span>
              </div>
            </div>
          ) : (
            <div className="player-hint">
              <p>
                {error
                  ? `Could not load recordings: ${error}`
                  : loading
                    ? "Loading…"
                    : !day
                      ? "Reading the DVR…"
                      : day.recordings.length === 0
                        ? "No recordings on this day."
                        : "Click the timeline or enter a time to start playing."}
              </p>
            </div>
          )}
        </div>

        <PlaybackControls
          video={playing ? video : null}
          position={playing || loading ? position : null}
          onSeek={(s) => void playAt(s)}
          onPrevEvent={prevEvent ? () => jumpTo(prevEvent) : undefined}
          onNextEvent={nextEvent ? () => jumpTo(nextEvent) : undefined}
          muted={sound.muted}
          volume={sound.volume}
          onSound={(muted, volume) => setSound({ muted, volume })}
          onDownload={downloadClip}
        />

        <Timeline
          recordings={day?.recordings ?? []}
          events={day?.events ?? []}
          now={day?.now ?? null}
          position={playing || loading ? position : null}
          hidden={hidden}
          eventsLoading={eventsLoading}
          onToggleTarget={toggleTarget}
          onSeek={(s) => void playAt(s)}
        />
      </div>
    </>
  );
}
