import { redirect } from "next/navigation";
import { ProgrammingStyleForm } from "./programming-style-form";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { programmingStyleSchema } from "@/lib/programming-style";

export default async function ProgrammingStyleSetupPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind !== "coach") redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.from("coach_programming_styles").select("answers, status").eq("coach_id", viewer.id).maybeSingle();
  const parsed = programmingStyleSchema.safeParse(data?.answers);
  const savedStatus = data?.status === "completed" ? "completed" : data?.status === "skipped" ? "skipped" : null;
  return <main className="min-h-screen bg-muted/30 px-4 py-8 sm:py-14">
    <header className="mx-auto mb-6 max-w-2xl text-center">
      <h1 className="text-2xl font-semibold">Teach the AI your programming style</h1>
      <p className="mt-2 text-sm text-muted-foreground">Share what makes your coaching yours. You can change this any time in Settings.</p>
    </header>
    <ProgrammingStyleForm initialAnswers={parsed.success ? parsed.data : programmingStyleSchema.parse({})} savedStatus={savedStatus} />
  </main>;
}
