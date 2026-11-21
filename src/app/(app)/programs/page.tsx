import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

import { ProgramsNav } from "./programs-nav";

export default async function ProgramsPage() {
  const supabase = await createClient();
  const { data: programs } = await supabase
    .from("programs")
    .select("id, name, description, weeks, workouts(count), program_assignments(count)")
    .order("created_at", { ascending: false });

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Programs" description="Build WODs, plan programs and assign them to athletes." />
        <Button asChild>
          <Link href="/programs/new">
            <Plus /> New program
          </Link>
        </Button>
      </div>
      <ProgramsNav active="/programs" />
      <Card className="py-0">
        <CardContent className="p-0">
          {programs?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Program</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead>WODs</TableHead>
                  <TableHead>Athletes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-md pl-4">
                      <Link href={`/programs/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      {p.description && <p className="truncate text-sm text-muted-foreground">{p.description}</p>}
                    </TableCell>
                    <TableCell>
                      {p.weeks} week{p.weeks === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell>{p.workouts[0]?.count ?? 0}</TableCell>
                    <TableCell>{p.program_assignments[0]?.count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-8 text-center text-muted-foreground">No programs yet. Create one, or load demo data from Settings.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
