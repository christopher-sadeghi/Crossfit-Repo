import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

import { AthleteForm } from "../../athlete-form";

export default async function EditAthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: athlete } = await supabase.from("athletes").select("*").eq("id", id).maybeSingle();
  if (!athlete) notFound();

  return (
    <>
      <PageHeader title={`Edit ${athlete.first_name} ${athlete.last_name}`} />
      <AthleteForm athlete={athlete} />
    </>
  );
}
