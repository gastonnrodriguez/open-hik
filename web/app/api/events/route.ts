import { subscribe, type HikEvent } from "@/lib/events";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Server-sent events: relays DVR alerts (motion, tamper, video loss) to the browser. */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  let unsub: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (e: HikEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // controller already closed
        }
      };
      unsub = subscribe(send);
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // ignore
        }
      }, 15000);
    },
    cancel() {
      unsub?.();
      if (ping) clearInterval(ping);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
