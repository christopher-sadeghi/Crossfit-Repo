"use client";

import { useEffect } from "react";

export function ScrollIntoView({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [targetId]);
  return null;
}
