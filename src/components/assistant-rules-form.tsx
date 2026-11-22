"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveAssistantSettings, saveAthleteAssistantRules } from "@/app/(app)/settings/assistant-actions";
import type { Tables } from "@/lib/supabase/database.types";

export type AssistantSettingsValues = Pick<Tables<"coaches">, "assistant_rules" | "assistant_training" | "assistant_nutrition" | "assistant_recovery" | "athlete_ai_daily_limit">;

export function AssistantRulesForm({ settings, athleteId }: { settings: AssistantSettingsValues; athleteId?: string }) {
  const [state, action, pending] = useActionState(athleteId ? saveAthleteAssistantRules.bind(null, athleteId) : saveAssistantSettings, {});
  const id = useId();
  return <form action={action} className="grid gap-4">
    <fieldset disabled={pending} className="grid min-w-0 gap-4">
      <div className="grid gap-2">
        <Label htmlFor={id}>{athleteId ? "Extra rules for this athlete" : "Assistant rules"}</Label>
        <Textarea id={id} name="assistant_rules" maxLength={2000} defaultValue={settings.assistant_rules ?? ""} rows={5}
          placeholder={"Never suggest going above 85% without asking me\nAlways scale gymnastics for beginners\nNo nutrition advice beyond my macros"} />
        <p className="text-xs text-muted-foreground">{athleteId ? "These add to or override your general coaching rules for this athlete. Safety and disabled topics still apply." : "Athletes see answers within these rules. You can read every chat on the athlete page."}</p>
      </div>
      {!athleteId && <>
        <div className="flex flex-wrap gap-5">
          {(["training", "nutrition", "recovery"] as const).map((topic) => <label key={topic} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name={`assistant_${topic}`} defaultChecked={settings[`assistant_${topic}`]} className="size-4 accent-primary" />
            {topic[0].toUpperCase() + topic.slice(1)}
          </label>)}
        </div>
        <div className="grid max-w-xs gap-2">
          <Label htmlFor={`${id}-limit`}>Daily athlete message limit</Label>
          <Input id={`${id}-limit`} name="athlete_ai_daily_limit" type="number" min={1} max={200} defaultValue={settings.athlete_ai_daily_limit} required />
        </div>
      </>}
    </fieldset>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state.message && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
    <Button type="submit" className="w-fit" disabled={pending}>{pending ? "Saving…" : "Save assistant rules"}</Button>
  </form>;
}
