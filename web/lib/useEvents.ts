"use client";

import { useEffect, useState } from "react";

export interface UiEvent {
  type: string;
  state: "active" | "inactive";
  channel: number | null;
  time: string;
  received: number;
}

const LABELS: Record<string, string> = {
  VMD: "motion",
  shelteralarm: "tamper",
  videoloss: "video loss",
  fielddetection: "intrusion",
  linedetection: "line cross",
};

export function eventLabel(type: string): string {
  return LABELS[type] || type.toLowerCase();
}

/** Alert timeout when the DVR never sends the matching "inactive" event. */
const ALERT_TTL_MS = 15000;

/**
 * Subscribes to /api/events (SSE). Returns per-channel active alerts and the
 * most recent event for the header ticker.
 */
export function useEvents() {
  const [alerts, setAlerts] = useState<Record<number, { type: string; until: number }>>({});
  const [lastEvent, setLastEvent] = useState<UiEvent | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (msg) => {
      let e: UiEvent;
      try {
        e = { ...JSON.parse(msg.data), received: Date.now() };
      } catch {
        return;
      }
      setLastEvent(e);
      if (!e.channel) return;
      const ch = e.channel;
      if (e.state === "active") {
        setAlerts((prev) => ({ ...prev, [ch]: { type: e.type, until: Date.now() + ALERT_TTL_MS } }));
      } else {
        setAlerts((prev) => {
          if (!(ch in prev)) return prev;
          const next = { ...prev };
          delete next[ch];
          return next;
        });
      }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setAlerts((prev) => {
        const now = Date.now();
        const expired = Object.keys(prev).filter((k) => prev[Number(k)].until < now);
        if (expired.length === 0) return prev;
        const next = { ...prev };
        for (const k of expired) delete next[Number(k)];
        return next;
      });
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return { alerts, lastEvent };
}
