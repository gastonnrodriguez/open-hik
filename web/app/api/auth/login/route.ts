import {
  createSessionToken,
  loginAllowed,
  needsSetup,
  recordLoginFailure,
  sessionCookieHeader,
  verifyPassword,
} from "@/lib/auth";
import { loadConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (needsSetup()) return Response.json({ error: "Setup required" }, { status: 403 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!loginAllowed(ip)) {
    return Response.json({ error: "Too many attempts — wait 15 minutes" }, { status: 429 });
  }

  let password: string;
  try {
    password = String((await req.json()).password ?? "");
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  const hash = loadConfig().adminHash!;
  if (!verifyPassword(password, hash)) {
    recordLoginFailure(ip);
    return Response.json({ error: "Wrong password" }, { status: 401 });
  }

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": sessionCookieHeader(createSessionToken()) } }
  );
}
