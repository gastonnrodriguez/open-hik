import { requireAuth } from "@/lib/auth";
import { getDvr } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Current DVR connection settings, without the password. */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const dvr = getDvr();
  return Response.json({
    dvr: dvr
      ? { host: dvr.host, user: dvr.user, httpPort: dvr.httpPort || 80, rtspPort: dvr.rtspPort || 554 }
      : null,
  });
}
