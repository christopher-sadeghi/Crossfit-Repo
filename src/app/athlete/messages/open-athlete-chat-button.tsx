"use client";

import { Button } from "@/components/ui/button";

export function OpenAthleteChatButton() {
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto px-0 text-sm font-medium underline underline-offset-4"
      onClick={() => window.dispatchEvent(new CustomEvent("open-athlete-chat"))}
    >
      Ask AI
    </Button>
  );
}
