import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { HowTo } from "@/components/movements/how-to";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { movementGuideSchema } from "@/lib/ai/movement-guides";
import { hasGuideText } from "@/lib/movement-guides";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

import { GuideForm, RequestGuideForm } from "./guide-forms";

export default async function MovementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" || !z.string().uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const [movementResult, guideResult, pendingResult] = await Promise.all([
    supabase.from("movements").select("*").eq("id", id).maybeSingle(),
    supabase.from("movement_guides").select("*").eq("movement_id", id).eq("coach_id", viewer.id).maybeSingle(),
    supabase.from("ai_suggestions").select("id, proposal").eq("coach_id", viewer.id)
      .eq("suggestion_type", "movement_guide").eq("status", "pending").eq("input->>movement_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (movementResult.error || guideResult.error || pendingResult.error) throw new Error("Couldn't load the movement how-to.");
  const movement = movementResult.data;
  if (!movement) notFound();
  const guide = guideResult.data;
  const pending = pendingResult.data;
  const proposal = pending ? movementGuideSchema.safeParse(pending.proposal) : null;
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <Link href="/programs/movements" className="text-sm underline">← Movements</Link>
      <h1 className="text-2xl font-semibold">How to {movement.name}</h1>
      <HowTo name={movement.name} videoUrl={guide?.video_url ?? movement.demo_video_url} guide={guide} />
      {!hasGuideText(guide) && !pending && <RequestGuideForm movementId={id} />}
      {pending && (
        <Card>
          <CardHeader><CardTitle>Review AI how-to</CardTitle></CardHeader>
          <CardContent>
            <GuideForm movementId={id} suggestionId={pending.id} values={proposal?.success ? proposal.data : null} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Edit published how-to</CardTitle></CardHeader>
        <CardContent><GuideForm key={guide?.updated_at ?? "new"} movementId={id} values={guide} videoUrl={guide?.video_url} /></CardContent>
      </Card>
    </div>
  );
}
