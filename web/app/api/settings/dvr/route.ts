import { requireAuth } from "@/lib/auth";
import { getDvr, saveConfig, type DvrConfig } from "@/lib/config";
import { probeDvr, syncGo2rtcStreams } from "@/lib/go2rtcSync";

export const dynamic = "force-dynamic";

/**
 * Updates the DVR connection (host, ports, credentials) after the wizard.
 * An empty password means "keep the current one". Probes before saving and
 * re-syncs the go2rtc streams on success.
 */
export async function PUT(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  let body: Partial<DvrConfig>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  const host = String(body.host ?? "").trim();
  const user = String(body.user ?? "").trim();
  const pass = String(body.pass ?? "");
  const httpPort = Number(body.httpPort) || 80;
  const rtspPort = Number(body.rtspPort) || 554;
  if (!host || !user) {
    return Response.json({ error: "Host and user are required" }, { status: 400 });
  }
  if (httpPort < 1 || httpPort > 65535 || rtspPort < 1 || rtspPort > 65535) {
    return Response.json({ error: "Ports must be between 1 and 65535" }, { status: 400 });
  }

  const effectivePass = pass || getDvr()?.pass || "";
  if (!effectivePass) {
    return Response.json({ error: "Password is required" }, { status: 400 });
  }
  const dvr: DvrConfig = { host, user, pass: effectivePass, httpPort, rtspPort };

  let probe;
  try {
    probe = await probeDvr(dvr);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }

  try {
    await syncGo2rtcStreams(dvr, probe.channels.map((c) => c.id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }

  saveConfig({ dvr });
  return Response.json({ ok: true, model: probe.model, channels: probe.channels });
}
