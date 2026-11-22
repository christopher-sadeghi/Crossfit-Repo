"use client";

import { useEffect, useState } from "react";
import { deletePushSubscription, hasPushSubscription, savePushCategories, savePushSubscription } from "@/app/push-actions";
import { PUSH_CATEGORIES, type PushCategory } from "@/lib/push/payload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const labels: Record<PushCategory, string> = { messages: "Messages", schedule: "Schedule & WOD changes", updates: "Coach approvals & reports", reminders: "Reminders", alerts: "Coach alerts" };

export function PushToggle({ publicKey, role, initialCategories, loadError }: { publicKey: string; role: "coach" | "athlete"; initialCategories: string[]; loadError: boolean }) {
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(false);
  const [iosInstall, setIosInstall] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState(initialCategories);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIosInstall(ios && !matchMedia("(display-mode: standalone)").matches && !(navigator as Navigator & { standalone?: boolean }).standalone);
    const support = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(support);
    if (!support) { setReady(true); return; }
    setDenied(Notification.permission === "denied");
    (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          const result = await hasPushSubscription(sub.endpoint);
          if (active) { setEnabled(result.enabled); if (result.error) setMessage(result.error); }
        }
      } catch { if (active) setMessage("Couldn't check push notifications. Please reload."); }
      finally { if (active) setReady(true); }
    })();
    return () => { active = false; };
  }, []);

  async function toggle() {
    setBusy(true); setMessage("");
    try {
      if (!enabled) {
        const permission = await Notification.requestPermission();
        setDenied(permission === "denied");
        if (permission !== "granted") return;
      }
      const registration = await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      if (enabled) {
        if (sub) {
          const result = await deletePushSubscription(sub.endpoint);
          if (result.error) throw new Error(result.error);
          if (!await sub.unsubscribe()) throw new Error("Couldn't unsubscribe this device. Try again.");
        }
        setEnabled(false);
      } else {
        if (!sub) {
          const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
          sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (char) => char.charCodeAt(0)) });
        }
        const result = await savePushSubscription({ ...sub.toJSON(), userAgent: navigator.userAgent.slice(0, 500) });
        if (result.error) throw new Error(result.error);
        setEnabled(true);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Couldn't update push notifications."); }
    finally { setBusy(false); }
  }

  async function changeCategory(category: PushCategory, checked: boolean) {
    const next = checked ? [...categories, category] : categories.filter((value) => value !== category);
    setBusy(true); setMessage("");
    try {
      const result = await savePushCategories(next);
      if (result.error) setMessage(result.error);
      else { setCategories(next); setMessage("Push preferences saved."); }
    } catch { setMessage("Couldn't save push preferences. Please try again."); }
    finally { setBusy(false); }
  }

  return <Card><CardHeader><CardTitle>Push notifications</CardTitle></CardHeader><CardContent className="grid gap-4">
    <p className="text-sm text-muted-foreground">Receive notifications on this device, even when the app is closed.</p>
    {iosInstall ? <p className="text-sm">On iPhone or iPad, tap Share → Add to Home Screen, then open the installed app to enable push (iOS 16.4+).</p> : !ready ? <p className="text-sm">Checking this device…</p> : !supported ? <p className="text-sm">This browser doesn&apos;t support push notifications.</p> : <Button className="w-fit" disabled={busy || (denied && !enabled)} onClick={toggle}>{enabled ? "Disable on this device" : "Enable on this device"}</Button>}
    {denied && <p className="text-sm">Notifications are blocked. Allow notifications for this site in your browser settings, then reload.</p>}
    {loadError ? <p role="alert">Couldn&apos;t load preferences. Reload before changing categories.</p> : <fieldset disabled={busy} className="grid gap-2"><legend className="mb-2 text-sm font-medium">Notify me about</legend>{PUSH_CATEGORIES.filter((category) => role === "athlete" || ["messages", "alerts"].includes(category)).map((category) => <label key={category} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={categories.includes(category)} onChange={(event) => changeCategory(category, event.target.checked)} />{labels[category]}</label>)}</fieldset>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </CardContent></Card>;
}
