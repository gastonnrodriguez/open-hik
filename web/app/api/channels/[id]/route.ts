import { dvrConfigured, isapiFetch, xmlText } from "@/lib/isapi";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Renames a camera on the DVR itself: PUT { "name": "..." } */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const ch = parseInt(id, 10);
  if (!Number.isInteger(ch) || ch < 1 || ch > 64 || !dvrConfigured()) {
    return Response.json({ error: "Bad channel" }, { status: 400 });
  }
  let name: string;
  try {
    name = String((await req.json()).name ?? "").trim();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (name.length === 0 || name.length > 32) {
    return Response.json({ error: "Name must be 1-32 characters" }, { status: 400 });
  }

  try {
    const current = await isapiFetch(`/ISAPI/System/Video/inputs/channels/${ch}`);
    if (!current.ok) return Response.json({ error: `DVR HTTP ${current.status}` }, { status: 502 });
    const xml = await current.text();
    const updated = xml.replace(/<name>[^<]*<\/name>/, `<name>${escapeXml(name)}</name>`);

    const res = await isapiFetch(`/ISAPI/System/Video/inputs/channels/${ch}`, {
      method: "PUT",
      headers: { "Content-Type": "application/xml" },
      body: updated,
    });
    const resXml = await res.text();
    if (!res.ok || xmlText(resXml, "statusString") !== "OK") {
      return Response.json({ error: "DVR rejected the change" }, { status: 502 });
    }
    return Response.json({ ok: true, name });
  } catch {
    return Response.json({ error: "DVR unreachable" }, { status: 502 });
  }
}
