"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TimelineTarget = "human" | "vehicle" | "motion";

export interface TimelineSpan {
  start: number;
  end: number;
}

export interface TimelineEvent extends TimelineSpan {
  target: TimelineTarget;
}

interface Props {
  /** Recorded spans, seconds since midnight. */
  recordings: TimelineSpan[];
  events: TimelineEvent[];
  /** DVR clock when the day shown is today; everything after it is the future. */
  now: number | null;
  /** Playhead, seconds since midnight. */
  position: number | null;
  hidden: ReadonlySet<TimelineTarget>;
  /** The motion log is still being read from the DVR. */
  eventsLoading?: boolean;
  onToggleTarget: (target: TimelineTarget) => void;
  onSeek: (seconds: number) => void;
}

const DAY = 86400;
const MIN_SPAN = 120;
const ZOOMS: { label: string; span: number }[] = [
  { label: "24h", span: DAY },
  { label: "6h", span: 6 * 3600 },
  { label: "1h", span: 3600 },
  { label: "10m", span: 600 },
];
const TARGETS: { id: TimelineTarget; label: string }[] = [
  { id: "human", label: "Person" },
  { id: "vehicle", label: "Vehicle" },
  { id: "motion", label: "Motion" },
];

export function clockTime(seconds: number, withSeconds = true): string {
  const s = Math.min(Math.max(Math.floor(seconds), 0), DAY - 1);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return withSeconds ? `${hh}:${mm}:${String(s % 60).padStart(2, "0")}` : `${hh}:${mm}`;
}

function tickStep(span: number): number {
  if (span > 12 * 3600) return 2 * 3600;
  if (span > 5 * 3600) return 3600;
  if (span > 2 * 3600) return 1800;
  if (span > 3600) return 900;
  if (span > 1200) return 300;
  if (span > 480) return 120;
  return 60;
}

function clampView(start: number, span: number): { start: number; end: number } {
  const size = Math.min(Math.max(span, MIN_SPAN), DAY);
  const s = Math.min(Math.max(start, 0), DAY - size);
  return { start: s, end: s + size };
}

/**
 * The day as one bar: recorded video underneath, motion events on top, coloured
 * by what the DVR detected. Click to play from that moment, drag to pan, wheel
 * (or the preset buttons) to zoom.
 */
export default function Timeline({
  recordings,
  events,
  now,
  position,
  hidden,
  eventsLoading = false,
  onToggleTarget,
  onSeek,
}: Props) {
  const [view, setView] = useState({ start: 0, end: DAY });
  const [hover, setHover] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const span = view.end - view.start;

  const secondsAt = useCallback((clientX: number): number => {
    const rect = trackRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return v.start + ratio * (v.end - v.start);
  }, []);

  // keep the playhead in sight while it advances
  useEffect(() => {
    if (position === null || drag.current) return;
    setView((v) => {
      const size = v.end - v.start;
      if (size >= DAY || (position >= v.start && position <= v.end)) return v;
      return clampView(position - size * 0.15, size);
    });
  }, [position]);

  // wheel zoom needs a non-passive listener to keep the page from scrolling
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const size = v.end - v.start;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setView(clampView(v.start + (e.deltaX / el.clientWidth) * size, size));
        return;
      }
      const at = secondsAt(e.clientX);
      const next = Math.min(Math.max(size * (e.deltaY > 0 ? 1.35 : 1 / 1.35), MIN_SPAN), DAY);
      setView(clampView(at - ((at - v.start) / size) * next, next));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [secondsAt]);

  const zoomTo = (size: number) => {
    const center = position ?? (view.start + view.end) / 2;
    setView(clampView(center - size / 2, size));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: view.start, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    setHover(secondsAt(e.clientX));
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 5) return;
    d.moved = true;
    const width = trackRef.current!.clientWidth;
    setView(clampView(d.start - (dx / width) * span, span));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) onSeek(Math.floor(secondsAt(e.clientX)));
  };

  const pct = (seconds: number) => ((seconds - view.start) / span) * 100;

  const segments = <T extends TimelineSpan>(items: T[]) =>
    items.filter((s) => s.end > view.start && s.start < view.end);

  const ticks = useMemo(() => {
    const step = tickStep(span);
    const out: number[] = [];
    for (let t = Math.ceil(view.start / step) * step; t <= view.end; t += step) out.push(t);
    return out;
  }, [view.start, view.end, span]);

  const counts = useMemo(() => {
    const c: Record<TimelineTarget, number> = { human: 0, vehicle: 0, motion: 0 };
    for (const e of events) c[e.target]++;
    return c;
  }, [events]);

  const activeZoom = ZOOMS.find((z) => Math.abs(z.span - span) < 1)?.span;

  return (
    <div className="tl">
      <div className="tl-bar">
        <div className="tl-legend">
          <span className="tl-key">
            <i className="tl-swatch rec" />
            Recorded
          </span>
          {TARGETS.filter((t) => counts[t.id] > 0).map((t) => (
            <button
              key={t.id}
              className={hidden.has(t.id) ? "tl-key off" : "tl-key"}
              onClick={() => onToggleTarget(t.id)}
              aria-pressed={!hidden.has(t.id)}
              title={hidden.has(t.id) ? `Show ${t.label.toLowerCase()} events` : `Hide ${t.label.toLowerCase()} events`}
            >
              <i className={`tl-swatch ${t.id}`} />
              {t.label} <span className="tl-count">{counts[t.id]}</span>
            </button>
          ))}
          {eventsLoading && <span className="tl-key tl-loading">Reading motion log…</span>}
        </div>
        <div className="tl-zoom" role="group" aria-label="Timeline zoom">
          {ZOOMS.map((z) => (
            <button
              key={z.label}
              className={activeZoom === z.span ? "active" : ""}
              onClick={() => zoomTo(z.span)}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="tl-track"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={() => setHover(null)}
      >
        <div className="tl-lane">
          {segments(recordings).map((s) => (
            <i
              key={`r${s.start}`}
              className="tl-seg rec"
              style={{ left: `${pct(s.start)}%`, width: `${pct(s.end) - pct(s.start)}%` }}
            />
          ))}
          {segments(events)
            .filter((e) => !hidden.has(e.target))
            .map((e) => (
              <i
                key={`e${e.start}-${e.target}`}
                className={`tl-seg evt ${e.target}`}
                style={{ left: `${pct(e.start)}%`, width: `${pct(e.end) - pct(e.start)}%` }}
              />
            ))}
          {now !== null && now < view.end && (
            <i className="tl-future" style={{ left: `${Math.max(pct(now), 0)}%` }} />
          )}
        </div>

        <div className="tl-ticks">
          {ticks.map((t) => (
            <span key={t} className="tl-tick" style={{ left: `${pct(t)}%` }}>
              <em>{t >= DAY ? "24:00" : clockTime(t, false)}</em>
            </span>
          ))}
        </div>

        {hover !== null && hover >= view.start && hover <= view.end && (
          <span className="tl-hover" style={{ left: `${pct(hover)}%` }}>
            <em>{clockTime(hover)}</em>
          </span>
        )}
        {position !== null && position >= view.start && position <= view.end && (
          <span className="tl-head" style={{ left: `${pct(position)}%` }} />
        )}
      </div>
    </div>
  );
}
