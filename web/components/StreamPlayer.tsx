"use client";

import { useEffect, useRef } from "react";

interface Props {
  base: string;
  name: string;
  controls?: boolean;
  /** Starts silent by default: browsers block autoplay with sound until the user interacts. */
  muted?: boolean;
  /** 0..1 */
  volume?: number;
  onMode?: (mode: string) => void;
  /** Exposes the inner <video> element for custom playback controls. */
  onVideo?: (video: HTMLVideoElement | null) => void;
}

/**
 * Mounts the go2rtc <video-stream> web component imperatively.
 * It negotiates WebRTC and falls back to MSE/HLS/MJPEG on its own.
 * `onMode` receives the component's state ("loading", "error", "RTC", "MSE"...).
 */
export default function StreamPlayer({
  base,
  name,
  controls = false,
  muted = true,
  volume = 1,
  onMode,
  onVideo,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // read through a ref so a mute toggle doesn't tear the stream down
  const soundRef = useRef({ muted, volume });
  soundRef.current = { muted, volume };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    // a blocked autoplay leaves the element paused; the unmute click is the gesture it needed
    if (!muted && video.paused) video.play().catch(() => {});
  }, [muted, volume]);

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
        RECONNECT_TIMEOUT: number;
      };
      player.mode = "webrtc,mse,hls,mjpeg";
      // default is 15s; recover quickly when a playback session is re-anchored
      player.RECONNECT_TIMEOUT = 3000;
      player.background = true;
      player.src = new URL(`api/ws?src=${encodeURIComponent(name)}`, base).toString();
      host.appendChild(el);

      if (player.video) {
        player.video.controls = controls;
        player.video.volume = soundRef.current.volume;
        player.video.muted = soundRef.current.muted;
        videoRef.current = player.video;
        // The component mutes the element whenever a play() promise rejects,
        // which also happens when WebRTC takes over from MSE mid-start. If the
        // user asked for sound, put it back (bounded, in case autoplay really is blocked).
        const video = player.video;
        let restores = 0;
        video.addEventListener("volumechange", () => {
          if (!video.muted || soundRef.current.muted || restores >= 5) return;
          restores++;
          video.muted = false;
          if (video.paused) video.play().catch(() => {});
        });
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
      if (el) {
        // `background = true` makes the component skip its own teardown when it
        // leaves the DOM, so close the WebSocket/WebRTC session by hand. Without
        // this every unmounted player keeps a go2rtc consumer — and a DVR RTSP
        // session — alive until the page reloads, and the DVR soon answers
        // "453 Not Enough Bandwidth" to new playback requests.
        const player = el as HTMLElement & {
          reconnectTID?: number;
          ws?: WebSocket | null;
          wsState?: number;
          pc?: RTCPeerConnection | null;
          pcState?: number;
          video?: HTMLVideoElement;
        };
        if (player.reconnectTID) {
          clearTimeout(player.reconnectTID);
          player.reconnectTID = 0;
        }
        // mark both transports closed first so the component doesn't reconnect
        player.wsState = WebSocket.CLOSED;
        player.pcState = WebSocket.CLOSED;
        player.ws?.close();
        player.ws = null;
        if (player.pc) {
          player.pc.getSenders().forEach((sender) => sender.track?.stop());
          player.pc.close();
          player.pc = null;
        }
        if (player.video) {
          const video = player.video;
          video.pause();
          if (video.srcObject) {
            // drop the stale MSE blob URL first, or the element falls back to it and errors
            video.removeAttribute("src");
            video.srcObject = null;
          } else if (!video.src.startsWith("blob:")) {
            // HLS/MJPEG. A live MSE source (blob:) is left attached: detaching
            // it makes the component's pending buffer callbacks throw.
            video.removeAttribute("src");
            video.load();
          }
        }
        el.remove();
      }
      videoRef.current = null;
      onVideo?.(null);
    };
  }, [name, base, controls, onMode, onVideo]);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />;
}
