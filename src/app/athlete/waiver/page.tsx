import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { waiverStatus } from "@/lib/waivers";

import { WaiverSignForm } from "./sign-form";

export default async function AthleteWaiverPage() {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") redirect("/login");
  const supabase = await createClient();
  const [athleteResult, waiversResult, signaturesResult] = await Promise.all([
    supabase.from("athletes").select("waiver_requested_at").eq("id", viewer.athleteId).single(),
    supabase.from("coach_waivers").select("id, version, body").eq("coach_id", viewer.coachId).order("version", { ascending: false }),
    supabase.from("athlete_waiver_signatures").select("waiver_id, signed_name, signed_at").eq("athlete_id", viewer.athleteId).order("signed_at", { ascending: false }),
  ]);
  for (const result of [athleteResult, waiversResult, signaturesResult]) {
    if (result.error) throw new Error("Couldn't load your waiver.");
  }
  if (!athleteResult.data) throw new Error("Couldn't load your waiver.");
  const waivers = waiversResult.data ?? [];
  const latestWaiver = waivers[0] ?? null;
  const versionById = new Map(waivers.map((waiver) => [waiver.id, waiver.version]));
  const status = waiverStatus({
    waiverRequestedAt: athleteResult.data.waiver_requested_at,
    latestWaiver,
    signatures: (signaturesResult.data ?? []).map((signature) => ({
      waiverId: signature.waiver_id,
      signedAt: signature.signed_at,
      signedName: signature.signed_name,
      version: versionById.get(signature.waiver_id) ?? 0,
    })),
  });
  return <>
    <PageHeader title="Waiver" description="Review and manage your waiver." />
    <Card><CardContent className="space-y-5 pt-6">
      {!latestWaiver
        ? <p className="text-sm text-muted-foreground">Your coach hasn&apos;t added a waiver.</p>
        : status.status === "needs_sign" ? <>
          <p className="text-sm text-muted-foreground">Your coach asked you to review and sign this waiver.</p>
          <pre className="whitespace-pre-wrap rounded-md border p-4 text-sm">{latestWaiver.body}</pre>
          <WaiverSignForm waiverId={latestWaiver.id} />
        </> : status.status === "signed" ? <>
          <p className="font-medium">Signed by {status.signature.signedName} on {new Date(status.signature.signedAt).toLocaleString()} (version {status.signature.version})</p>
          <pre className="whitespace-pre-wrap rounded-md border p-4 text-sm">{waivers.find((waiver) => waiver.id === status.signature.waiverId)?.body ?? latestWaiver.body}</pre>
        </> : <p className="text-sm text-muted-foreground">Your coach hasn&apos;t asked you to sign a waiver.</p>}
    </CardContent></Card>
  </>;
}
