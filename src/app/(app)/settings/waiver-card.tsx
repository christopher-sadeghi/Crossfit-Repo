import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCoach } from "@/lib/coach";
import { createClient } from "@/lib/supabase/server";
import { WAIVER_TEMPLATE, renderWaiverBody, waiverStatus } from "@/lib/waivers";

import { WaiverForm } from "./waiver-form";

export async function WaiverCard() {
  const coach = await getCoach();
  if (!coach) return null;
  const supabase = await createClient();
  const [waiversResult, athletesResult, signaturesResult, ownerResult] = await Promise.all([
    supabase.from("coach_waivers").select("id, version, body, created_at").eq("coach_id", coach.gymId).order("version", { ascending: false }),
    supabase.from("athletes").select("id, first_name, last_name, waiver_requested_at").eq("coach_id", coach.gymId).eq("status", "active").not("user_id", "is", null),
    supabase.from("athlete_waiver_signatures").select("athlete_id, waiver_id, signed_name, signed_at").eq("coach_id", coach.gymId).order("signed_at", { ascending: false }),
    supabase.from("coaches").select("full_name").eq("id", coach.gymId).maybeSingle(),
  ]);
  for (const result of [waiversResult, athletesResult, signaturesResult, ownerResult]) {
    if (result.error) throw new Error("Couldn't load waiver settings.");
  }
  const waivers = waiversResult.data ?? [];
  const latestWaiver = waivers[0] ?? null;
  const versionById = new Map(waivers.map((waiver) => [waiver.id, waiver.version]));
  const signaturesByAthlete = new Map<string, { signedAt: string; signedName: string; version: number }[]>();
  for (const signature of signaturesResult.data ?? []) {
    const current = signaturesByAthlete.get(signature.athlete_id) ?? [];
    current.push({
      signedAt: signature.signed_at,
      signedName: signature.signed_name,
      version: versionById.get(signature.waiver_id) ?? 0,
    });
    signaturesByAthlete.set(signature.athlete_id, current);
  }
  const notSigned = (athletesResult.data ?? []).filter((athlete) => waiverStatus({
    waiverRequestedAt: athlete.waiver_requested_at,
    latestWaiver,
    signatures: signaturesByAthlete.get(athlete.id) ?? [],
  }).status === "needs_sign");
  const coachName = ownerResult.data?.full_name || "your coach";

  return <Card className="mt-6">
    <CardHeader><CardTitle>Waiver</CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      {latestWaiver
        ? <p className="text-sm text-muted-foreground">Version {latestWaiver.version} · published {new Date(latestWaiver.created_at).toLocaleDateString()}</p>
        : <p className="text-sm text-muted-foreground">Not published yet — athletes won&apos;t be asked until you publish.</p>}
      {coach.role === "owner"
        ? <WaiverForm body={latestWaiver?.body ?? renderWaiverBody(WAIVER_TEMPLATE, coachName)} hasPublishedWaiver={Boolean(latestWaiver)} />
        : latestWaiver
          ? <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-sm">{latestWaiver.body}</pre>
          : null}
      <p className="text-sm text-muted-foreground">This is a starting template, not legal advice. Have a lawyer review it before using it.</p>
      <div className="space-y-2">
        <h3 className="font-medium">Not signed yet ({notSigned.length})</h3>
        {notSigned.length ? <ul className="space-y-1 text-sm">
          {notSigned.map((athlete) => <li key={athlete.id}><Link className="underline underline-offset-4" href={`/athletes/${athlete.id}?tab=intake`}>{athlete.first_name} {athlete.last_name}</Link></li>)}
        </ul> : <p className="text-sm text-muted-foreground">Everyone who has been asked is signed.</p>}
      </div>
    </CardContent>
  </Card>;
}
