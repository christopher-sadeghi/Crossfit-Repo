"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Detector = { detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

export function BarcodeScanner({ onCode, pending }: { onCode: (code: string) => void; pending: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const controls = useRef<{ stop(): void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const stop = useCallback(() => {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (timer.current) clearTimeout(timer.current);
    if (video.current) video.current.srcObject = null;
  }, []);
  useEffect(() => stop, [stop]);

  async function start() {
    stop();
    const run = generation.current;
    setError("");
    setActive(true);
    const detected = (code: string) => {
      if (generation.current !== run || !/^\d{8,14}$/.test(code)) return;
      stop();
      setActive(false);
      onCode(code);
    };
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (generation.current !== run) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const element = video.current;
      if (!element) { stop(); return; }
      element.srcObject = media;
      await element.play();
      if (generation.current !== run) return;
      const NativeDetector = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      let detector: Detector | null = null;
      if (NativeDetector) {
        try { detector = new NativeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }); } catch { /* Use the cross-browser decoder below. */ }
      }
      if (detector) {
        const native = detector;
        const scan = async () => {
          if (generation.current !== run) return;
          try {
            const codes = await native.detect(element);
            const code = codes.find(c => /^\d{8,14}$/.test(c.rawValue));
            if (code) { detected(code.rawValue); return; }
          } catch {
            if (generation.current !== run) return;
            stop(); setActive(false); setError("Couldn't read the camera. Try again or enter the barcode below."); return;
          }
          if (generation.current === run) timer.current = setTimeout(scan, 250);
        };
        void scan();
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (generation.current !== run) return;
        const reader = new BrowserMultiFormatReader();
        const scanner = await reader.decodeFromStream(media, element, result => { if (result) detected(result.getText()); });
        if (generation.current !== run) scanner.stop();
        else controls.current = scanner;
      }
    } catch (cause) {
      if (generation.current !== run) return;
      stop(); setActive(false);
      setError(cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError")
        ? "Camera permission was denied. Allow camera access in your browser, or enter the barcode below."
        : "No camera is available, or it couldn't be started. Use HTTPS and check camera access, or enter the barcode below.");
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      <p className="text-sm text-muted-foreground">Point the camera at a packaged food&apos;s barcode.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={active || pending} onClick={() => void start()}>Start camera</Button>
        {active && <Button type="button" variant="outline" onClick={() => { stop(); setActive(false); }}>Stop camera</Button>}
      </div>
      <video ref={video} muted playsInline aria-label="Barcode camera preview" className={active ? "aspect-video w-full rounded-lg bg-black object-cover" : "hidden"} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <form className="grid gap-2" onSubmit={event => {
        event.preventDefault();
        stop(); setActive(false);
        onCode(String(new FormData(event.currentTarget).get("barcode") ?? ""));
      }}>
        <Label htmlFor="food-barcode">Barcode number</Label>
        <Input id="food-barcode" name="barcode" inputMode="numeric" pattern="[0-9]{8,14}" minLength={8} maxLength={14} required placeholder="8–14 digits" />
        <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">{pending ? "Looking up…" : "Look up"}</Button>
      </form>
    </div>
  );
}
