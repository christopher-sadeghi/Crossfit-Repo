"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { loadDemoData } from "./demo-actions";

export function DemoDataCard({ hasAthletes }: { hasAthletes: boolean }) {
  const [state, formAction, pending] = useActionState(loadDemoData, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demo data</CardTitle>
        <CardDescription>
          Loads 12 sample athletes, an 8-week program, 6 weeks of results, weigh-ins, food logs,
          macro targets and goals.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form
          action={formAction}
          onSubmit={(e) => {
            if (
              hasAthletes &&
              !confirm("This deletes all your athletes, programs and logs, then reloads the demo. Continue?")
            ) {
              e.preventDefault();
            }
          }}
        >
          {/* Not name="reset": that would shadow HTMLFormElement.reset(), which React calls after the action. */}
          <input type="hidden" name="mode" value={hasAthletes ? "reset" : "load"} />
          <Button type="submit" variant={hasAthletes ? "destructive" : "default"} disabled={pending}>
            {pending ? "Loading…" : hasAthletes ? "Reset demo" : "Load demo data"}
          </Button>
        </form>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="text-sm text-muted-foreground">
            {state.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
