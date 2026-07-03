import { hashPassword, requireAuth, verifyPassword } from "@/lib/auth";
import { loadConfig, saveConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Changes the app password: { current, next } */
export async function PUT(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  let current: string, next: string;
  try {
    const body = await req.json();
    current = String(body.current ?? "");
    next = String(body.next ?? "");
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (next.length < 8) {
    return Response.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }
  if (!verifyPassword(current, loadConfig().adminHash!)) {
    return Response.json({ error: "Current password is wrong" }, { status: 401 });
  }
  saveConfig({ adminHash: hashPassword(next) });
  return Response.json({ ok: true });
}
