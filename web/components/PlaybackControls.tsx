"use client";

import { useEffect, useState } from "react";
import SpeakerIcon from "@/components/SpeakerIcon";
import { clockTime } from "@/components/Timeline";

interface Props {
  video: HTMLVideoElement | null;
  /** Playhead as seconds since midnight; null when nothing is loaded. */
  position: number | null;
  /** Re-anchors playback at a time of day (seconds since midnight). */
  onSeek: (seconds: number) => void;
  /** Jump to the previous / next motion event, when there is one. */
  onPrevEvent?: () => void;
  onNextEvent?: () => void;
  muted: boolean;
  /** 0..1 */
  volume: number;
  onSound: (muted: boolean, volume: number) => void;
  /** Saves an MP4 of the given length (seconds) starting at the playhead. */
  onDownload: (seconds: number) => void;
}

const CLIP_LENGTHS: [number, string][] = [
  [30, "30 s"],
  [60, "1 min"],
  [120, "2 min"],
  [300, "5 min"],
  [600, "10 min"],
  [1800, "30 min"],
];

const RATES = [0.25, 0.5, 1];

/**
 * Transport bar for DVR playback. The DVR delivers the recording at real time,
 * so speeds above 1x aren't sustainable — going faster is done by skipping
 * (the server re-anchors the RTSP session at a new start time).
 */
export default function PlaybackControls({
  video,
  position,
  onSeek,
  onPrevEvent,
  onNextEvent,
  muted,
  volume,
  onSound,
  onDownload,
}: Props) {
  const [clipLength, setClipLength] = useState(60);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    if (video) video.playbackRate = rate;
  }, [video, rate]);

  useEffect(() => {
    if (!video) return;
    const id = setInterval(() => setPlaying(!video.paused && !video.ended), 500);
    return () => clearInterval(id);
  }, [video]);

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

  const idle = position === null;
  const skip = (delta: number) => {
    if (position !== null) onSeek(Math.max(position + delta, 0));
  };

  return (
    <div className="pb-controls">
      <button onClick={toggle} disabled={!video} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"}>
        {playing && video ? "⏸" : "⏵"}
      </button>
      <button onClick={() => skip(-60)} disabled={idle} title="Back 1 minute">
        -1m
      </button>
      <button onClick={() => skip(-10)} disabled={idle} title="Back 10 seconds">
        -10s
      </button>
      <button onClick={() => skip(10)} disabled={idle} title="Forward 10 seconds">
        +10s
      </button>
      <button onClick={() => skip(60)} disabled={idle} title="Forward 1 minute">
        +1m
      </button>
      <span className="pb-sep" />
      <button onClick={onPrevEvent} disabled={!onPrevEvent} title="Previous motion event">
        ⏮ event
      </button>
      <button onClick={onNextEvent} disabled={!onNextEvent} title="Next motion event">
        event ⏭
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
      <span className="pb-sep" />
      <button
        className="pb-icon"
        onClick={() => onSound(!muted, muted && volume === 0 ? 1 : volume)}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={!muted}
        title={muted ? "Sound on" : "Sound off"}
      >
        <SpeakerIcon muted={muted} />
      </button>
      <input
        className="pb-volume"
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => {
          const v = Number(e.target.value);
          onSound(v === 0, v);
        }}
        aria-label="Volume"
        title="Volume"
      />
      <span className="pb-time">{position === null ? "--:--:--" : clockTime(position)}</span>
      <select
        value={clipLength}
        onChange={(e) => setClipLength(Number(e.target.value))}
        aria-label="Clip length"
        title="Clip length, starting at the playhead"
      >
        {CLIP_LENGTHS.map(([secs, label]) => (
          <option key={secs} value={secs}>
            {label}
          </option>
        ))}
      </select>
      <button onClick={() => onDownload(clipLength)} disabled={idle} title="Save an MP4 starting at the playhead">
        ↓ Clip
      </button>
    </div>
  );
}
