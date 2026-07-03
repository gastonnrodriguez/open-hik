import { createSessionToken, hashPassword, needsSetup, sessionCookieHeader } from "@/lib/auth";
import { saveConfig, type DvrConfig } from "@/lib/config";
import { probeDvr, syncGo2rtcStreams } from "@/lib/go2rtcSync";

export const dynamic = "force-dynamic";

/** GET: wizard state. Public — reveals nothing sensitive. */
export async function GET() {
  return Response.json({
    needsSetup: needsSetup(),
    // prefill hints when a .env-based install predates the wizard
    envDvr: process.env.DVR_HOST
      ? { host: process.env.DVR_HOST, user: decodeURIComponent(process.env.DVR_USER || "") }
      : null,
  });
}

/**
 * POST: completes first-run setup. Only works while no admin password exists.
 * { adminPassword, dvr: { host, user, pass } }
 */
export async function POST(req: Request) {
  if (!needsSetup()) {
    return Response.json({ error: "Already configured" }, { status: 409 });
  }

  let body: { adminPassword?: string; dvr?: DvrConfig };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  const adminPassword = String(body.adminPassword ?? "");
  const dvr = body.dvr;
  if (adminPassword.length < 8) {
    return Response.json({ error: "Admin password must be at least 8 characters" }, { status: 400 });
  }
  if (!dvr?.host || !dvr.user || !dvr.pass) {
    return Response.json({ error: "DVR host, user and password are required" }, { status: 400 });
  }

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

  saveConfig({ dvr, adminHash: hashPassword(adminPassword) });

  return Response.json(
    { ok: true, model: probe.model, channels: probe.channels },
    { headers: { "Set-Cookie": sessionCookieHeader(createSessionToken()) } }
  );
}
