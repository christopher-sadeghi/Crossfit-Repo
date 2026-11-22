"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function DemoDataSection({ children }: { children: ReactNode }) {
  const section = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.location.hash === "#demo-data") section.current?.scrollIntoView();
  }, []);

  return <div id="demo-data" ref={section} className="mt-6">{children}</div>;
}
