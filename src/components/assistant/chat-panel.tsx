"use client";

import { Bot, Send, X } from "lucide-react";
import { cn } from "cn";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ChatLauncher({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <Button onClick={onClick} className={cn("gap-2 rounded-full shadow-lg", className)} size="lg">
      <Bot className="size-5" />
      {label}
    </Button>
  );
}

export function ChatPanelShell({
  title,
  subtitle,
  actions,
  onClose,
  ariaLabel,
  footer,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  onClose: () => void;
  ariaLabel: string;
  footer: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      aria-label={ariaLabel}
      className={cn("fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l bg-background shadow-xl", className)}
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Bot className="size-5" />
        <div className="flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {actions}
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close chat">
          <X className="size-4" />
        </Button>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
      <footer className="border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</footer>
    </aside>
  );
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  inputDisabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  inputDisabled?: boolean;
}) {
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSend();
      }}
    >
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!disabled) onSend();
          }
        }}
        placeholder={placeholder}
        maxLength={2000}
        rows={2}
        className="max-h-40 resize-none"
        aria-label="Message"
        disabled={inputDisabled}
      />
      <Button type="submit" size="icon" disabled={disabled || !value.trim()} aria-label="Send">
        <Send className="size-4" />
      </Button>
    </form>
  );
}

export function ChatBubble({ role, children }: { role: "user" | "assistant"; children: ReactNode }) {
  return (
    <div className={role === "user" ? "flex justify-end" : ""}>
      <div
        className={
          role === "user"
            ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground"
            : "space-y-2 text-sm"
        }
      >
        {children}
      </div>
    </div>
  );
}
