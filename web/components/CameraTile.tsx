"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StreamPlayer from "@/components/StreamPlayer";
import { eventLabel } from "@/lib/useEvents";

interface Props {
  streamName: string;
  hdStream: string | null; // main-stream variant, used in fullscreen
  displayName: string;
  channel: number | null;
  index: number;
  base: string;
  alert: string | null; // active event type, e.g. "VMD"
  onLiveChange: (name: string, live: boolean) => void;
  onRename?: (channel: number, name: string) => Promise<boolean>;
  // Drag-and-drop reordering of the live wall
  isDropTarget?: boolean;
  isDragging?: boolean;
  onReorderStart?: () => void;
  onReorderOver?: () => void;
  onReorderDrop?: () => void;
  onReorderEnd?: () => void;
}

export default function CameraTile({
  streamName,
  hdStream,
  displayName,
  channel,
  index,
  base,
  alert,
  onLiveChange,
  onRename,
  isDropTarget,
  isDragging,
  onReorderStart,
  onReorderOver,
  onReorderDrop,
  onReorderEnd,
}: Props) {
  const tileRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState("loading");
  const [fullscreen, setFullscreen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(displayName);
    setEditing(true);
  };

  const commitEdit = async () => {
    const name = draft.trim();
    setEditing(false);
    if (!onRename || channel === null || name === "" || name === displayName) return;
    setSaving(true);
    await onRename(channel, name);
    setSaving(false);
  };

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === tileRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const live = mode !== "" && mode !== "loading" && mode !== "error";

  useEffect(() => {
    onLiveChange(streamName, live);
  }, [streamName, live, onLiveChange]);

  const onMode = useCallback((m: string) => setMode(m), []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      tileRef.current?.requestFullscreen();
    }
  };

  const takeSnapshot = async () => {
    if (channel === null) return;
    try {
      const res = await fetch(`/api/snapshot/${channel}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = URL.createObjectURL(blob);
      a.download = `${displayName}-${stamp}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // DVR unreachable; nothing to save
    }
  };

  return (
    <div
      className={`tile${alert ? " alert" : ""}${isDropTarget ? " drop-target" : ""}${isDragging ? " dragging" : ""}`}
      ref={tileRef}
      onDoubleClick={toggleFullscreen}
      onDragOver={(e) => {
        if (!onReorderOver) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onReorderOver();
      }}
      onDrop={(e) => {
        if (!onReorderDrop) return;
        e.preventDefault();
        onReorderDrop();
      }}
    >
      <StreamPlayer base={base} name={fullscreen && hdStream ? hdStream : streamName} onMode={onMode} />
      <div className="tile-actions">
        {onReorderStart && (
          <button
            className="tile-btn drag-handle"
            aria-label={`Reorder ${displayName}`}
            title="Drag to reorder"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              // drag a ghost of the whole tile, not just the little handle
              if (tileRef.current) e.dataTransfer.setDragImage(tileRef.current, 20, 20);
              onReorderStart();
            }}
            onDragEnd={() => onReorderEnd?.()}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <g fill="currentColor">
                <circle cx="5" cy="3" r="1.4" />
                <circle cx="11" cy="3" r="1.4" />
                <circle cx="5" cy="8" r="1.4" />
                <circle cx="11" cy="8" r="1.4" />
                <circle cx="5" cy="13" r="1.4" />
                <circle cx="11" cy="13" r="1.4" />
              </g>
            </svg>
          </button>
        )}
        {channel !== null && (
          <button
            className="tile-btn"
            onClick={takeSnapshot}
            aria-label={`Save snapshot of ${displayName}`}
            title="Save snapshot"
          >
            ⭳
          </button>
        )}
        <button
          className="tile-btn"
          onClick={toggleFullscreen}
          aria-label={`Fullscreen ${displayName}`}
          title="Fullscreen"
        >
          ⛶
        </button>
      </div>
      <div className="osd">
        <span className="ch">CH {String(channel ?? index + 1).padStart(2, "0")}</span>
        {editing ? (
          <input
            className="name-input"
            value={draft}
            maxLength={32}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span className="name">{saving ? "saving…" : displayName}</span>
        )}
        {onRename && channel !== null && !editing && (
          <button className="edit-btn" onClick={startEdit} aria-label={`Rename ${displayName}`} title="Rename (saved to the DVR)">
            ✎
          </button>
        )}
        <span className="state">
          {alert ? (
            <>
              <span className="dot event" />
              <span className="event-label">{eventLabel(alert)}</span>
            </>
          ) : (
            <>
              <span className={live ? "dot live" : "dot"} />
              {live ? `live · ${mode}` : mode || "connecting"}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
