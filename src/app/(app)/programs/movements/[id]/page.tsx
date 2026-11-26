import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { DemoVariationLink, HowTo } from "@/components/movements/how-to";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { movementGuideSchema } from "@/lib/ai/movement-guides";
import { buildMovementDemo, loadMovementDemoSource } from "@/lib/movement-demos";
import { hasGuideText } from "@/lib/movement-guides";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

import { GuideForm, RequestGuideForm } from "./guide-forms";

export default async function MovementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" || !z.string().uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const [source, pendingResult, library] = await Promise.all([
    loadMovementDemoSource(supabase, id, viewer.gymId),
    supabase.from("ai_suggestions").select("id, proposal").eq("coach_id", viewer.gymId)
      .eq("suggestion_type", "movement_guide").eq("status", "pending").eq("input->>movement_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("movements").select("id, name").order("name"),
  ]);
  if (pendingResult.error || library.error) throw new Error("Couldn't load the movement how-to.");
  if (!source) notFound();
  const { movement, guide } = source;
  const demo = await buildMovementDemo(supabase, source, library.data);
  const pending = pendingResult.data;
  const proposal = pending ? movementGuideSchema.safeParse(pending.proposal) : null;
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <Link href="/programs/movements" className="text-sm underline">← Movements</Link>
      <h1 className="text-2xl font-semibold">How to {movement.name}</h1>
      <HowTo demo={demo} renderVariation={(variation) => <DemoVariationLink movement={variation} basePath="/programs/movements" />} emptyMessage="Not written yet. Ask AI or add it below." />
      {!hasGuideText(demo.guide) && !pending && <RequestGuideForm movementId={id} />}
      {pending && (
        <Card>
          <CardHeader><CardTitle>Review AI how-to</CardTitle></CardHeader>
          <CardContent>
            <GuideForm movementId={id} suggestionId={pending.id} values={proposal?.success ? proposal.data : null} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Edit your gym’s demo</CardTitle></CardHeader>
        <CardContent>
          <GuideForm key={guide?.updated_at ?? "new"} movementId={id} values={demo.guide} editor={{
            coachId: viewer.gymId, videoUrl: guide?.video_url ?? null, hasClip: !!guide?.clip_path,
            hasDefaultVideo: !!movement.demo_video_url && !!movement.crossfit_url,
            library: library.data.filter((option) => option.id !== id),
            easierId: guide?.easier_movement_id ?? null, harderId: guide?.harder_movement_id ?? null,
            libraryEasier: library.data.find((option) => option.id === movement.easier_movement_id)?.name,
            libraryHarder: library.data.find((option) => option.id === movement.harder_movement_id)?.name,
          }} />
        </CardContent>
      </Card>
    </div>
  );
}
