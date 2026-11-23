"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return <Button className="waiver-print-hidden" variant="outline" onClick={() => window.print()}>Print</Button>;
}
