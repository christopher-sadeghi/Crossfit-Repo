import { Dumbbell, LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { CoachChat } from "@/components/assistant/coach-chat";
import { NavLinks } from "@/components/layout/nav-links";
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
  const [notifications, timeZone, awaitingFormChecks] = await Promise.all([getNotifications(), getTimeZone(), countAwaitingFormReviews(supabase, coach.id)]);
  const { count: athleteChanges } = await supabase
    .from("ai_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("suggestion_type", "athlete_adjust_workout")
    .in("status", ["approved", "edited"])
    .is("coach_reviewed_at", null);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30 p-4">
        <div className="mb-6 flex items-center gap-2 px-3 text-lg font-semibold">
          <Dumbbell className="size-5" />
          FitCoach AI
        </div>
        <NavLinks badges={{ "/messages": notifications.unreadMessages + (athleteChanges ?? 0), "/form-checks": awaitingFormChecks }} />
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
      <main className="flex-1 overflow-x-hidden p-8">{children}</main>
      <CoachChat />
    </div>
  );
}
