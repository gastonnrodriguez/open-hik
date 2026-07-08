import { requireAuth } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  return Response.json({
    go2rtcUrl: process.env.GO2RTC_PUBLIC_URL || null,
    lanIp: process.env.HOST_LAN_IP || null,
  });
}
