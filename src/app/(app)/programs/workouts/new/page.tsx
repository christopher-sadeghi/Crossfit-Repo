import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/program-dates";

import { loadBuilderData } from "../load-builder-data";
import { WodBuilder, type OneOff, type Placement } from "../wod-builder";

type Props = { searchParams: Promise<{ program?: string; week?: string; day?: string; athlete?: string; date?: string }> };

export default async function NewWorkoutPage({ searchParams }: Props) {
  const { program, week, day, athlete, date } = await searchParams;
  const oneOff = athlete ? await loadOneOff(athlete, date) : undefined;
  if (athlete && !oneOff) notFound();
  const [{ units, movementOptions }, placement] = await Promise.all([
    loadBuilderData(),
    oneOff ? undefined : loadPlacement(program, week, day),
  ]);
  return (
    <>
      <PageHeader title={oneOff ? "New one-off WOD" : "New WOD"} />
      <WodBuilder units={units} movementOptions={movementOptions} placement={placement} oneOff={oneOff ?? undefined} />
    </>
  );
}

async function loadOneOff(athleteId: string, date?: string): Promise<OneOff | null> {
  if (!/^[0-9a-f-]{36}$/i.test(athleteId)) return null;
  const supabase = await createClient();
  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, first_name, last_name")
    .eq("id", athleteId)
    .maybeSingle();
  if (!athlete) return null;

  const requestedDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  const defaultDate =
    requestedDate && !Number.isNaN(requestedDate.getTime()) && requestedDate.toISOString().slice(0, 10) === date
      ? date
      : today();
  return {
    athleteId: athlete.id,
    athleteName: `${athlete.first_name} ${athlete.last_name}`,
    date: defaultDate,
  };
}

async function loadPlacement(program?: string, week?: string, day?: string): Promise<Placement | undefined> {
  const w = Number(week);
  const d = Number(day);
  if (!program || !/^[0-9a-f-]{36}$/i.test(program) || !Number.isInteger(w) || !Number.isInteger(d) || d < 1 || d > 7 || w < 1) return;
  const supabase = await createClient();
  const { data } = await supabase.from("programs").select("id, name, weeks").eq("id", program).maybeSingle();
  if (!data || w > data.weeks) return;
  return { program_id: data.id, program_name: data.name, week_number: w, day_number: d };
}
