import { Dumbbell, LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { NavLinks } from "@/components/layout/nav-links";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/viewer";

import { logout } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "athlete") redirect("/athlete");
  if (viewer.kind === "none") redirect("/no-access");
  const coach = viewer;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30 p-4">
        <div className="mb-6 flex items-center gap-2 px-3 text-lg font-semibold">
          <Dumbbell className="size-5" />
          FitCoach AI
        </div>
        <NavLinks />
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
    </div>
  );
}
