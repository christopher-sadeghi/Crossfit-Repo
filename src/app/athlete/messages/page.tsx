import { MessageThread } from "@/components/messages/thread";
import { NotificationSettings } from "@/components/notifications/email-settings";

export default async function AthleteMessagesPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  return <div className="grid gap-6"><MessageThread requestedLink={link} /><NotificationSettings /></div>;
}
