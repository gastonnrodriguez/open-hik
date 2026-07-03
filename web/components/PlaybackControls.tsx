"use client";

import { useEffect, useState } from "react";

interface Props {
  video: HTMLVideoElement | null;
  /** Total clip length in seconds. */
  duration: number;
  /** Seconds into the clip where the current stream anchor starts. */
  base: number;
  /** Re-anchors playback at an absolute clip offset (seconds). */
  onSeek: (seconds: number) => void;
}

const RATES = [0.25, 0.5, 1];

function fmt(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Custom transport bar for DVR playback. The DVR delivers the recording at
 * real time, so speeds above 1x aren't sustainable — going faster is done by
 * skipping (server re-anchors the RTSP session at a new start time).
 */
export default function PlaybackControls({ video, duration, base, onSeek }: Props) {
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1);
  const [elapsed, setElapsed] = useState(base);
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    if (video) video.playbackRate = rate;
  }, [video, rate]);

  useEffect(() => {
    setElapsed(base);
    if (!video) return;
    const id = setInterval(() => {
      setElapsed(base + video.currentTime);
      setPlaying(!video.paused && !video.ended);
    }, 500);
    return () => clearInterval(id);
  }, [video, base]);

  const toggle = () => {
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const skip = (delta: number) => {
    onSeek(Math.min(Math.max(elapsed + delta, 0), Math.max(duration - 2, 0)));
  };

  const commitScrub = () => {
    if (scrub === null) return;
    onSeek(Math.min(Math.max(scrub, 0), Math.max(duration - 2, 0)));
    setScrub(null);
  };

  const shown = scrub ?? elapsed;

  return (
    <div className="pb-controls">
      <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"}>
        {playing ? "⏸" : "⏵"}
      </button>
      <button onClick={() => skip(-10)} title="Back 10s">
        -10s
      </button>
      <button onClick={() => skip(10)} title="Forward 10s">
        +10s
      </button>
      <button onClick={() => skip(60)} title="Forward 1 minute">
        +1m
      </button>
      <select
        value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
        aria-label="Playback speed"
        title="Playback speed (the DVR streams at real time, so 1x is the max)"
      >
        {RATES.map((r) => (
          <option key={r} value={r}>
            {r}x
          </option>
        ))}
      </select>
      <span className="pb-time">{fmt(shown)}</span>
      <input
        className="pb-range"
        type="range"
        min={0}
        max={Math.max(duration, 1)}
        step={1}
        value={Math.min(shown, duration)}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={commitScrub}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") commitScrub();
        }}
        aria-label="Playback position"
      />
      <span className="pb-time">{fmt(duration)}</span>
    </div>
  );
}
