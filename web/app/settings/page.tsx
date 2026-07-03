import SettingsView from "@/components/SettingsView";
import { guardPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await guardPage();
  return <SettingsView />;
}
