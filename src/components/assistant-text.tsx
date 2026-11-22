import Link from "next/link";
import { assistantTextParts } from "@/lib/ai/assistant-ui";

export function AssistantText({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap break-words text-sm">
    {assistantTextParts(text).map((part, index) => part.href
      ? <Link key={index} href={part.href} className="underline underline-offset-4">{part.text}</Link>
      : <span key={index}>{part.text}</span>)}
  </div>;
}
