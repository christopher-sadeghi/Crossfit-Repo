import { Dumbbell, LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { CoachChat } from "@/components/assistant/coach-chat";
import { NavLinks } from "@/components/layout/nav-links";
import { CoachTabs } from "@/components/layout/coach-tabs";
import { NotificationBell } from "@/components/notifications/bell";
import { getNotifications } from "@/app/notification-actions";
import { Button } from "@/components/ui/button";
import { countAwaitingFormReviews } from "@/lib/form-review-data";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getTimeZone } from "@/lib/time-zone";

import { logout } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "athlete") redirect("/athlete");
  if (viewer.kind === "none") redirect("/no-access");
  const coach = viewer;
  const supabase = await createClient();
  const { data: programmingStyle } = await supabase.from("coach_programming_styles").select("coach_id").eq("coach_id", coach.id).maybeSingle();
  if (!programmingStyle) redirect("/setup/programming-style");
  const [notifications, timeZone, awaitingFormChecks] = await Promise.all([getNotifications(), getTimeZone(), countAwaitingFormReviews(supabase, coach.gymId)]);
  const { count: athleteChanges } = await supabase
    .from("ai_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("suggestion_type", "athlete_adjust_workout")
    .in("status", ["approved", "edited"])
    .is("coach_reviewed_at", null);
  const badges = {
    "/messages": notifications.unreadMessages + (athleteChanges ?? 0),
    "/form-checks": awaitingFormChecks,
  };

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/30 p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-3 text-lg font-semibold">
          <Dumbbell className="size-5" />
          FitCoach AI
        </div>
        <NavLinks badges={badges} />
        <div className="mt-3"><NotificationBell initial={notifications} timeZone={timeZone} align="start" /></div>
        <div className="mt-auto grid gap-3 border-t pt-4">
          <div className="px-3 text-sm">
            <div className="truncate font-medium">{coach.fullName || coach.email}</div>
            {coach.gymName && (
              <div className="truncate text-muted-foreground">{coach.gymName}</div>
            )}
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost" className="w-full justify-start gap-3">
              <LogOut className="size-4" />
              Log out
            </Button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden px-4 pt-4 pb-24 md:p-5 md:pb-5 lg:p-8">
        <header className="mb-6 flex items-center justify-between gap-4 md:hidden">
          <div className="flex min-w-0 items-center gap-2 font-semibold">
            <Dumbbell className="size-5 shrink-0" />
            <span className="truncate">FitCoach AI</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell initial={notifications} timeZone={timeZone} />
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut className="size-4" />
                Log out
              </Button>
            </form>
          </div>
        </header>
        {children}
      </main>
      <div className="md:hidden">
        <CoachTabs badges={badges} />
      </div>
      <CoachChat />
    </div>
  );
}
