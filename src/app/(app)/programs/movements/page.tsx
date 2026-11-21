import Link from "next/link";
import { Search } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import { CATEGORIES, CATEGORY_LABELS, MEASURE_LABELS } from "../options";
import { ProgramsNav } from "../programs-nav";
import { DeleteMovementButton } from "./delete-movement-button";
import { MovementForm } from "./movement-form";

type Props = { searchParams: Promise<{ q?: string; category?: string }> };

export default async function MovementsPage({ searchParams }: Props) {
  const { q = "", category: rawCategory } = await searchParams;
  const category = CATEGORIES.find((c) => c === rawCategory);
  const supabase = await createClient();

  let query = supabase.from("movements").select("id, name, category, measure, coach_id").order("name");
  if (category) query = query.eq("category", category);
  const term = q.trim();
  if (term) query = query.ilike("name", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
  const { data: movements } = await query;

  const filterHref = (c?: Enums<"movement_category">) => ({
    pathname: "/programs/movements",
    query: { ...(q && { q }), ...(c && { category: c }) },
  });

  return (
    <>
      <PageHeader title="Programs" description="Build WODs, plan programs and assign them to athletes." />
      <ProgramsNav active="/programs/movements" />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add a custom movement</CardTitle>
        </CardHeader>
        <CardContent>
          <MovementForm />
        </CardContent>
      </Card>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form className="relative w-72" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search movements" className="pl-9" aria-label="Search movements" />
          {category && <input type="hidden" name="category" value={category} />}
        </form>
        <nav className="flex flex-wrap rounded-md border p-0.5 text-sm" aria-label="Filter by category">
          {[undefined, ...CATEGORIES].map((c) => (
            <Link
              key={c ?? "all"}
              href={filterHref(c)}
              aria-current={category === c ? "page" : undefined}
              className={cn(
                "rounded px-3 py-1",
                category === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c ? CATEGORY_LABELS[c] : "All"}
            </Link>
          ))}
        </nav>
      </div>
      <Card className="py-0">
        <CardContent className="p-0">
          {movements?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Movement</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Measured in</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="pl-4 font-medium">
                      {m.name} {m.coach_id && <Badge variant="outline">Custom</Badge>}
                    </TableCell>
                    <TableCell>{CATEGORY_LABELS[m.category]}</TableCell>
                    <TableCell>{MEASURE_LABELS[m.measure]}</TableCell>
                    <TableCell>{m.coach_id && <DeleteMovementButton id={m.id} name={m.name} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-8 text-center text-muted-foreground">No movements match.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
