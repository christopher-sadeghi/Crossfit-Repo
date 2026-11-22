import { LogOut } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

import { logout } from "../../(auth)/actions";
import { joinCoach } from "./actions";

const INVALID_INVITE = "This coach invitation is no longer valid. Ask the gym owner for a new link.";

export default async function JoinCoachPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims.sub) return <Card>
    <CardHeader><CardTitle>Join as a coach</CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      <p className="text-sm text-muted-foreground">You&apos;re signed in. Log out first to create your invited coach account.</p>
      <form action={logout}><Button type="submit" variant="outline" className="w-full"><LogOut className="size-4" />Log out</Button></form>
    </CardContent>
  </Card>;

  const { data: invites, error } = await supabase.rpc("get_coach_invite", { p_token: token });
  const invite = invites?.[0];
  if (error || !invite?.usable || !invite.email) return <Card>
    <CardHeader><CardTitle>Invitation unavailable</CardTitle><CardDescription>{INVALID_INVITE}</CardDescription></CardHeader>
  </Card>;

  return <Card>
    <CardHeader>
      <CardTitle>Join {invite.gym_name || "this gym"} as a coach</CardTitle>
      <CardDescription>Create a new coach account. Existing accounts cannot be merged into a gym invitation.</CardDescription>
    </CardHeader>
    <CardContent>
      <AuthForm
        action={joinCoach}
        submitLabel="Create coach account"
        hidden={{ invite_token: token }}
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email", defaultValue: invite.email, readOnly: true },
          { name: "full_name", label: "Your name", autoComplete: "name" },
          { name: "password", label: "Password (8+ characters)", type: "password", autoComplete: "new-password", minLength: 8 },
        ]}
      />
    </CardContent>
  </Card>;
}
