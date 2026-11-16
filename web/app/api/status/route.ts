import { dvrConfigured } from "@/lib/isapi";
import { dvrStatus } from "@/lib/dvrStatus";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** DVR health: device, load, disks and recording retention. GET /api/status */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!dvrConfigured()) return Response.json({ error: "DVR not configured" }, { status: 503 });
  try {
    return Response.json(await dvrStatus());
  } catch {
    return Response.json({ error: "DVR unreachable" }, { status: 502 });
  }
}
