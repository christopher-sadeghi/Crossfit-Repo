"use client";

import { useActionState, useState, type FormEvent } from "react";
import { Check, Copy, Mail, UserRoundCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/units";
import type { FormState } from "@/lib/auth/form-state";

import {
  createAthleteInvite,
  revokeAthleteAccess,
  revokeAthleteInvite,
} from "./actions";

type Invite = {
  email: string;
  created_at: string;
};

type Props = {
  athleteId: string;
  email: string | null;
  userId: string | null;
  invite: Invite | null;
  inviteUrl: string | null;
};

function ActionMessage({ state }: { state: FormState }) {
  if (state.error) {
    return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  }
  if (state.message) {
    return <p role="status" className="text-sm text-muted-foreground">{state.message}</p>;
  }
  return null;
}

export function AthleteAccessCard({
  athleteId,
  email,
  userId,
  invite,
  inviteUrl,
}: Props) {
  const [inviteState, inviteAction, inviting] = useActionState(createAthleteInvite, {});
  const [pendingState, pendingAction, revokingInvite] = useActionState(revokeAthleteInvite, {});
  const [accessState, accessAction, revokingAccess] = useActionState(revokeAthleteAccess, {});
  const [copied, setCopied] = useState(false);
  const [lastAction, setLastAction] = useState<"invite" | "pending" | "access" | null>(null);
  const joined = Boolean(userId);
  const activeInviteUrl = inviteUrl;
  const inviteEmail = invite?.email ?? email;
  const mailto = activeInviteUrl && inviteEmail
    ? `mailto:${inviteEmail}?subject=${encodeURIComponent("Your FitCoach AI invite")}&body=${encodeURIComponent(`Your coach invited you to access your workouts. Use this link to create your account:\n\n${activeInviteUrl}`)}`
    : null;

  async function copyInvite() {
    if (!activeInviteUrl) return;
    try {
      await navigator.clipboard.writeText(activeInviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function confirmRevoke(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Revoke this athlete's app access? They will no longer be able to see their workouts.")) {
      event.preventDefault();
    } else {
      setLastAction("access");
    }
  }

  return (
    <Card className="md:col-span-3">
      <CardHeader>
        <CardTitle>App access</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Status:</span>
          {joined ? (
            <Badge><UserRoundCheck /> Joined</Badge>
          ) : invite ? (
            <Badge variant="secondary">Invited on {formatDate(invite.created_at)}</Badge>
          ) : (
            <span>Not invited</span>
          )}
        </div>

        {activeInviteUrl && mailto && !joined && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">Invite link</p>
            <p className="break-all rounded-md bg-muted px-3 py-2 text-xs">{activeInviteUrl}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={copyInvite}>
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button asChild variant="outline">
                <a href={mailto}><Mail /> Open email</a>
              </Button>
            </div>
          </div>
        )}

        {!joined && (
          <form action={inviteAction} onSubmit={() => setLastAction("invite")} className="grid gap-2">
            <input type="hidden" name="athlete_id" value={athleteId} />
            {!email?.trim() && (
              <p className="text-sm text-muted-foreground">
                Add an email to the athlete profile before sending an invite.
              </p>
            )}
            <Button type="submit" disabled={inviting || !email?.trim()} className="w-fit">
              {inviting ? "Please wait…" : invite ? "Resend invite" : "Invite"}
            </Button>
          </form>
        )}

        {invite && !joined && (
          <form action={pendingAction} onSubmit={() => setLastAction("pending")} className="grid gap-2">
            <input type="hidden" name="athlete_id" value={athleteId} />
            <Button
              type="submit"
              variant="ghost"
              disabled={revokingInvite}
              className="w-fit text-muted-foreground"
            >
              Revoke invite
            </Button>
          </form>
        )}

        {joined && (
          <form action={accessAction} onSubmit={confirmRevoke} className="grid gap-2">
            <input type="hidden" name="athlete_id" value={athleteId} />
            <Button type="submit" variant="destructive" disabled={revokingAccess} className="w-fit">
              {revokingAccess ? "Please wait…" : "Revoke access"}
            </Button>
          </form>
        )}

        {lastAction === "invite" && <ActionMessage state={inviteState} />}
        {lastAction === "pending" && <ActionMessage state={pendingState} />}
        {lastAction === "access" && <ActionMessage state={accessState} />}
      </CardContent>
    </Card>
  );
}
