import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCoach } from "@/lib/coach";
import { createClient } from "@/lib/supabase/server";
import { renderWaiverBody } from "@/lib/waivers";

import { PrintButton } from "./print-button";

export default async function SignedWaiverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coach = await getCoach();
  if (!coach) notFound();
  const supabase = await createClient();
  const athleteResult = await supabase.from("athletes").select("id, first_name, last_name")
    .eq("id", id).eq("coach_id", coach.gymId).maybeSingle();
  if (athleteResult.error || !athleteResult.data) notFound();
  const signatureResult = await supabase.from("athlete_waiver_signatures")
    .select("waiver_id, signed_name, signed_at, user_agent")
    .eq("athlete_id", id).order("signed_at", { ascending: false }).limit(1).maybeSingle();
  if (signatureResult.error || !signatureResult.data) notFound();
  const [waiverResult, ownerResult] = await Promise.all([
    supabase.from("coach_waivers").select("version, body").eq("id", signatureResult.data.waiver_id).maybeSingle(),
    supabase.from("coaches").select("full_name").eq("id", coach.gymId).maybeSingle(),
  ]);
  if (waiverResult.error || !waiverResult.data) notFound();
  const athleteName = `${athleteResult.data.first_name} ${athleteResult.data.last_name}`;
  const coachName = ownerResult.data?.full_name || "Coach";

  return <main className="waiver-print-content mx-auto max-w-3xl space-y-5">
    <div className="waiver-print-hidden flex items-center justify-between gap-3">
      <Button asChild variant="ghost"><Link href={`/athletes/${id}?tab=intake`}>Back to intake</Link></Button>
      <PrintButton />
    </div>
    <Card><CardContent className="space-y-5 pt-6">
      <header>
        <h1 className="text-2xl font-semibold">Signed waiver</h1>
        <p className="text-muted-foreground">{athleteName} · {coachName} · Version {waiverResult.data.version}</p>
      </header>
      <pre className="whitespace-pre-wrap text-sm">{renderWaiverBody(waiverResult.data.body, coachName)}</pre>
      <section className="space-y-1 border-t pt-4 text-sm">
        <p><span className="font-medium">Signed by:</span> {signatureResult.data.signed_name}</p>
        <p><span className="font-medium">Signed at:</span> {new Date(signatureResult.data.signed_at).toLocaleString()}</p>
        <p><span className="font-medium">User agent:</span> {signatureResult.data.user_agent || "Not available"}</p>
      </section>
    </CardContent></Card>
  </main>;
}
