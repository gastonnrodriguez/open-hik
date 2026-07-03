import { redirect } from "next/navigation";
import SetupWizard from "@/components/SetupWizard";
import { needsSetup } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!needsSetup()) redirect("/");
  return <SetupWizard />;
}
