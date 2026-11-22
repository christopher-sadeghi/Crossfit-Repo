"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { markThreadRead } from "@/app/messages-actions";

export function ThreadLive({ athleteId, unreadKey }: { athleteId?: string; unreadKey?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);

  useEffect(() => {
    if (!athleteId || !unreadKey) return;
    let cancelled = false;
    const markRead = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await markThreadRead(athleteId);
        if (cancelled) return;
        setError(result.error ?? "");
        if (!result.error) router.refresh();
      } catch {
        if (!cancelled) setError("Couldn't mark messages read. Check your connection.");
      }
    };
    void markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", markRead); };
  }, [athleteId, unreadKey, router]);

  return error ? <p role="status" className="text-sm text-destructive">{error}</p> : null;
}
