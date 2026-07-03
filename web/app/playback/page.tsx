import PlaybackView from "@/components/PlaybackView";
import { guardPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PlaybackPage() {
  await guardPage();
  return <PlaybackView />;
}
