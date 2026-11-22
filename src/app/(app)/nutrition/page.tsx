import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays, onTarget, targetOn, totals } from "@/lib/nutrition";
import { getToday } from "@/lib/time-zone";
import { createClient } from "@/lib/supabase/server";

export default async function NutritionPage() {
  const end = await getToday();
  const start = addDays(end, -6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const supabase = await createClient();
  const [athleteRows, targetRows, foodRows] = await Promise.all([
    supabase.from("athletes").select("id, first_name, last_name").eq("status", "active").order("first_name").order("last_name"),
    supabase.from("nutrition_targets").select("athlete_id, calories, protein_g, carbs_g, fat_g, start_date, end_date").order("start_date", { ascending: false }),
    supabase.from("food_logs").select("athlete_id, logged_on, calories, protein_g, carbs_g, fat_g").gte("logged_on", start).lte("logged_on", end),
  ]);
  const error = athleteRows.error ?? targetRows.error ?? foodRows.error;
  if (error) throw new Error("Couldn't load nutrition.", { cause: error });
  const { data: athletes } = athleteRows;
  const { data: targets } = targetRows;
  const { data: food } = foodRows;

  const rows = (athletes ?? []).map((a) => {
    const mine = (targets ?? []).filter((t) => t.athlete_id === a.id);
    const logs = (food ?? []).filter((f) => f.athlete_id === a.id);
    const logged = days.map((d) => ({ d, rows: logs.filter((f) => f.logged_on === d) })).filter((x) => x.rows.length);
    const met = logged.filter(({ d, rows }) => {
      const t = targetOn(mine, d);
      return t && onTarget(totals(rows), t);
    }).length;
    const sum = totals(logs);
    return {
      ...a,
      current: targetOn(mine, end),
      loggedDays: logged.length,
      met,
      avgCalories: logged.length ? Math.round(sum.calories / logged.length) : null,
      avgProtein: logged.length ? Math.round(sum.protein / logged.length) : null,
    };
  });

  return (
    <>
      <PageHeader title="Nutrition" description="Macro targets and daily food logs for the last 7 days." />
      <Card className="py-0">
        <CardContent className="p-0">
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Athlete</TableHead>
                  <TableHead>Current target</TableHead>
                  <TableHead>Avg calories</TableHead>
                  <TableHead>Avg protein</TableHead>
                  <TableHead>Days logged</TableHead>
                  <TableHead>Days on target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4 font-medium">
                      <Link href={`/nutrition/${r.id}`} className="hover:underline">
                        {r.first_name} {r.last_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {r.current ? (
                        `${r.current.calories} kcal · P ${r.current.protein_g} · C ${r.current.carbs_g} · F ${r.current.fat_g}`
                      ) : (
                        <span className="text-muted-foreground">No target</span>
                      )}
                    </TableCell>
                    <TableCell>{r.avgCalories ?? "—"}</TableCell>
                    <TableCell>{r.avgProtein != null ? `${r.avgProtein}g` : "—"}</TableCell>
                    <TableCell>{r.loggedDays} / 7</TableCell>
                    <TableCell>{r.met} / 7</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-8 text-center text-muted-foreground">
              No active athletes yet. <Link href="/athletes/new" className="underline">Add one</Link> or load demo data in Settings.
            </p>
          )}
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">On target = calories within ±10% and protein at least 90% of that day&apos;s target.</p>
    </>
  );
}
