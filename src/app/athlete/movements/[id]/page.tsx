import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { HowTo } from "@/components/movements/how-to";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export default async function AthleteMovementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete" || !z.string().uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const [movementResult, guideResult] = await Promise.all([
    supabase.from("movements").select("id, name, demo_video_url").eq("id", id).maybeSingle(),
    supabase.from("movement_guides").select("*").eq("movement_id", id).eq("coach_id", viewer.coachId).maybeSingle(),
  ]);
  if (movementResult.error || guideResult.error) throw new Error("Couldn't load the movement how-to.");
  const movement = movementResult.data;
  if (!movement) notFound();
  const guide = guideResult.data;
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <Link href="/athlete" className="text-sm underline">← Today&apos;s WOD</Link>
      <h1 className="text-2xl font-semibold">How to {movement.name}</h1>
      <HowTo name={movement.name} videoUrl={guide?.video_url ?? movement.demo_video_url} guide={guide} />
    </div>
  );
}
