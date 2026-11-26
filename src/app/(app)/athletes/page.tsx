import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadCheckInAttention } from "@/lib/check-in";
import { needsAttention } from "@/lib/feedback";
import { getToday } from "@/lib/time-zone";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/units";
import { cn } from "@/lib/utils";
import { getCoach } from "@/lib/coach";
import { waiverStatus } from "@/lib/waivers";

import { LEVEL_LABELS } from "./options";

type Props = { searchParams: Promise<{ q?: string; status?: string }> };

export default async function AthletesPage({ searchParams }: Props) {
  const { q = "", status: rawStatus } = await searchParams;
  const status = rawStatus === "archived" ? "archived" : "active";
  const supabase = await createClient();
  const coach = await getCoach();
  const todayIso = await getToday();
  const sevenDaysAgo = new Date(`${todayIso}T00:00:00Z`);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  const since = sevenDaysAgo.toISOString().slice(0, 10);

  let query = supabase
    .from("athletes")
    .select("id, first_name, last_name, email, experience_level, injuries, user_id, assigned_coach_id, waiver_requested_at")
    .eq("status", status)
    .order("first_name")
    .order("last_name");
  // Every word must match a name or the email, so "Maya Chen" finds Maya Chen.
  // Quoted values let PostgREST accept "." and "@"; strip only characters that would break the filter.
  const term = q.trim().replace(/[",()\\%*]/g, "");
  for (const word of term.split(/\s+/).filter(Boolean)) {
    const like = `ilike."%${word}%"`;
    query = query.or(`first_name.${like},last_name.${like},email.${like}`);
  }
  const [athleteRows, inviteRows, resultRows, checkInAttention, coachRows, membershipRows, intakeRows, waiverRows, signatureRows] = await Promise.all([
    query,
    supabase
      .from("athlete_invites")
      .select("athlete_id")
      .is("accepted_at", null)
      .is("revoked_at", null),
    supabase
      .from("workout_results")
      .select("athlete_id, performed_on, rpe, pain_notes")
      .gte("performed_on", since)
      .lte("performed_on", todayIso)
      .or("pain_notes.not.is.null,rpe.gte.9"),
    loadCheckInAttention(supabase, todayIso),
    supabase.from("coaches").select("id, full_name").eq("gym_id", coach?.gymId ?? ""),
    supabase.from("athlete_memberships").select("athlete_id, status, created_at").order("created_at", { ascending: false }),
    supabase.from("athlete_intakes").select("athlete_id, answers"),
    supabase.from("coach_waivers").select("id, version").eq("coach_id", coach?.gymId ?? "").order("version", { ascending: false }),
    supabase.from("athlete_waiver_signatures").select("athlete_id, waiver_id, signed_name, signed_at").eq("coach_id", coach?.gymId ?? "").order("signed_at", { ascending: false }),
  ]);
  const error = athleteRows.error ?? inviteRows.error ?? resultRows.error ?? membershipRows.error ?? intakeRows.error ?? waiverRows.error ?? signatureRows.error;
  if (error) throw new Error("Couldn't load athletes.", { cause: error });
  const { data: athletes } = athleteRows;
  const { data: invites } = inviteRows;
  const { data: results } = resultRows;
  const coachNames = new Map((coachRows.data ?? []).map((row) => [row.id, row.full_name || "Coach"]));
  const latestMembershipStatus = new Map<string, string>();
  for (const membership of membershipRows.data ?? []) {
    if (!latestMembershipStatus.has(membership.athlete_id)) latestMembershipStatus.set(membership.athlete_id, membership.status);
  }
  const invitedAthletes = new Set((invites ?? []).map((invite) => invite.athlete_id));
  const healthFlagAthletes = new Set((intakeRows.data ?? []).filter((intake) =>
    (intake.answers as Record<string, unknown> | null)?.health_flag === true,
  ).map((intake) => intake.athlete_id));
  const waiverVersionById = new Map((waiverRows.data ?? []).map((waiver) => [waiver.id, waiver.version]));
  const latestWaiver = waiverRows.data?.[0] ?? null;
  const signaturesByAthlete = new Map<string, { signedAt: string; signedName: string; version: number }[]>();
  for (const signature of signatureRows.data ?? []) {
    const signatures = signaturesByAthlete.get(signature.athlete_id) ?? [];
    signatures.push({
      signedAt: signature.signed_at,
      signedName: signature.signed_name,
      version: waiverVersionById.get(signature.waiver_id) ?? 0,
    });
    signaturesByAthlete.set(signature.athlete_id, signatures);
  }
  const waiverNeedsSign = new Set((athletes ?? []).filter((athlete) =>
    waiverStatus({
      waiverRequestedAt: athlete.waiver_requested_at,
      latestWaiver,
      signatures: signaturesByAthlete.get(athlete.id) ?? [],
    }).status === "needs_sign",
  ).map((athlete) => athlete.id));
  const attentionResults = new Map<string, typeof results>();
  for (const result of results ?? []) {
    const rows = attentionResults.get(result.athlete_id) ?? [];
    rows.push(result);
    attentionResults.set(result.athlete_id, rows);
  }
  const attentionAthletes = new Set(
    (athletes ?? [])
      .filter((athlete) =>
        needsAttention(attentionResults.get(athlete.id) ?? [], todayIso).flagged ||
        checkInAttention.get(athlete.id)?.flagged,
      )
      .map((athlete) => athlete.id),
  );

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Athletes" description="Your roster, profiles, injuries and history." />
        <Button asChild>
          <Link href="/athletes/new">
            <Plus /> Add athlete
          </Link>
        </Button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form className="relative w-72" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search by name or email" className="pl-9" aria-label="Search athletes" />
          {status === "archived" && <input type="hidden" name="status" value="archived" />}
        </form>
        <nav className="flex rounded-md border p-0.5 text-sm" aria-label="Filter by status">
          {(["active", "archived"] as const).map((s) => (
            <Link
              key={s}
              href={{ pathname: "/athletes", query: { ...(q && { q }), ...(s === "archived" && { status: s }) } }}
              aria-current={status === s ? "page" : undefined}
              className={cn(
                "rounded px-3 py-1 capitalize",
                status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </Link>
          ))}
        </nav>
      </div>
      <Card className="py-0">
        <CardContent className="p-0">
          {athletes?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 whitespace-normal">Name</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="hidden sm:table-cell">Injuries / limitations</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead className="hidden sm:table-cell">App</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {athletes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-4 font-medium whitespace-normal">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link href={`/athletes/${a.id}`} className="hover:underline">
                          {a.first_name} {a.last_name}
                        </Link>
                        {attentionAthletes.has(a.id) && (
                          <Badge
                            variant="destructive"
                            title={checkInAttention.get(a.id)?.reasons
                              .map((reason) => `${formatDate(reason.date)}: ${reason.text}`)
                              .join("; ")}
                          >
                            Needs attention
                          </Badge>
                        )}
                        {healthFlagAthletes.has(a.id) && <Badge variant="destructive">Health flag</Badge>}
                        {waiverNeedsSign.has(a.id) && <Badge variant="outline">Waiver not signed</Badge>}
                        {(latestMembershipStatus.get(a.id) === "past_due" || latestMembershipStatus.get(a.id) === "unpaid") && (
                          <Badge variant="destructive">Past due</Badge>
                        )}
                        {a.assigned_coach_id && coachNames.has(a.assigned_coach_id) && (
                          <span className="text-xs font-normal text-muted-foreground">Coach: {coachNames.get(a.assigned_coach_id)}</span>
                        )}
                      </div>
                      {a.injuries && (
                        <p className="max-w-48 truncate text-xs text-destructive sm:hidden">
                          {a.injuries}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{LEVEL_LABELS[a.experience_level]}</Badge>
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-muted-foreground sm:table-cell">
                      {a.injuries ? <Badge variant="destructive">{a.injuries}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{a.email ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {a.user_id ? (
                        <Badge>Joined</Badge>
                      ) : invitedAthletes.has(a.id) ? (
                        <Badge variant="secondary">Invited</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-8 text-center text-muted-foreground">
              {term
                ? `No ${status} athletes match “${q}”.`
                : status === "archived"
                  ? "No archived athletes."
                  : "No athletes yet. Add one, or load demo data from Settings."}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
