import { Dumbbell, LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

import { logout } from "../(auth)/actions";
import { AthleteTabs } from "./athlete-tabs";

export default async function AthleteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");

  const supabase = await createClient();
  const { data: coach } = await supabase
    .from("coaches")
    .select("gym_name")
    .eq("id", viewer.coachId)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto max-w-md px-4 pt-5 pb-24">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 truncate font-semibold">
              <Dumbbell className="size-5 shrink-0" />
              <span className="truncate">{coach?.gym_name || "FitCoach AI"}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{viewer.firstName}</p>
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="size-4" />
              Log out
            </Button>
          </form>
        </header>
        {children}
      </main>
      <AthleteTabs />
    </div>
  );
}
