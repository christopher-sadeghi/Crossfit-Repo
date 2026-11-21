import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

import { ProgramForm } from "../../program-form";

export default async function EditProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: program } = await supabase.from("programs").select("id, name, description, weeks").eq("id", id).maybeSingle();
  if (!program) notFound();

  return (
    <>
      <PageHeader title={`Edit ${program.name}`} />
      <ProgramForm program={program} />
    </>
  );
}
