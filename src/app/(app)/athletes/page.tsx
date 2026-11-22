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
import { cn } from "@/lib/utils";

import { LEVEL_LABELS } from "./options";

type Props = { searchParams: Promise<{ q?: string; status?: string }> };

export default async function AthletesPage({ searchParams }: Props) {
  const { q = "", status: rawStatus } = await searchParams;
  const status = rawStatus === "archived" ? "archived" : "active";
  const supabase = await createClient();
  const todayIso = await getToday();
  const sevenDaysAgo = new Date(`${todayIso}T00:00:00Z`);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  const since = sevenDaysAgo.toISOString().slice(0, 10);

  let query = supabase
    .from("athletes")
    .select("id, first_name, last_name, email, experience_level, injuries, user_id")
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
  const [{ data: athletes = [] }, { data: invites = [] }, { data: results = [] }, checkInAttention] = await Promise.all([
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
  ]);
  const invitedAthletes = new Set((invites ?? []).map((invite) => invite.athlete_id));
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
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Injuries / limitations</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>App</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {athletes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-4 font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/athletes/${a.id}`} className="hover:underline">
                          {a.first_name} {a.last_name}
                        </Link>
                        {attentionAthletes.has(a.id) && <Badge variant="destructive">Needs attention</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{LEVEL_LABELS[a.experience_level]}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {a.injuries ? <Badge variant="destructive">{a.injuries}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.email ?? "—"}</TableCell>
                    <TableCell>
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
