"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    let lastTimeZone: string | undefined;

    function syncTimeZone() {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const encoded = encodeURIComponent(tz);
      const current = document.cookie.match(/(?:^|; )tz=([^;]*)/)?.[1];
      if (current !== encoded) {
        document.cookie = `tz=${encoded}; path=/; max-age=31536000; samesite=lax`;
      }
      const zoneChanged = lastTimeZone !== undefined && lastTimeZone !== tz;
      lastTimeZone = tz;
      if (current !== encoded || zoneChanged) router.refresh();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") syncTimeZone();
    }

    syncTimeZone();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router]);
  return null;
}
