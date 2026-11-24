import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { programmingStyleNote } from "@/lib/programming-style";

export async function ProgrammingStyleCard() {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return null;
  const supabase = await createClient();
  const { data } = await supabase.from("coach_programming_styles").select("status, answers").eq("coach_id", viewer.id).maybeSingle();
  const note = data?.status === "completed" ? programmingStyleNote(data.answers) : null;
  return <Card className="mt-6">
    <CardHeader><CardTitle>Programming style</CardTitle></CardHeader>
    <CardContent className="grid gap-3">
      {note ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{note.replace(/^Coach programming style:\n/, "")}</p>
        : <p className="text-sm text-muted-foreground">Not set up</p>}
      <Link href="/setup/programming-style" className="text-sm font-medium underline underline-offset-4">Edit programming style</Link>
    </CardContent>
  </Card>;
}
