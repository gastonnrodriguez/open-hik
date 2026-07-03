import { dvrConfigured, isapiFetch, xmlText } from "@/lib/isapi";

/**
 * Single long-lived connection to the DVR's alertStream, shared by every
 * SSE subscriber. Starts on first subscriber, reconnects forever.
 */

export interface HikEvent {
  type: string; // VMD, videoloss, shelteralarm, fielddetection, linedetection...
  state: "active" | "inactive";
  channel: number | null;
  time: string; // as reported by the DVR
}

type Listener = (e: HikEvent) => void;

const listeners = new Set<Listener>();
let pumping = false;

function parseEvent(xml: string): HikEvent | null {
  const type = xmlText(xml, "eventType");
  if (!type) return null;
  const state = xmlText(xml, "eventState") === "active" ? "active" : "inactive";
  const ch = xmlText(xml, "channelID") || xmlText(xml, "dynChannelID");
  return {
    type,
    state,
    channel: ch ? parseInt(ch, 10) : null,
    time: xmlText(xml, "dateTime") || new Date().toISOString(),
  };
}

/** The DVR emits a "videoloss inactive" heartbeat every few seconds; drop it. */
function isHeartbeat(e: HikEvent): boolean {
  return e.type === "videoloss" && e.state === "inactive";
}

async function pump() {
  const CLOSE_TAG = "</EventNotificationAlert>";
  while (listeners.size > 0) {
    try {
      const res = await isapiFetch("/ISAPI/Event/notification/alertStream");
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let end;
        while ((end = buf.indexOf(CLOSE_TAG)) !== -1) {
          const chunk = buf.slice(0, end);
          buf = buf.slice(end + CLOSE_TAG.length);
          const evt = parseEvent(chunk);
          if (evt && !isHeartbeat(evt)) {
            for (const l of listeners) l(evt);
          }
        }
        if (buf.length > 262144) buf = buf.slice(-65536);
        if (listeners.size === 0) {
          reader.cancel().catch(() => {});
          break;
        }
      }
    } catch {
      // DVR unreachable or stream dropped — retry below
    }
    if (listeners.size > 0) await new Promise((r) => setTimeout(r, 5000));
  }
  pumping = false;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  if (!pumping && dvrConfigured()) {
    pumping = true;
    pump();
  }
  return () => listeners.delete(fn);
}
