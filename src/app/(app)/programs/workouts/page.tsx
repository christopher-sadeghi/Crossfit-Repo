import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import { formatDate } from "@/lib/units";
import { cn } from "@/lib/utils";

import { WORKOUT_TYPE_LABELS, WORKOUT_TYPES } from "../options";
import { ProgramsNav } from "../programs-nav";
import { formatHeadline } from "./whiteboard";

type Props = { searchParams: Promise<{ q?: string; type?: string }> };

export default async function WorkoutsPage({ searchParams }: Props) {
  const { q = "", type: rawType } = await searchParams;
  const type = WORKOUT_TYPES.find((t) => t === rawType);
  const supabase = await createClient();

  let query = supabase
    .from("workouts")
    .select("id, title, workout_type, time_cap_seconds, rounds, scheduled_on, updated_at, programs(name), workout_movements(count)")
    .order("scheduled_on", { ascending: true, nullsFirst: true })
    .order("updated_at", { ascending: false });
  if (type) query = query.eq("workout_type", type);
  const term = q.trim();
  if (term) query = query.ilike("title", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
  const { data: workouts } = await query;

  const filterHref = (t?: Enums<"workout_type">) => ({
    pathname: "/programs/workouts",
    query: { ...(q && { q }), ...(t && { type: t }) },
  });

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Programs" description="Build WODs, plan programs and assign them to athletes." />
        <Button asChild>
          <Link href="/programs/workouts/new">
            <Plus /> New WOD
          </Link>
        </Button>
      </div>
      <ProgramsNav active="/programs/workouts" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form className="relative w-72" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search WODs" className="pl-9" aria-label="Search WODs" />
          {type && <input type="hidden" name="type" value={type} />}
        </form>
        <nav className="flex flex-wrap rounded-md border p-0.5 text-sm" aria-label="Filter by type">
          {[undefined, ...WORKOUT_TYPES].map((t) => (
            <Link
              key={t ?? "all"}
              href={filterHref(t)}
              aria-current={type === t ? "page" : undefined}
              className={cn(
                "rounded px-3 py-1",
                type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t ? WORKOUT_TYPE_LABELS[t] : "All"}
            </Link>
          ))}
        </nav>
      </div>
      <Card className="py-0">
        <CardContent className="p-0">
          {workouts?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">WOD</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Movements</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Scheduled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workouts.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="pl-4 font-medium">
                      <Link href={`/programs/workouts/${w.id}`} className="hover:underline">
                        {w.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{formatHeadline(w) || WORKOUT_TYPE_LABELS[w.workout_type]}</Badge>
                    </TableCell>
                    <TableCell>{w.workout_movements[0]?.count ?? 0}</TableCell>
                    <TableCell className="text-muted-foreground">{w.programs?.name ?? "Standalone"}</TableCell>
                    <TableCell className="text-muted-foreground">{w.scheduled_on ? formatDate(w.scheduled_on) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-8 text-center text-muted-foreground">
              {term || type ? "No WODs match." : "No WODs yet. Create one, or load demo data from Settings."}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
