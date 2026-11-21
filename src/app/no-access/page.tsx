import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { logout } from "../(auth)/actions";

export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>FitCoach AI</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Your access to this app was removed or isn&apos;t set up. Contact your coach.
          </p>
          <form action={logout}>
            <Button type="submit" variant="outline" className="w-full">
              <LogOut className="size-4" />
              Log out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
