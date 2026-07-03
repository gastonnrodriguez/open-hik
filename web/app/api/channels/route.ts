import { dvrConfigured, isapiFetch, xmlBlocks, xmlText } from "@/lib/isapi";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Camera names as configured on the DVR, keyed by channel number.
 * Returns {} when the DVR is unreachable or credentials are missing,
 * so the UI can fall back to stream names.
 */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!dvrConfigured()) return Response.json({});
  try {
    const res = await isapiFetch("/ISAPI/System/Video/inputs/channels");
    if (!res.ok) return Response.json({});
    const xml = await res.text();
    const names: Record<string, string> = {};
    for (const block of xmlBlocks(xml, "VideoInputChannel")) {
      const id = xmlText(block, "id");
      const name = xmlText(block, "name");
      if (id && name) names[id] = name;
    }
    return Response.json(names);
  } catch {
    return Response.json({});
  }
}
