"use client";

import { useState, useTransition } from "react";

import type { ProgressResult } from "@/app/progress-actions";

export function useProgressAction() {
  const [result, setResult] = useState<ProgressResult>({});
  const [pending, startTransition] = useTransition();
  function run(work: () => Promise<ProgressResult>) {
    setResult({});
    startTransition(async () => {
      try { setResult(await work()); }
      catch { setResult({ error: "Couldn't complete this request. Check your connection and try again." }); }
    });
  }
  return { result, pending, run };
}

export function ActionFeedback({ result }: { result: ProgressResult }) {
  return <div aria-live="polite">
    {result.error && <p role="alert" className="text-sm text-destructive">{result.error}</p>}
    {result.message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{result.message}</p>}
  </div>;
}
