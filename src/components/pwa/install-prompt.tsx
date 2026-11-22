"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallPrompt() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem("fitcoach-install-dismissed") === "1"; } catch {}
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone || dismissed) return;
    setHidden(false);
    setIos((/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent));
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const installed = () => { setHidden(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", installed); };
  }, []);
  if (hidden || (!ios && !prompt)) return null;
  return <aside aria-label="Install FitCoach AI" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border bg-background p-4 text-sm">
    <p>{ios ? "Install FitCoach AI: Tap Share → Add to Home Screen." : "Keep your training a tap away."}</p>
    {prompt && <Button size="sm" onClick={async () => { try { await prompt.prompt(); await prompt.userChoice; } catch {} finally { setPrompt(null); } }}>Install app</Button>}
    <Button size="sm" variant="ghost" onClick={() => { setHidden(true); try { localStorage.setItem("fitcoach-install-dismissed", "1"); } catch {} }}>Dismiss</Button>
  </aside>;
}
