import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

import { loadBuilderData } from "../load-builder-data";
import { WodBuilder, type Placement } from "../wod-builder";

type Props = { searchParams: Promise<{ program?: string; week?: string; day?: string }> };

export default async function NewWorkoutPage({ searchParams }: Props) {
  const { program, week, day } = await searchParams;
  const [{ units, movementOptions }, placement] = await Promise.all([loadBuilderData(), loadPlacement(program, week, day)]);
  return (
    <>
      <PageHeader title="New WOD" />
      <WodBuilder units={units} movementOptions={movementOptions} placement={placement} />
    </>
  );
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
