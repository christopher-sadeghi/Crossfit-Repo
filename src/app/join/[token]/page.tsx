import { LogOut } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

import { logout } from "../../(auth)/actions";
import { acceptInvite } from "../actions";

const INVALID_INVITE = "This invite link is no longer valid. Ask your coach for a new one.";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (claims?.claims.sub) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Join your gym</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            You&apos;re signed in. Log out first to accept this invite.
          </p>
          <form action={logout}>
            <Button type="submit" variant="outline" className="w-full">
              <LogOut className="size-4" />
              Log out
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const { data: invites, error } = await supabase.rpc("get_invite", {
    p_token: token,
  });
  const invite = invites?.[0];

  if (error || !invite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invite unavailable</CardTitle>
          <CardDescription>{INVALID_INVITE}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const gym = invite.gym_name || invite.coach_full_name || "your gym";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join {gym} as {invite.athlete_first_name}</CardTitle>
        <CardDescription>Create a password to access your workouts.</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm
          action={acceptInvite}
          submitLabel="Create account"
          hidden={{ invite_token: token }}
          fields={[
            {
              name: "email",
              label: "Email",
              type: "email",
              autoComplete: "email",
              defaultValue: invite.email,
              readOnly: true,
            },
            {
              name: "password",
              label: "Password (8+ characters)",
              type: "password",
              autoComplete: "new-password",
              minLength: 8,
            },
            {
              name: "confirm",
              label: "Confirm password",
              type: "password",
              autoComplete: "new-password",
              minLength: 8,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
