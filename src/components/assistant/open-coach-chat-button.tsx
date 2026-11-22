"use client";

export function OpenCoachChatButton() {
  return (
    <button type="button" className="cursor-pointer underline underline-offset-4" onClick={() => window.dispatchEvent(new Event("open-coach-chat"))}>
      coach chat
    </button>
  );
}
