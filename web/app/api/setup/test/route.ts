import { isAuthenticated, needsSetup } from "@/lib/auth";
import type { DvrConfig } from "@/lib/config";
import { probeDvr } from "@/lib/go2rtcSync";

export const dynamic = "force-dynamic";

/** Tests DVR credentials without saving anything. Wizard-time or authenticated. */
export async function POST(req: Request) {
  if (!needsSetup() && !(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let dvr: DvrConfig;
  try {
    dvr = (await req.json()).dvr;
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!dvr?.host || !dvr.user || !dvr.pass) {
    return Response.json({ error: "DVR host, user and password are required" }, { status: 400 });
  }
  try {
    const probe = await probeDvr(dvr);
    return Response.json(probe);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
