import { redirect } from "next/navigation";

export default async function SuggestionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  if (status === "athlete") redirect("/messages");
  redirect(status ? `/settings/ai-history?status=${encodeURIComponent(status)}` : "/settings/ai-history");
}
