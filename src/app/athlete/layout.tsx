import { Dumbbell, LogOut } from "lucide-react";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/bell";
import { getNotifications } from "@/app/notification-actions";
import { getTimeZone } from "@/lib/time-zone";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { checkProgressReminders } from "@/lib/notifications";

import { logout } from "../(auth)/actions";
import { AthleteNav } from "./athlete-nav";
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
  await checkProgressReminders(supabase, { athleteId: viewer.athleteId });
  const [notifications, timeZone] = await Promise.all([getNotifications(), getTimeZone()]);
  const { data: coach } = await supabase
    .from("coaches")
    .select("gym_name")
    .eq("id", viewer.coachId)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-muted/30 md:flex md:bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/30 p-4 md:flex">
        <div className="mb-6 flex min-w-0 items-center gap-2 px-3 text-lg font-semibold">
          <Dumbbell className="size-5 shrink-0" />
          <span className="truncate">{coach?.gym_name || "FitCoach AI"}</span>
        </div>
        <AthleteNav unreadMessages={notifications.unreadMessages} />
        <div className="mt-3">
          <NotificationBell initial={notifications} timeZone={timeZone} align="start" />
        </div>
        <div className="mt-auto grid gap-3 border-t pt-4">
          <div className="px-3 text-sm">
            <div className="truncate font-medium">{viewer.firstName}</div>
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost" className="w-full justify-start gap-3">
              <LogOut className="size-4" />
              Log out
            </Button>
          </form>
        </div>
      </aside>
      <main className="mx-auto max-w-md px-4 pt-5 pb-24 md:mx-0 md:max-w-none md:flex-1 md:overflow-x-hidden md:p-8">
        <header className="mb-6 flex items-center justify-between gap-4 md:hidden">
          <div className="min-w-0">
            <div className="flex items-center gap-2 truncate font-semibold">
              <Dumbbell className="size-5 shrink-0" />
              <span className="truncate">{coach?.gym_name || "FitCoach AI"}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{viewer.firstName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2"><NotificationBell initial={notifications} timeZone={timeZone} />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="size-4" />
              Log out
            </Button>
          </form>
          </div>
        </header>
        <div className="md:max-w-4xl"><InstallPrompt />{children}</div>
      </main>
      <div className="md:hidden">
        <AthleteTabs unreadMessages={notifications.unreadMessages} />
      </div>
    </div>
  );
}
