import { dvrConfigured, isapiFetch } from "@/lib/isapi";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Live JPEG snapshot of a channel, straight from the DVR. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ channel: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { channel } = await params;
  const ch = parseInt(channel, 10);
  if (!Number.isInteger(ch) || ch < 1 || ch > 64 || !dvrConfigured()) {
    return new Response("Bad channel", { status: 400 });
  }
  try {
    const res = await isapiFetch(`/ISAPI/Streaming/channels/${ch}01/picture`);
    if (!res.ok) return new Response("DVR error", { status: 502 });
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("DVR unreachable", { status: 502 });
  }
}
