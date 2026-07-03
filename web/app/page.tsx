import VideoWall from "@/components/VideoWall";
import { guardPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  await guardPage();
  return <VideoWall />;
}
