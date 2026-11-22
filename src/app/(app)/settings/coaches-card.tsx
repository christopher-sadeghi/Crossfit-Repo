import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { siteOrigin } from "@/lib/email/origin";

import { CopyCoachInviteLink, InviteCoachForm, RemoveGymCoachButton, RevokeCoachInviteButton } from "./coach-management-forms";

export async function CoachesCard() {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return null;
  const supabase = await createClient();
  const { data: coaches, error } = await supabase.from("coaches")
    .select("id, full_name, gym_id")
    .eq("gym_id", viewer.gymId)
    .order("full_name");
  const { data: invites } = viewer.role === "owner"
    ? await supabase.from("coach_invites").select("id, email, token, created_at")
      .eq("gym_id", viewer.gymId).is("accepted_at", null).is("revoked_at", null).order("created_at")
    : { data: [] };

  return <Card className="mt-6">
    <CardHeader>
      <h2 className="font-semibold">Coaches</h2>
      <p className="text-sm text-muted-foreground">Coaches in your gym share athlete and training data.</p>
    </CardHeader>
    <CardContent className="grid gap-5">
      {error ? <p role="alert" className="text-sm text-destructive">Couldn&apos;t load gym coaches.</p> :
        <ul className="divide-y">
          {(coaches ?? []).map((coach) => {
            const owner = coach.id === coach.gym_id;
            const name = coach.full_name || "Coach";
            return <li key={coach.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{name}</span>
                <Badge variant={owner ? "default" : "secondary"}>{owner ? "Owner" : "Coach"}</Badge>
              </div>
              {viewer.role === "owner" && !owner && <RemoveGymCoachButton id={coach.id} name={name} />}
            </li>;
          })}
        </ul>}
      {viewer.role === "owner" && <>
        <section className="grid gap-3 border-t pt-4">
          <h3 className="font-medium">Invite a coach</h3>
          <InviteCoachForm />
        </section>
        {!!invites?.length && <section className="grid gap-2 border-t pt-4">
          <h3 className="font-medium">Pending invitations</h3>
          <ul className="divide-y">
            {invites.map((invite) => <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="grid gap-1">
                <span className="font-medium">{invite.email}</span>
                <span className="text-xs text-muted-foreground">Invited {invite.created_at ? new Date(invite.created_at).toLocaleDateString() : "recently"}</span>
              </div>
              <div className="flex items-center gap-1">
                <CopyCoachInviteLink link={`${siteOrigin()}/join-coach/${invite.token}`} />
                <RevokeCoachInviteButton id={invite.id} />
              </div>
            </li>)}
          </ul>
        </section>}
      </>}
    </CardContent>
  </Card>;
}
