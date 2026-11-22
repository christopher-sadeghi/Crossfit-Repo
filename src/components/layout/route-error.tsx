"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function RouteError({ reset }: { reset: () => void }) {
  const router = useRouter();
  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <Card role="alert" className="mx-auto mt-4 max-w-md">
      <CardHeader>
        <h1 className="text-lg font-semibold">We couldn&apos;t load this page</h1>
        <p className="text-muted-foreground">Try again. If it still doesn&apos;t load, come back in a moment.</p>
      </CardHeader>
      <CardContent><Button type="button" onClick={retry}>Try again</Button></CardContent>
    </Card>
  );
}
