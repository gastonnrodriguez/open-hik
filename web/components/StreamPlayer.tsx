"use client";

import { useEffect, useRef } from "react";

interface Props {
  base: string;
  name: string;
  controls?: boolean;
  onMode?: (mode: string) => void;
  /** Exposes the inner <video> element for custom playback controls. */
  onVideo?: (video: HTMLVideoElement | null) => void;
}

/**
 * Mounts the go2rtc <video-stream> web component imperatively.
 * It negotiates WebRTC and falls back to MSE/HLS/MJPEG on its own.
 * `onMode` receives the component's state ("loading", "error", "RTC", "MSE"...).
 */
export default function StreamPlayer({ base, name, controls = false, onMode, onVideo }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let el: HTMLElement | null = null;
    let observer: MutationObserver | null = null;
    let cancelled = false;

    customElements.whenDefined("video-stream").then(() => {
      if (cancelled) return;

      el = document.createElement("video-stream");
      const player = el as HTMLElement & {
        mode: string;
        background: boolean;
        src: string;
        video?: HTMLVideoElement;
      };
      player.mode = "webrtc,mse,hls,mjpeg";
      player.background = true;
      player.src = new URL(`api/ws?src=${encodeURIComponent(name)}`, base).toString();
      host.appendChild(el);

      if (player.video) {
        player.video.controls = controls;
        player.video.muted = true;
        onVideo?.(player.video);
      }

      const modeDiv = el.querySelector(".mode");
      if (modeDiv && onMode) {
        observer = new MutationObserver(() => onMode(modeDiv.textContent || ""));
        observer.observe(modeDiv, { childList: true, characterData: true, subtree: true });
      }
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      el?.remove();
      onVideo?.(null);
    };
  }, [name, base, controls, onMode, onVideo]);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />;
}
