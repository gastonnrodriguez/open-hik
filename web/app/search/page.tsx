import SearchView from "@/components/SearchView";
import { guardPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  await guardPage();
  return <SearchView />;
}
