import { redirect } from "next/navigation";
import LoginView from "@/components/LoginView";
import { isAuthenticated, needsSetup } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (needsSetup()) redirect("/setup");
  if (await isAuthenticated()) redirect("/");
  return <LoginView />;
}
