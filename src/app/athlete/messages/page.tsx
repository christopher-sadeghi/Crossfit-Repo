import { MessageThread } from "@/components/messages/thread";
import { NotificationSettings } from "@/components/notifications/email-settings";
import Link from "next/link";
import { PushSettings } from "@/components/notifications/push-settings";

export default async function AthleteMessagesPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  return <div className="grid gap-6"><header className="flex justify-end"><Link href="/athlete/assistant" className="text-sm font-medium underline underline-offset-4">Ask AI</Link></header><MessageThread requestedLink={link} /><NotificationSettings /><PushSettings role="athlete" /></div>;
}
